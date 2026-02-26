import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import YAML from "yaml";
import { getRepoRoot, isSafeTopic } from "@/lib/pathSafety";
import type { JobType } from "@/app/types";

const DEFAULT_JOURNALS_PATH = path.join(
  getRepoRoot(),
  ".claude/skills/journal-catalog/references/system/journals.yml"
);

const REPO_ROOT = getRepoRoot();

const JOB_WHITELIST: Record<
  JobType,
  { script: string; scriptGpt?: string; args: (topic: string, extra?: string[], journalsPath?: string) => string[] }
> = {
  journal_search: {
    script: path.join(REPO_ROOT, ".claude/skills/journal-search/scripts/run.mjs"),
    args: (topic, _extra?, journalsPath?: string) => [
      topic,
      "--journals",
      journalsPath || DEFAULT_JOURNALS_PATH,
    ],
  },
  filter: {
    script: path.join(REPO_ROOT, ".claude/skills/paper-summarize/scripts/filter.mjs"),
    args: (topic) => [topic, "--no-interactive"],
  },
  paper_summarize: {
    script: path.join(
      REPO_ROOT,
      ".claude/skills/paper-summarize/scripts/filter_then_summarize.mjs"
    ),
    args: (topic) => [topic],
  },
  synthesize: {
    script: path.join(
      REPO_ROOT,
      ".claude/skills/literature-synthesis/scripts/synthesize.mjs"
    ),
    args: (topic) => [topic],
  },
  concept_synthesize: {
    script: path.join(
      REPO_ROOT,
      ".claude/skills/literature-synthesis/scripts/concept_synthesize_glm.mjs"
    ),
    scriptGpt: path.join(
      REPO_ROOT,
      ".claude/skills/literature-synthesis/scripts/concept_synthesize_gpt.mjs"
    ),
    args: (topic) => [topic],
  },
  upload_and_writing: {
    script: path.join(
      REPO_ROOT,
      ".claude/skills/paper-writing/scripts/upload_then_writing.mjs"
    ),
    args: (topic, extra) => [
      topic,
      (extra && extra[0]) || "academic",
      (extra && extra[1]) || "",
      (extra && extra[2]) || "gpt",
    ],
  },
  writing_under_style: {
    script: path.join(
      REPO_ROOT,
      ".claude/skills/paper-writing/scripts/writing_under_style.mjs"
    ),
    args: (topic, extra) =>
      extra?.[0] ? [topic, "--user-prompt", String(extra[0])] : [topic],
  },
};

function ensureJobsDir(): string {
  const appDir = process.cwd();
  const uiDir = path.dirname(appDir);
  const tmpDir = path.join(uiDir, ".tmp", "jobs");
  fs.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

function normalizeIssn(issn: string): string {
  return String(issn ?? "").replace(/\D/g, "");
}

/** POST /api/run — { jobType, topic, args?, journalSourceIds?, journalIssns? }，白名单执行，返回 jobId */
export async function POST(request: Request) {
  let body: {
    jobType?: string;
    topic?: string;
    args?: string[];
    journalSourceIds?: string[];
    journalIssns?: string[];
    conceptSynthesizeModel?: "gpt" | "glm";
    writingModel?: "gpt" | "glm";
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { jobType, topic, args: extraArgsRaw, journalSourceIds, journalIssns, conceptSynthesizeModel, writingModel } = body;
  let extraArgs = Array.isArray(extraArgsRaw) ? [...extraArgsRaw] : undefined;
  if (jobType === "upload_and_writing" && writingModel) {
    extraArgs = extraArgs ?? [];
    if (extraArgs.length < 3) extraArgs.push(writingModel);
    else extraArgs[2] = writingModel;
  }
  if (!jobType || !topic) {
    return NextResponse.json(
      { error: "Missing jobType or topic" },
      { status: 400 }
    );
  }

  if (!isSafeTopic(topic)) {
    return NextResponse.json(
      { error: "Invalid topic: only [a-z0-9_/-] allowed" },
      { status: 400 }
    );
  }

  const config = JOB_WHITELIST[jobType as JobType];
  if (!config) {
    return NextResponse.json(
      { error: "Unknown jobType. Allowed: journal_search, filter, paper_summarize, synthesize, concept_synthesize, upload_and_writing, writing_under_style" },
      { status: 400 }
    );
  }

  const scriptToRun =
    jobType === "concept_synthesize" && conceptSynthesizeModel === "gpt" && config.scriptGpt
      ? config.scriptGpt
      : config.script;

  if (!fs.existsSync(scriptToRun)) {
    return NextResponse.json(
      { error: `Script not found: ${scriptToRun}` },
      { status: 500 }
    );
  }

  if (jobType === "upload_and_writing") {
    const style = Array.isArray(extraArgs) && extraArgs[0] ? String(extraArgs[0]).toLowerCase() : "";
    const savedFileName = Array.isArray(extraArgs) && extraArgs[1] ? String(extraArgs[1]) : "";
    if (style !== "academic" && style !== "colloquial") {
      return NextResponse.json(
        { error: "upload_and_writing 需要 args: [academic|colloquial, savedFileName]" },
        { status: 400 }
      );
    }
    if (!savedFileName || !/^[a-z0-9_.-]+$/i.test(savedFileName)) {
      return NextResponse.json(
        { error: "savedFileName 格式无效（仅允许字母数字、点、下划线、连字符）" },
        { status: 400 }
      );
    }
  }

  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const jobsDir = ensureJobsDir();
  const logPath = path.join(jobsDir, `${jobId}.log`);

  let args: string[];
  if (jobType === "journal_search") {
    if (!fs.existsSync(DEFAULT_JOURNALS_PATH)) {
      return NextResponse.json({ error: "Default journals.yml not found" }, { status: 500 });
    }
    const parsed = YAML.parse(fs.readFileSync(DEFAULT_JOURNALS_PATH, "utf-8"));
    const all = Array.isArray(parsed?.journals) ? parsed.journals : [];

    let filtered: typeof all;
    if (Array.isArray(journalSourceIds) && journalSourceIds.length > 0) {
      const idSet = new Set(journalSourceIds.map((id) => String(id).trim()).filter(Boolean));
      filtered = all.filter((j: { openalex_source_id?: string }) => {
        const id = String(j.openalex_source_id || "").trim();
        return id && idSet.has(id);
      });
    } else if (Array.isArray(journalIssns) && journalIssns.length > 0) {
      const issnSet = new Set(
        journalIssns.map((s) => normalizeIssn(s)).filter((s) => s.length >= 8)
      );
      filtered = all.filter((j: { issn?: string; eissn?: string; openalex_source_id?: string }) => {
        const id = String(j.openalex_source_id || "").trim();
        if (!id) return false;
        const ni = normalizeIssn(String(j.issn ?? ""));
        const ne = normalizeIssn(String(j.eissn ?? ""));
        return issnSet.has(ni) || issnSet.has(ne);
      });
    } else {
      filtered = all;
    }

    const tempPath = path.join(path.dirname(jobsDir), "journals", `journals_${jobId}.yml`);
    fs.mkdirSync(path.dirname(tempPath), { recursive: true });
    fs.writeFileSync(tempPath, YAML.stringify({ journals: filtered }), "utf-8");
    args = config.args(topic, extraArgs, tempPath) as string[];
  } else {
    args = config.args(topic, extraArgs) as string[];
  }

  if (jobType === "writing_under_style" && writingModel === "glm") {
    args.push("--provider", "glm");
  }

  const child = spawn("node", [scriptToRun, ...args], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });

  const logStream = fs.createWriteStream(logPath, { flags: "a" });
  const write = (chunk: Buffer, prefix: string) => {
    logStream.write(prefix + chunk.toString());
  };
  child.stdout?.on("data", (chunk) => write(chunk, ""));
  child.stderr?.on("data", (chunk) => write(chunk, "[stderr] "));

  child.on("close", (code, signal) => {
    logStream.write(`\n[exit] code=${code} signal=${signal}\n`);
    logStream.end();
    const metaPath = path.join(jobsDir, `${jobId}.meta.json`);
    fs.writeFileSync(
      metaPath,
      JSON.stringify({ exitCode: code ?? null, signal: signal ?? null })
    );
  });

  child.on("error", (err) => {
    logStream.write(`[error] ${err.message}\n`);
    logStream.end();
  });

  return NextResponse.json({ jobId });
}
