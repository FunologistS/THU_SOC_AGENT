#!/usr/bin/env node
/**
 * concept_synthesis.mjs
 *
 * Purpose:
 *   Conceptual synthesis on top of clustering results, focused on sociology.
 *   Input: meta_clusters_latest.md + briefing_latest.md + summaries_latest.md
 *   Output:
 *     - outputs/<topic>/05_report/report_YYYYMMDD_vN.md + report_latest.md
 *     - (optional) outputs/<topic>/05_report/concept_appendix_YYYYMMDD_vN.md + concept_appendix_latest.md
 *
 * Usage:
 *   node .claude/skills/literature-synthesis/scripts/concept_synthesis.mjs <topic> \
 *     [--meta-clusters outputs/<topic>/04_meta/meta_clusters_latest.md] \
 *     [--briefing outputs/<topic>/04_meta/briefing_latest.md] \
 *     [--summaries outputs/<topic>/03_summaries/summaries_latest.md] \
 *     [--date YYYYMMDD] [--v N] \
 *     [--model glm-4.7-flash] \
 *     [--no-appendix] \
 *     [--max-papers-per-cluster 999] \
 *     [--only-clusters "0,3,5"] \
 *     [--dry-run] [--debug] [--test-api]
 *
 * Env:
 *   ZHIPU_API_KEY   (required unless --dry-run)
 *   ZHIPU_MODEL     (optional default model)
 *   ZHIPU_BASE_URL  (optional, default https://open.bigmodel.cn/api/paas/v4)
 *
 * Notes:
 *   - Zhipu/BigModel uses an OpenAI-compatible-ish /chat/completions endpoint:
 *     POST {BASE_URL}/chat/completions with Authorization: Bearer <API_KEY>.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Project root: scripts/ -> literature-synthesis/ -> skills/ -> .claude/ -> project
let PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
// Fallback: if outputs/ doesn't exist, try cwd (e.g. when run from Cursor with different cwd)
if (!fs.existsSync(path.join(PROJECT_ROOT, "outputs"))) {
  const cwdRoot = process.cwd();
  if (fs.existsSync(path.join(cwdRoot, "outputs"))) {
    PROJECT_ROOT = cwdRoot;
  }
}

/** ---------------- CLI ---------------- **/

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        args[k] = true;
      } else {
        args[k] = next;
        i++;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readText(p) {
  let s = fs.readFileSync(p, "utf-8");
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1); // strip BOM
  return s;
}

function writeText(p, s) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, s, "utf-8");
}

function todayYYYYMMDD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function escapeReg(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nextVersion(outDir, prefix, date) {
  if (!fs.existsSync(outDir)) return 1;
  const re = new RegExp(`^${escapeReg(prefix)}_${date}_v(\\d+)\\.`);
  let maxV = 0;
  for (const f of fs.readdirSync(outDir)) {
    const m = f.match(re);
    if (m) maxV = Math.max(maxV, Number(m[1]));
  }
  return maxV + 1;
}

function writeLatest(latestPath, contentPath) {
  writeText(latestPath, readText(contentPath));
}

function clamp(s, n) {
  const t = String(s ?? "").trim();
  if (!t) return "";
  if (t.length <= n) return t;
  return t.slice(0, n).trim() + "…";
}

/** ---------------- Parse meta_clusters_latest.md ---------------- **/

function parseMetaClusters(md) {
  // Format: ## Cluster N (M papers)\n**Theme: ...**\n- **Title (Year)** - Journal | DOI: ...
  const clusters = [];
  const clusterRe = /^## Cluster (\d+)\s+\((\d+)\s+papers?\)\s*$/;
  const themeRe = /^\*\*Theme:\s*(.+?)\*\*\s*$/;
  const paperLineRe = /^- \*\*(.+)\s+\((\d{4})\)\*\*\s*-\s*([^|]+?)(?:\s*\|\s*(.+))?/;

  const sections = md.split(/(?=^## Cluster \d+)/m).filter(Boolean);
  for (const sec of sections) {
    const lines = sec.split(/\r?\n|\r/).map((l) => l.trim());
    const cm = lines[0]?.match(clusterRe);
    if (!cm) continue;
    const clusterId = Number(cm[1]);
    let theme = "";
    const papers = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const themeM = line.match(themeRe);
      if (themeM) theme = themeM[1].trim();
      const pm = line.match(paperLineRe);
      if (pm) {
        const rest = pm[4] || "";
        const doiM = rest.match(/DOI:\s*(https?:\/\/[^\s]+)/i) || rest.match(/(10\.\d{4,}\/[^\s]+)/);
        papers.push({
          title: pm[1].trim(),
          year: Number(pm[2]),
          journal: pm[3].trim(),
          doi: doiM ? (doiM[1] || doiM[0]).trim() : "",
        });
      }
    }
    clusters.push({ clusterId, theme, papers });
  }
  return clusters.sort((a, b) => a.clusterId - b.clusterId);
}

/** ---------------- Parse summaries_latest.md ---------------- **/

function parseSummariesMarkdown(md) {
  const blocks = md
    .split(/\n---\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const items = [];
  for (const b of blocks) {
    const h = b.match(/^##\s+\d+\.\s+(.*)\s+\((\d{4})\)\s*$/m);
    if (!h) continue;

    const title = h[1].trim();
    const year = Number(h[2]);

    const journal = (b.match(/^- Journal:\s*(.*)$/m)?.[1] ?? "").trim();
    const doi = (b.match(/^- DOI:\s*(.*)$/m)?.[1] ?? "").trim();
    const openalex = (b.match(/^- OpenAlex:\s*(.*)$/m)?.[1] ?? "").trim();

    const rq =
      (b.match(/\*\*Research question\*\*:\s*([\s\S]*?)(?:\n\n|\n\*\*Data \/ material\*\*|$)/m)?.[1] ??
        "").trim();

    const data =
      (b.match(/\*\*Data \/ material\*\*:\s*([\s\S]*?)(?:\n\n|\n\*\*Method\*\*|$)/m)?.[1] ??
        "").trim();

    const method =
      (b.match(/\*\*Method\*\*:\s*([\s\S]*?)(?:\n\n|\n\*\*Key findings|$)/m)?.[1] ??
        "").trim();

    const findings =
      (b.match(/\*\*Key findings.*?\*\*:\s*([\s\S]*?)(?:\n\n|\n\*\*Contribution\*\*|$)/m)?.[1] ??
        "").trim();

    const contribution =
      (b.match(/\*\*Contribution\*\*:\s*([\s\S]*?)(?:\n\n|$)/m)?.[1] ?? "").trim();

    const abstract =
      (b.match(/\*\*Abstract\*\*:\s*([\s\S]*?)(?:\n\n|\n\*\*Research question\*\*|$)/m)?.[1] ??
        "").trim();

    const manual = /\[MANUAL\]/.test(b);

    items.push({
      title,
      year,
      journal,
      doi,
      openalex,
      rq,
      data_material: data,
      method,
      findings,
      contribution,
      abstract,
      manual,
    });
  }
  return items;
}

/** ---------------- Join meta_table + summaries ---------------- **/

function normalizeTitleKey(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

function normalizeDoi(s) {
  const t = String(s || "").trim().toLowerCase();
  const m = t.match(/10\.\d{4,}\/[^\s]+/);
  return m ? m[0] : t || "";
}

function buildIndexByTitle(items) {
  const m = new Map();
  for (const it of items) {
    const k = normalizeTitleKey(it.title);
    if (!k) continue;
    const prev = m.get(k);
    if (!prev) m.set(k, it);
    else {
      const score = (x) =>
        [x.abstract, x.rq, x.data_material, x.method, x.findings, x.contribution]
          .map((v) => String(v || "").length)
          .reduce((a, b) => a + b, 0);
      if (score(it) > score(prev)) m.set(k, it);
    }
  }
  return m;
}

function buildIndexByDoi(items) {
  const m = new Map();
  for (const it of items) {
    const k = normalizeDoi(it.doi);
    if (!k) continue;
    m.set(k, it);
  }
  return m;
}

function toInt(x, fallback = 0) {
  const s = String(x ?? "").trim();
  if (s === "") return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

/** ---------------- LLM Client (Zhipu / BigModel Chat Completions) ---------------- **/

async function zhipuChat({
  apiKey,
  baseURL,
  model,
  messages,
  temperature = 0.2,
  maxTokens = 1800,
  retries = 3,
  debug = false,
  timeoutMs = 120000,
}) {
  // Docs show: POST /paas/v4/chat/completions, Authorization: Bearer <API_KEY>
  const url = `${String(baseURL).replace(/\/+$/, "")}/chat/completions`;

  let lastErr = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);

    try {
      const resp = await fetch(url, {
        method: "POST",
        signal: ac.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Accept-Language": "zh-CN,zh",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          stream: false,
        }),
      });

      if (!resp.ok) {
        const txt = await resp.text();
        // 内容审核/敏感词 (400 + 1301)：不抛错，返回占位并继续下一个聚类
        if (resp.status === 400 && (txt.includes("1301") || txt.includes("contentFilter") || txt.includes("敏感"))) {
          console.warn(`[concept_synthesis] 本聚类因内容审核被拒绝，已跳过并写入占位，继续下一聚类`);
          return "## 本聚类\n\n（因接口内容审核未通过，未生成摘要。可稍后重试或调整聚类内论文表述后重跑。）";
        }
        throw new Error(`ZHIPU HTTP ${resp.status}: ${txt.slice(0, 800)}`);
      }

      const data = await resp.json();
      const firstChoice = data?.choices?.[0];
      let content = firstChoice?.message?.content ?? "";

      if (debug) {
        console.log(`[zhipu] ok, content chars=${content.length}`);
      }
      // 接口返回空内容时用占位，避免报告缺段（智谱有时 200 但 content 为空，相当于软拒绝）
      if (typeof content !== "string" || content.trim().length < 50) {
        const finishReason = firstChoice?.finish_reason ?? "unknown";
        console.warn(`[concept_synthesis] 本聚类接口返回内容为空或过短（finish_reason=${finishReason}），已写入占位并继续`);
        if (debug && firstChoice) {
          console.warn(`[zhipu] choices[0] keys: ${Object.keys(firstChoice).join(", ")}`);
        }
        content = "## 本聚类\n\n（接口返回内容为空，未生成摘要。可稍后重试。）";
      }
      return content;
    } catch (e) {
      lastErr = e;
      const waitMs = 700 * attempt;
      if (debug) console.warn(`[zhipu] attempt ${attempt} failed: ${e?.message || e}. wait ${waitMs}ms`);
      await new Promise((r) => setTimeout(r, waitMs));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr || new Error("Zhipu call failed");
}

/** ---------------- Card formatting ---------------- **/

function formatCardForLLM(c) {
  const parts = [];
  parts.push(`(ID=${c.id}) **${c.title || "（无标题）"}** (${c.year || "?"}) — ${c.journal || "（未指定）"}`);
  if (c.rq) parts.push(`- 问题：${clamp(c.rq, 400)}`);
  if (c.data_material) parts.push(`- 数据/材料：${clamp(c.data_material, 200)}`);
  if (c.method) parts.push(`- 方法：${clamp(c.method, 200)}`);
  if (c.findings) parts.push(`- 主要发现：${clamp(c.findings, 500)}`);
  if (c.contribution) parts.push(`- 贡献：${clamp(c.contribution, 300)}`);
  if (c.abstract && !c.findings) parts.push(`- 摘要：${clamp(c.abstract, 400)}`);
  return parts.join("\n");
}

/** ---------------- Prompt builders ---------------- **/

function buildClusterPrompt({ topic, clusterId, clusterSize, cards, wantAppendix, theme, briefingSnippet }) {
  const system = `
你是一个细心的社会学研究助手。 
你只能使用提供的论文卡片（标题/年份/期刊/摘要/结构化字段）。 
不要编造作者、理论、数据集、样本大小、国家或摘要中没有明确提到的发现。
如果某个细节缺失，请说“在摘要/总结中未指定”或类似表达。
你的写作风格应简洁、实质性强，适合研究简报，并融入社会学理论与视角。
`;

  const context = [
    theme ? `该聚类的主题标签：${theme}` : null,
    briefingSnippet ? `\n研究图谱简报摘要：\n${clamp(briefingSnippet, 800)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const user = `
任务：为主题"${topic}"，聚类=${clusterId}（n=${clusterSize}）创建一个聚类级别的“简报小评审”。
${context ? `\n背景信息：\n${context}\n` : ""}

你必须输出严格的Markdown格式，结构如下：

## <主题标题（概念性、理论友好；此处不应有聚类ID）>

**该主题的主要内容（2-4句话）：**
- 该主题涉及[插入关键社会学理论，例如：数字劳动、不确定性再生产等]及其对[特定社会学方面]的影响。

**主要的视角/视角框架（2-5个要点）：**
- 使用的理论：[例如：劳动过程理论、SCOT、数字二重性等]
- 关键视角：[例如：社会经济影响、技术决定论与产品决定论等]

**重复的主张/结论（2-5个要点）：**
- 研究常常指出[插入常见的结论]。
- [插入论文中反复出现的主题]。

**从摘要中可见的限制（2-5个要点）：**
- 只使用可以从摘要/总结中推断出的内容。
- 采用软性评估：“通常”，“倾向于”，“摘要中很少提到……”等。
- 不要声称你阅读了完整的文本。

**研究空白/下一步研究方向（2-5个要点）：**
- [插入基于社会学研究需求的下一步和研究空白]。

### 该主题的论文（每篇论文一句话总结；必须覆盖所有论文；按年份降序排列，标题相同的按字母顺序排列）
- (ID=<id>) **<标题> (<年份>) — <期刊>**: <基于卡片的一句总结>

${wantAppendix ? `
### 附录：论文卡片（每篇论文3行；必须覆盖所有论文）
- (ID=<id>) **<标题> (<年份>) — <期刊>**
  - 问题：...
  - 方法：...
  - 主要主张：...
` : ""}

约束条件：
- 主题标题必须是概念性的（例如：“AI作为地缘政治基础设施”），而不是仅仅列举的项目。
- 一句话总结不超过35个字。
- 如果期刊缺失，则不应显示。
- 如果你找不到方法/数据/主张，应该说“未指定”而不是猜测。

现在，这里是论文卡片（每篇论文一个）：
${cards.map((c) => `\n---\n${formatCardForLLM(c)}\n`).join("")}
`;

  return {
    messages: [
      { role: "system", content: system.trim() },
      { role: "user", content: user.trim() },
    ],
  };
}

/** ---------------- Main ---------------- **/

const args = parseArgs(process.argv);
const topic = args._[0];

if (!topic || !String(topic).trim()) {
  console.error(
    `Usage: node concept_synthesize.mjs <topic> [--meta-clusters path] [--briefing path] [--summaries path] [--date YYYYMMDD] [--v N] [--model MODEL] [--no-appendix] [--max-papers-per-cluster N] [--only-clusters "0,3,5"] [--dry-run] [--debug] [--test-api]`
  );
  process.exit(1);
}

const date = String(args.date || todayYYYYMMDD());
const debug = !!args.debug;

const model = args.model || process.env.ZHIPU_MODEL || "glm-4.7-flash";
const apiKey = process.env.ZHIPU_API_KEY || "";
const baseURL = process.env.ZHIPU_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";

const metaClustersPath =
  args["meta-clusters"] || path.join(PROJECT_ROOT, "outputs", topic, "04_meta", "meta_clusters_latest.md");
const briefingInputPath =
  args.briefing || path.join(PROJECT_ROOT, "outputs", topic, "04_meta", "briefing_latest.md");
const summariesPath =
  args.summaries || path.join(PROJECT_ROOT, "outputs", topic, "03_summaries", "summaries_latest.md");
const wantAppendix = args["no-appendix"] !== true;
const maxPapersPerCluster = toInt(args["max-papers-per-cluster"], 999);
const onlyClustersRaw = args["only-clusters"] ? String(args["only-clusters"]) : "";
const onlyClusters = onlyClustersRaw
  ? onlyClustersRaw.split(",").map((s) => toInt(s.trim(), -1)).filter((n) => n >= 0)
  : null;
const dryRun = !!args["dry-run"];
const testApi = !!args["test-api"];
const v = args.v ? Number(args.v) : null;

// 仅测试智谱 API 是否可用（不读文件、不写报告）
if (testApi) {
  const apiKey = process.env.ZHIPU_API_KEY || "";
  const baseURL = process.env.ZHIPU_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";
  const model = args.model || process.env.ZHIPU_MODEL || "glm-4.7-flash";
  if (!apiKey) {
    console.error("[concept_synthesis] --test-api 需要设置 ZHIPU_API_KEY");
    process.exit(1);
  }
  console.log("[concept_synthesis] 正在测试智谱 API...");
  zhipuChat({
    apiKey,
    baseURL,
    model,
    messages: [
      { role: "user", content: "回复：OK" },
    ],
    maxTokens: 10,
  })
    .then((content) => {
      console.log("[concept_synthesis] API 调用成功，模型回复长度:", content?.length ?? 0);
      console.log("[concept_synthesis] 回复内容:", (content || "").slice(0, 200));
      process.exit(0);
    })
    .catch((err) => {
      console.error("[concept_synthesis] API 调用失败:", err?.message || err);
      process.exit(1);
    });
} else {
// ========== 以下为正常流程（非 --test-api）==========
const outDir = path.join(PROJECT_ROOT, "outputs", topic, "05_report");
ensureDir(outDir);

if (!fs.existsSync(metaClustersPath)) {
  console.error(`[concept_synthesis] Meta clusters not found: ${metaClustersPath}`);
  process.exit(1);
}
if (!fs.existsSync(briefingInputPath)) {
  console.error(`[concept_synthesis] Briefing not found: ${briefingInputPath}`);
  process.exit(1);
}
if (!fs.existsSync(summariesPath)) {
  console.error(`[concept_synthesis] Summaries not found: ${summariesPath}`);
  process.exit(1);
}

if (debug) {
  console.log(`[concept_synthesis] PROJECT_ROOT: ${PROJECT_ROOT}`);
  console.log(`[concept_synthesis] meta_clusters: ${metaClustersPath}`);
  console.log(`[concept_synthesis] briefing: ${briefingInputPath}`);
  console.log(`[concept_synthesis] summaries: ${summariesPath}`);
}

const clusters = parseMetaClusters(readText(metaClustersPath));
const totalPapersFromClusters = clusters.reduce((acc, c) => acc + c.papers.length, 0);
if (totalPapersFromClusters === 0) {
  console.error(`[concept_synthesis] ERROR: meta_clusters 中未解析到任何论文行。`);
  console.error(`[concept_synthesis] 请确认 ${metaClustersPath} 格式为：`);
  console.error(`   ## Cluster N (M papers)\n**Theme: ...**\n- **Title (Year)** - Journal | DOI: ...`);
  const snippet = readText(metaClustersPath).slice(0, 600);
  console.error(`[concept_synthesis] 文件开头 600 字符：\n---\n${snippet}\n---`);
  process.exit(1);
}

const briefingText = readText(briefingInputPath);
const summaryItems = parseSummariesMarkdown(readText(summariesPath));
const summaryByTitle = buildIndexByTitle(summaryItems);
const summaryByDoi = buildIndexByDoi(summaryItems);

// For each cluster, join papers with summaries by title. Store in array by index so loop uses same ref.
const clusterData = [];
let totalJoined = 0;
for (const c of clusters) {
  const joined = [];
  for (const p of c.papers) {
    let sum = summaryByTitle.get(normalizeTitleKey(p.title));
    if (!sum && p.doi) sum = summaryByDoi.get(normalizeDoi(p.doi));
    joined.push({
      ...p,
      rq: sum?.rq ?? "",
      data_material: sum?.data_material ?? "",
      method: sum?.method ?? "",
      findings: sum?.findings ?? "",
      contribution: sum?.contribution ?? "",
      abstract: sum?.abstract ?? "",
    });
    if (sum) totalJoined++;
  }
  clusterData.push({ cid: String(c.clusterId), theme: c.theme, papers: joined });
}

const toProcess =
  onlyClusters
    ? clusterData.filter((d) => onlyClusters.includes(Number(d.cid)))
    : clusterData;

const papersPerCluster = toProcess.map((d) => `cluster ${d.cid}: ${d.papers.length}`).join(", ");
console.log(
  `[concept_synthesis] Loaded ${clusters.length} clusters, ${totalJoined} papers matched with summaries`
);
console.log(`[concept_synthesis] Papers per cluster: ${papersPerCluster}`);

const clustersWithPapers = toProcess.filter((d) => d.papers.length > 0);
if (clustersWithPapers.length === 0) {
  console.error(
    `[concept_synthesis] ERROR: 所有聚类论文数为 0，无法生成内容。请检查 meta_clusters 与 summaries 的标题/DOI 是否一致。`
  );
  process.exit(1);
}

if (dryRun) {
  console.log(`[concept_synthesis] DRY RUN: would process clusters ${toProcess.map((d) => d.cid).join(", ")}`);
  for (const d of toProcess) {
    const matched = d.papers.filter((p) => p.rq || p.findings || p.abstract).length;
    console.log(`  cluster ${d.cid}: ${d.papers.length} papers (${matched} with summary content)`);
  }
  process.exit(0);
}

if (!apiKey) {
  console.error("[ERROR] Missing ZHIPU_API_KEY. Please set it in your environment.");
  process.exit(1);
}

const briefingParts = [];
briefingParts.push(`# 概念简报：${topic}`);
briefingParts.push(`模型：智谱 ${model}`);
briefingParts.push(`来源：meta_clusters + briefing + summaries`);
briefingParts.push(`日期：${date}`);
briefingParts.push(`输出文件：report_${date}_v*.md / report_latest.md`);
briefingParts.push(``);

for (let i = 0; i < toProcess.length; i++) {
  const entry = toProcess[i];
  const cid = entry.cid;
  const papers = entry.papers;
  const limited = papers.slice(0, maxPapersPerCluster);

  const cards = limited.map((p, idx) => ({
    id: idx + 1,
    title: p.title,
    year: p.year,
    journal: p.journal,
    rq: p.rq,
    data_material: p.data_material,
    method: p.method,
    findings: p.findings,
    contribution: p.contribution,
    abstract: p.abstract,
  }));

  if (cards.length === 0) {
    console.warn(`[concept_synthesis] Cluster ${cid}: 0 papers, skipping LLM call`);
    briefingParts.push(`## Cluster ${cid}\n\n（该聚类无论文）`);
    continue;
  }

  console.log(`[concept_synthesis] Cluster ${cid} (${cards.length} papers) -> LLM...`);
  const { messages } = buildClusterPrompt({
    topic,
    clusterId: cid,
    clusterSize: cards.length,
    cards,
    wantAppendix,
    theme: entry.theme ?? "",
    briefingSnippet: briefingText,
  });

  const content = await zhipuChat({
    apiKey,
    baseURL,
    model,
    messages,
    debug,
    maxTokens: 4000,
    timeoutMs: 180000,
  });

  briefingParts.push(content);
  if (i < toProcess.length - 1) briefingParts.push(``);
}

const hasRealContent = briefingParts.some(
  (part) =>
    part.length > 50 &&
    !part.includes("（该聚类无论文）") &&
    !part.includes("（无匹配论文") &&
    !part.includes("（因接口内容审核") &&
    !part.includes("（接口返回内容为空")
);
if (!hasRealContent) {
  console.error(
    `[concept_synthesis] ERROR: 未生成任何聚类内容（全部为占位符）。请确认：\n  1) 在项目根目录运行，或使用绝对路径指定 --meta-clusters / --summaries\n  2) meta_clusters_latest.md 与 summaries_latest.md 为当前 topic 的版本\n  3) 使用 --debug 查看实际读取的文件路径`
  );
  process.exit(1);
}

const version = v ?? nextVersion(outDir, "report", date);
const briefingPath = path.join(outDir, `report_${date}_v${version}.md`);
writeText(briefingPath, briefingParts.join("\n\n"));
writeLatest(path.join(outDir, "report_latest.md"), briefingPath);

console.log(`[concept_synthesis] Wrote: ${briefingPath}`);
}