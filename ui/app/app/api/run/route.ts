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
    script: path.join(REPO_ROOT, ".claude/skills/paper-summarize/scripts/2_clean.mjs"),
    args: (topic) => [topic, "--no-interactive", "--no-relevance-gate"],
  },
  paper_summarize: {
    script: path.join(
      REPO_ROOT,
      ".claude/skills/paper-summarize/scripts/1_command.mjs"
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
      ".claude/skills/paper-writing/scripts/5_upload_then_writing.mjs"
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
      ".claude/skills/paper-writing/scripts/6_transcribe_submit_then_writing.mjs"
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
      ".claude/skills/paper-writing/scripts/3_writing_under_style.mjs"
    ),
    args: (topic, extra) =>
      extra?.[0] ? [topic, "--user-prompt", String(extra[0])] : [topic],
  },
};

function normalizeIssn(issn: string): string {
  return String(issn ?? "").replace(/\D/g, "");
}

/** 8 位 ISSN 格式化为 XXXX-XXXX 供 OpenAlex filter 使用 */
function issnToHyphenForm(issn: string): string {
  const n = normalizeIssn(issn);
  if (n.length !== 8) return n;
  return `${n.slice(0, 4)}-${n.slice(4)}`;
}

/** 用 OpenAlex API 按 ISSN 解析 source，返回 id 与 display_name；失败返回 null */
async function resolveOpenAlexSourceByIssn(issnHyphen: string): Promise<{ id: string; display_name: string } | null> {
  try {
    const url = `https://api.openalex.org/sources?filter=issn:${encodeURIComponent(issnHyphen)}&per-page=1`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: Array<{ id?: string; display_name?: string }> };
    const first = data?.results?.[0];
    if (!first?.id) return null;
    return { id: String(first.id), display_name: String(first.display_name ?? "") };
  } catch {
    return null;
  }
}

/**
 * 一键综述「使用默认写作样例」时的风格文件列表：
 * - 学术型(zh/en)：references/academic 下的默认样例 + references/submit/academic 下全部 .md
 * - 通俗型：references/colloquial 下默认样例 + references/submit/colloquial 下全部 .md
 * 脚本 3_writing_under_style.mjs 会按此列表依次在 references/<style> 与 references/submit/<style> 中解析文件。
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
    conceptSynthesizeModel?: string;
    writingModel?: string;
    qualityOnly?: boolean;
    searchMode?: "strict" | "relaxed";
    yearFrom?: number;
    yearTo?: number;
    /** 多检索词（可选），第一项为基准词；逻辑由 searchLogics 指定，searchLogics[i] 连接 terms[i] 与 terms[i+1] */
    searchTerms?: string[];
    /** 词间逻辑数组，长度 = searchTerms.length - 1 */
    searchLogics?: ("and" | "or")[];
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
    /** 文献简报：每聚类最多使用论文篇数，不传则默认 40，避免单次请求过大超时 */
    conceptMaxPapersPerCluster?: number;
    /** 一键综述：05_report 下输入文件名，如 report_latest.md */
    writingReportFile?: string;
    /** 一键综述：是否在合并后做段落衔接优化（可选，默认 false） */
    writingCoherencePass?: boolean;
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
    searchTerms,
    searchLogics,
    abstractFallback,
    synthesizeK,
    writingStyle,
    writingPrompt,
    synthesizeInPath,
    conceptMetaClusters,
    conceptBriefing,
    conceptSummaries,
    conceptMaxPapersPerCluster,
    writingReportFile,
    writingCoherencePass,
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
    const terms = Array.isArray(searchTerms) ? searchTerms.map((t) => String(t).trim()).filter(Boolean) : [];
    if (terms.length > 0) {
      extraArgs = [...extraArgs, "--terms", terms.join(",")];
      const logics = Array.isArray(searchLogics) && searchLogics.length === terms.length - 1
        ? searchLogics.map((l) => (l === "and" ? "and" : "or"))
        : [];
      if (logics.length > 0) extraArgs = [...extraArgs, "--logic", logics.join(",")];
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
  if (jobType === "concept_synthesize" && conceptSynthesizeModel && conceptSynthesizeModel !== "gpt") {
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
  if (jobType === "concept_synthesize") {
    const n = conceptMaxPapersPerCluster != null && Number.isInteger(conceptMaxPapersPerCluster) && conceptMaxPapersPerCluster >= 1
      ? Math.min(999, conceptMaxPapersPerCluster)
      : 40;
    extraArgs = [...(extraArgs ?? []), "--max-papers-per-cluster", String(n)];
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

  /** P0: 一键综述前若存在 report 且 chunks 不存在或为空，先执行 compact_report */
  if (jobType === "writing_under_style") {
    const reportDir = path.join(REPO_ROOT, "outputs", topic, "05_report");
    const reportFileName =
      writingReportFile && safeFileName(writingReportFile) ? writingReportFile.trim() : "report_latest.md";
    const reportPath = path.join(reportDir, reportFileName);
    const chunksDir = path.join(reportDir, "chunks");
    const reportExists =
      fs.existsSync(reportPath) && fs.statSync(reportPath).isFile();
    let chunksMissingOrEmpty = true;
    try {
      if (fs.existsSync(chunksDir) && fs.statSync(chunksDir).isDirectory()) {
        chunksMissingOrEmpty = !fs.readdirSync(chunksDir).some((f: string) => f.endsWith(".md"));
      }
    } catch {
      // leave true
    }
    if (reportExists && chunksMissingOrEmpty) {
      const compactScript = path.join(
        REPO_ROOT,
        ".claude/skills/paper-writing/scripts/2_compact_report.mjs"
      );
      if (!fs.existsSync(compactScript)) {
        return NextResponse.json(
          { error: "2_compact_report.mjs not found (P0 pre-step)" },
          { status: 500 }
        );
      }
      try {
        await new Promise<void>((resolve, reject) => {
          const compact = spawn("node", [compactScript, topic, "--in", reportPath], {
            cwd: REPO_ROOT,
            stdio: ["ignore", "pipe", "pipe"],
          });
          let errLog = "";
          compact.stderr?.on("data", (d: Buffer) => {
            errLog += d.toString();
          });
          compact.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`compact_report exited ${code}: ${errLog.slice(0, 500)}`));
          });
          compact.on("error", reject);
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json(
          { error: `一键综述前切块失败: ${msg}` },
          { status: 500 }
        );
      }
    }
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
      // 请求的 ISSN 中未在 journals.yml 里匹配到的，用 OpenAlex 按 ISSN 解析 source，补进临时期刊表，使检索本数与界面一致（如 WOS Anthropology 93 本）
      const covered = new Set<string>();
      for (const j of filtered as { issn?: string; eissn?: string }[]) {
        const ni = normalizeIssn(String(j.issn ?? ""));
        const ne = normalizeIssn(String(j.eissn ?? ""));
        if (ni.length >= 8) covered.add(ni);
        if (ne.length >= 8) covered.add(ne);
      }
      const missing = [...issnSet].filter((s) => !covered.has(s));
      for (const issn of missing) {
        const hyphen = issnToHyphenForm(issn);
        const source = await resolveOpenAlexSourceByIssn(hyphen);
        if (source?.id) {
          (filtered as { openalex_source_id?: string; name?: string; short?: string; issn?: string }[]).push({
            openalex_source_id: source.id,
            name: source.display_name || "",
            short: "",
            issn: hyphen,
            eissn: "",
            site: "",
            notes: "",
          });
        }
        await new Promise((r) => setTimeout(r, 180));
      }
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
  if (jobType === "writing_under_style" && writingCoherencePass === true) {
    args.push("--coherence-pass");
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
