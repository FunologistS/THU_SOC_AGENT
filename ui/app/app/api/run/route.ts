import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import YAML from "yaml";
import { getRepoRoot, isSafeTopic } from "@/lib/pathSafety";
import { ensureJobsDir } from "@/lib/jobsDir";
import { setRunningJob, deleteRunningJob } from "@/lib/runningJobs";
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
    args: (topic, extra?, journalsPath?: string) => [
      topic,
      "--journals",
      journalsPath || DEFAULT_JOURNALS_PATH,
      ...(Array.isArray(extra) ? extra : []),
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
    args: (topic, extra) => [topic, ...(Array.isArray(extra) ? extra : [])],
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
    args: (topic, extra?: string[]) => [topic, ...(Array.isArray(extra) ? extra : [])],
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
  transcribe_submit_and_writing: {
    script: path.join(
      REPO_ROOT,
      ".claude/skills/paper-writing/scripts/transcribe_submit_then_writing.mjs"
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

function normalizeIssn(issn: string): string {
  return String(issn ?? "").replace(/\D/g, "");
}

/**
 * 一键综述「使用默认写作样例」时的风格文件列表：
 * - 学术型(zh/en)：references/academic 下的默认样例 + references/submit/academic 下全部 .md
 * - 通俗型：references/colloquial 下默认样例 + references/submit/colloquial 下全部 .md
 * 脚本 writing_under_style.mjs 会按此列表依次在 references/<style> 与 references/submit/<style> 中解析文件。
 */
const DEFAULT_ZH = "academic-2a-tsyzm.md,academic-2b-qnyj.md";
const DEFAULT_EN = "academic-1a-IR.md,academic-1b-CSR.md";
const DEFAULT_COLLOQUIAL = "colloquial-1-wwewbw.md,colloquial-2-acknowledgement.md";

function getWritingStyleList(
  writingStyle: "zh" | "en" | "colloquial",
  repoRoot: string
): string {
  const defaultList =
    writingStyle === "zh"
      ? DEFAULT_ZH
      : writingStyle === "en"
        ? DEFAULT_EN
        : DEFAULT_COLLOQUIAL;
  const submitDir =
    writingStyle === "colloquial"
      ? path.join(repoRoot, ".claude/skills/paper-writing/references/submit/colloquial")
      : path.join(repoRoot, ".claude/skills/paper-writing/references/submit/academic");
  const defaultNames = new Set(defaultList.split(",").map((s) => s.trim()));
  let extra: string[] = [];
  try {
    if (fs.existsSync(submitDir) && fs.statSync(submitDir).isDirectory()) {
      extra = fs
        .readdirSync(submitDir)
        .filter((n) => n.endsWith(".md") && !defaultNames.has(n));
    }
  } catch {
    // ignore
  }
  if (extra.length === 0) return defaultList;
  return defaultList + "," + extra.join(",");
}

/** POST /api/run — { jobType, topic, args?, journalSourceIds?, journalIssns? }，白名单执行，返回 jobId */
export async function POST(request: Request) {
  let body: {
    jobType?: string;
    topic?: string;
    args?: string[];
    journalSourceIds?: string[];
    journalIssns?: string[];
    conceptSynthesizeModel?: "gpt" | "glm" | "glm-4.7-flash" | "glm-5";
    writingModel?: "gpt" | "glm" | "glm-4.7-flash" | "glm-5";
    qualityOnly?: boolean;
    searchMode?: "strict" | "relaxed";
    yearFrom?: number;
    yearTo?: number;
    /** 检索提示词（可选），写入 01_raw 文档标注 */
    instruction?: string;
    /** 是否开启摘要补全（缺摘要时抓取出版商页 / Firecrawl） */
    abstractFallback?: boolean;
    synthesizeK?: string;
    writingStyle?: "zh" | "en" | "colloquial" | "none";
    writingPrompt?: string;
    /** 主题聚类：输入文档，相对路径如 03_summaries/summaries_latest.md */
    synthesizeInPath?: string;
    /** 荟萃分析：04_meta 下 meta_clusters 文件名、briefing 文件名；03_summaries 下 summaries 文件名（仅文件名，不含目录） */
    conceptMetaClusters?: string;
    conceptBriefing?: string;
    conceptSummaries?: string;
    /** 一键综述：05_report 下输入文件名，如 report_latest.md */
    writingReportFile?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    jobType,
    topic,
    args: extraArgsRaw,
    journalSourceIds,
    journalIssns,
    conceptSynthesizeModel: conceptSynthesizeModelRaw,
    writingModel: writingModelRaw,
    qualityOnly,
    searchMode,
    yearFrom,
    yearTo,
    instruction,
    abstractFallback,
    synthesizeK,
    writingStyle,
    writingPrompt,
    synthesizeInPath,
    conceptMetaClusters,
    conceptBriefing,
    conceptSummaries,
    writingReportFile,
  } = body;
  const conceptSynthesizeModel = conceptSynthesizeModelRaw === "glm" ? "glm-4.7-flash" : conceptSynthesizeModelRaw;
  const writingModel = writingModelRaw === "glm" ? "glm-4.7-flash" : writingModelRaw;
  let extraArgs = Array.isArray(extraArgsRaw) ? [...extraArgsRaw] : undefined;
  if (jobType === "journal_search") {
    extraArgs = extraArgs ?? [];
    if (searchMode === "strict") extraArgs = [...extraArgs, "--strict"];
    if (yearFrom != null && Number.isFinite(Number(yearFrom))) {
      extraArgs = [...extraArgs, "--year-from", String(yearFrom)];
    }
    if (yearTo != null && Number.isFinite(Number(yearTo))) {
      extraArgs = [...extraArgs, "--year-to", String(yearTo)];
    }
    if (instruction != null && String(instruction).trim() !== "") {
      extraArgs = [...extraArgs, "--instruction", String(instruction).trim()];
    }
    if (abstractFallback === true) {
      extraArgs = [...extraArgs, "--with-abstract"];
    }
  }
  if (jobType === "synthesize" && synthesizeK != null && String(synthesizeK).trim() !== "") {
    extraArgs = [...(extraArgs ?? []), "--k", String(synthesizeK).trim()];
  }
  const safeRelPath = (p: string) => /^[a-z0-9_/. \-]+$/i.test(p) && !p.includes("..");
  if (jobType === "synthesize" && synthesizeInPath && safeRelPath(synthesizeInPath)) {
    extraArgs = [...(extraArgs ?? []), "--in", path.join("outputs", topic, synthesizeInPath)];
  }
  if (jobType === "concept_synthesize" && qualityOnly === true) {
    extraArgs = [...(extraArgs ?? []), "--exclude-out-of-scope"];
  }
  if (jobType === "concept_synthesize" && (conceptSynthesizeModel === "glm-4.7-flash" || conceptSynthesizeModel === "glm-5")) {
    extraArgs = [...(extraArgs ?? []), "--model", conceptSynthesizeModel];
  }
  const safeFileName = (s: string) => typeof s === "string" && /^[a-z0-9_.\-]+\.md$/i.test(s.trim());
  if (jobType === "concept_synthesize" && conceptMetaClusters && safeFileName(conceptMetaClusters)) {
    extraArgs = [...(extraArgs ?? []), "--meta-clusters", path.join(REPO_ROOT, "outputs", topic, "04_meta", conceptMetaClusters.trim())];
  }
  if (jobType === "concept_synthesize" && conceptBriefing && safeFileName(conceptBriefing)) {
    extraArgs = [...(extraArgs ?? []), "--briefing", path.join(REPO_ROOT, "outputs", topic, "04_meta", conceptBriefing.trim())];
  }
  if (jobType === "concept_synthesize" && conceptSummaries && safeFileName(conceptSummaries)) {
    extraArgs = [...(extraArgs ?? []), "--summaries", path.join(REPO_ROOT, "outputs", topic, "03_summaries", conceptSummaries.trim())];
  }
  if (jobType === "upload_and_writing" && writingModel) {
    extraArgs = extraArgs ?? [];
    if (extraArgs.length < 3) extraArgs.push(writingModel);
    else extraArgs[2] = writingModel;
  }
  if (jobType === "transcribe_submit_and_writing" && writingModel) {
    extraArgs = extraArgs ?? [];
    if (extraArgs.length < 3) extraArgs.push(writingModel);
    else extraArgs[2] = writingModel;
  }
  if (jobType === "writing_under_style" && writingReportFile && safeFileName(writingReportFile)) {
    extraArgs = [...(extraArgs ?? []), "--report-file", writingReportFile.trim()];
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
      { error: "Unknown jobType. Allowed: journal_search, filter, paper_summarize, synthesize, concept_synthesize, upload_and_writing, transcribe_submit_and_writing, writing_under_style" },
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
  if (jobType === "transcribe_submit_and_writing") {
    const style = Array.isArray(extraArgs) && extraArgs[0] ? String(extraArgs[0]).toLowerCase() : "";
    const savedFileName = Array.isArray(extraArgs) && extraArgs[1] ? String(extraArgs[1]) : "";
    if (style !== "academic" && style !== "colloquial") {
      return NextResponse.json(
        { error: "transcribe_submit_and_writing 需要 args: [academic|colloquial, savedFileName]" },
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
  const sessionLogPath = path.join(jobsDir, "session.log");
  const sessionStream = fs.createWriteStream(sessionLogPath, { flags: "a" });
  sessionStream.write(`\n====== ${jobId} started ======\n`);

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
  } else if (jobType === "writing_under_style" && (writingStyle === "zh" || writingStyle === "en" || writingStyle === "colloquial" || writingStyle === "none")) {
    args = [topic];
    if (writingStyle === "zh") {
      args.push("--style", getWritingStyleList("zh", REPO_ROOT));
      args.push("--lang", "zh");
    } else if (writingStyle === "en") {
      args.push("--style", getWritingStyleList("en", REPO_ROOT));
      args.push("--lang", "en");
    } else if (writingStyle === "colloquial") {
      args.push("--style", getWritingStyleList("colloquial", REPO_ROOT));
      // colloquial 不传 --lang，由脚本按样本文本检测
    } else {
      args.push("--no-style");
    }
    if (writingPrompt && String(writingPrompt).trim()) {
      args.push("--user-prompt", String(writingPrompt).trim());
    }
    if (writingModel && writingModel !== "gpt") {
      args.push("--provider", "glm");
      args.push("--model", writingModel);
    }
    if (writingReportFile && safeFileName(writingReportFile)) {
      args.push("--report-file", writingReportFile.trim());
    }
  } else {
    args = config.args(topic, extraArgs) as string[];
  }

  if (jobType === "writing_under_style" && !writingStyle && writingModel && writingModel !== "gpt") {
    args.push("--provider", "glm");
    args.push("--model", writingModel);
  }
  if (jobType === "writing_under_style" && writingReportFile && safeFileName(writingReportFile)) {
    args.push("--report-file", writingReportFile.trim());
  }

  const spawnEnv =
    jobType === "writing_under_style" && (writingStyle === "zh" || writingStyle === "en")
      ? { ...process.env, REFERENCE_STYLE: "academic" }
      : jobType === "writing_under_style" && writingStyle === "colloquial"
        ? { ...process.env, REFERENCE_STYLE: "colloquial" }
        : undefined;

  const child = spawn("node", [scriptToRun, ...args], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    env: spawnEnv,
  });

  setRunningJob(jobId, child);

  const logStream = fs.createWriteStream(logPath, { flags: "a" });
  const write = (chunk: Buffer, prefix: string) => {
    const text = prefix + chunk.toString();
    logStream.write(text);
    sessionStream.write(text);
  };
  child.stdout?.on("data", (chunk) => write(chunk, ""));
  child.stderr?.on("data", (chunk) => write(chunk, "[stderr] "));

  child.on("close", (code, signal) => {
    deleteRunningJob(jobId);
    const exitLine = `\n[exit] code=${code} signal=${signal}\n`;
    logStream.write(exitLine);
    logStream.end();
    sessionStream.write(exitLine);
    sessionStream.write(`====== ${jobId} finished code=${code} ======\n`);
    sessionStream.end();
    const metaPath = path.join(jobsDir, `${jobId}.meta.json`);
    fs.writeFileSync(
      metaPath,
      JSON.stringify({ exitCode: code ?? null, signal: signal ?? null, done: true })
    );
  });

  child.on("error", (err) => {
    deleteRunningJob(jobId);
    const errLine = `[error] ${err.message}\n`;
    logStream.write(errLine);
    logStream.end();
    sessionStream.write(errLine);
    sessionStream.end();
  });

  return NextResponse.json({ jobId });
}
