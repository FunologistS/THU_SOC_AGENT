#!/usr/bin/env node
/**
 * concept_synthesize.mjs
 *
 * Purpose:
 *   Conceptual synthesis on top of clustering results, focused on sociology.
 *   Input: meta_clusters_latest.md + briefing_latest.md + summaries_latest.md
 *   Output:
 *     - outputs/<topic>/05_report/report_YYYYMMDD_vN.md + report_latest.md
 *     - (optional) outputs/<topic>/05_report/concept_appendix_YYYYMMDD_vN.md + concept_appendix_latest.md
 *
 * Usage:
 *   node .claude/skills/literature-synthesis/scripts/concept_synthesize_gpt.mjs <topic> \
 *     [--meta-clusters outputs/<topic>/04_meta/meta_clusters_latest.md] \
 *     [--briefing outputs/<topic>/04_meta/briefing_latest.md] \
 *     [--summaries outputs/<topic>/03_summaries/summaries_latest.md] \
 *     [--date YYYYMMDD] [--v N] \
 *     [--model gpt-5.2] \
 *     [--no-appendix] \
 *     [--max-papers-per-cluster 999] \
 *     [--only-clusters "0,3,5"] \
 *     [--dry-run] [--debug] [--test-api]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OpenAI } from 'openai'; // 引入 OpenAI 客户端

// 获取项目根目录
const __dirname = path.dirname(fileURLToPath(import.meta.url));
let PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
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

function toInt(x, fallback = 0) {
  const s = String(x ?? "").trim();
  if (s === "") return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

/** ---------------- Parse meta_clusters_latest.md ---------------- **/

function parseMetaClusters(md) {
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
          outOfScope: line.includes("⚑out_of_scope"),
        });
      }
    }
    clusters.push({ clusterId, theme, papers });
  }
  return clusters.sort((a, b) => a.clusterId - b.clusterId);
}

/** ---------------- Parse summaries_latest.md ---------------- **/

/** 从作者串中提取仅姓氏：如 "Claudia Padovani, Elena Pavan" -> ["Padovani","Pavan"]；"Lauren Alfrey France Winddance Twine"（无逗号）按 2+3 词两位作者 -> ["Alfrey","Twine"]。 */
function authorsStrToSurnames(authorsStr) {
  const raw = authorsStr != null ? String(authorsStr).trim() : "";
  if (!raw) return [];
  const segments = raw
    .split(/[,，、;；]|\s+and\s+|\s*&\s*/gi)
    .map((s) => s.replace(/\s+et\s+al\.?/gi, " ").trim())
    .filter(Boolean);
  if (segments.length > 1) {
    return segments.map((seg) => {
      const words = seg.split(/\s+/).filter(Boolean);
      return words.length ? words[words.length - 1] : seg;
    });
  }
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length <= 2) return words.length ? [words[words.length - 1]] : [];
  if (words.length === 3) return [words[2]]; // 单作者 "First Middle Last"
  // 无逗号且 ≥4 词：偶数按“名 姓”对取 1,3,5...；奇数假定最后一位 3 词（名 中 姓），其余各 2 词
  if (words.length % 2 === 0) {
    const surnames = [];
    for (let i = 1; i < words.length; i += 2) surnames.push(words[i]);
    return surnames;
  }
  const n = words.length;
  const surnames = [];
  for (let i = 0; i < (n - 3) / 2; i++) surnames.push(words[1 + 2 * i]);
  surnames.push(words[n - 1]);
  return surnames;
}

/** 将作者串转为文内引用格式（仅姓氏）：如 "Claudia Padovani, Elena Pavan" -> "(Padovani & Pavan, Year)"；3人及以上为 "(First et al., Year)"。 */
function toInTextCitation(authorsStr, year) {
  const y =
    year != null && Number.isFinite(Number(year)) && String(year).trim() !== ""
      ? String(Number(year))
      : "?";
  const surnames = authorsStrToSurnames(authorsStr);
  if (surnames.length === 0) return `(Unknown, ${y})`;
  if (surnames.length === 1) return `(${surnames[0]}, ${y})`;
  if (surnames.length === 2) return `(${surnames[0]} & ${surnames[1]}, ${y})`;
  return `(${surnames[0]} et al., ${y})`;
}

function parseSummariesMarkdown(md) {
  const blocks = md
    .split(/\n---\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const items = [];
  for (const b of blocks) {
    const h = b.match(/^##\s+(\d+)\.\s+(.*)\s+\((\d{4})\)\s*$/m);
    if (!h) continue;
    const paperId = parseInt(h[1], 10);
    if (!Number.isFinite(paperId) || paperId < 1) continue;
    const title = h[2].trim();
    const year = Number(h[3]);

    const journal = (b.match(/^- Journal:\s*(.*)$/m)?.[1] ?? "").trim();
    const doi = (b.match(/^- DOI:\s*(.*)$/m)?.[1] ?? "").trim();

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

    // 作者：若 summaries 中有 - Author(s): 或 **Author(s)**: 则解析，否则用 Unknown
    const authors = (
      b.match(/^- Author\(s\):\s*(.+)$/m)?.[1] ??
      b.match(/^- Authors?:\s*(.+)$/m)?.[1] ??
      b.match(/\*\*Author\(s\)\*\*:\s*(.+?)(?:\n|$)/m)?.[1] ??
      b.match(/\*\*Authors?\*\*:\s*(.+?)(?:\n|$)/m)?.[1] ??
      ""
    ).trim() || null;

    // 参考文献格式：Authors, Year
    const citation = authors ? `${authors}, ${year}` : `Unknown, ${year}`;
    // 文内引用格式：(Author & Author, Year)，用于正文与可点击链接
    const inTextCitation = toInTextCitation(authors || null, year);

    items.push({
      id: paperId,
      title,
      year,
      journal,
      doi,
      rq,
      data_material: data,
      method,
      findings,
      contribution,
      abstract,
      citation,
      inTextCitation,
    });
  }
  return items;
}

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

/** ---------------- OpenAI Client ---------------- **/

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://api.gptsapi.net/v1",
});

// OpenAI 调用函数
async function openAIChat(messages, modelOverride) {
  const model = modelOverride || "gpt-5.2";
  try {
    const response = await client.chat.completions.create({
      model,
      messages,
    });
    return response.choices[0].message.content;
  } catch (error) {
    console.error("[concept_synthesis] OpenAI API 错误:", error?.message || error);
    return null;
  }
}

/** 将报告中可能出现的（全名, 年份）统一替换为（姓氏, 年份）文内引用格式 */
function normalizeReportCitations(text, papers) {
  if (!text || !Array.isArray(papers) || papers.length === 0) return text;
  const replacements = [];
  for (const p of papers) {
    const citation = p.citation != null ? String(p.citation).trim() : "";
    const inText = p.inTextCitation != null ? String(p.inTextCitation).trim() : "";
    const year = p.year != null ? String(Number(p.year)) : "";
    if (!citation || !inText || !year) continue;
    const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pat1 = new RegExp(`[（(]\\s*${escape(citation)}\\s*[,，]\\s*${year}\\s*[）)]`, "g");
    replacements.push({ pattern: pat1, canonical: inText });
    const citationNoComma = citation.replace(/[,，、;；]\s*/g, " ").trim();
    if (citationNoComma !== citation) {
      const pat2 = new RegExp(`[（(]\\s*${escape(citationNoComma)}\\s*[,，]\\s*${year}\\s*[）)]`, "g");
      replacements.push({ pattern: pat2, canonical: inText });
    }
  }
  replacements.sort((a, b) => (b.pattern.source.length - a.pattern.source.length));
  let out = text;
  for (const { pattern, canonical } of replacements) out = out.replace(pattern, canonical);
  return out;
}

/** ---------------- Prompt builders ---------------- **/

function formatCardForLLM(c) {
  const parts = [];
  const citeLabel = c.inTextCitation || (c.citation ? `(${c.citation})` : "");
  parts.push(`**${c.title || "（无标题）"}** (${c.year || "?"}) — ${c.journal || "（未指定）"}`);
  if (citeLabel) parts.push(`- 文内引用（链接文字必须仅用此格式，勿用全名）：${citeLabel}（ID=${c.id}，用于链接锚点 #paper-${c.id}）`);
  if (c.rq) parts.push(`- 问题：${clamp(c.rq, 400)}`);
  if (c.data_material) parts.push(`- 数据/材料：${clamp(c.data_material, 200)}`);
  if (c.method) parts.push(`- 方法：${clamp(c.method, 200)}`);
  if (c.findings) parts.push(`- 主要发现：${clamp(c.findings, 500)}`);
  if (c.contribution) parts.push(`- 贡献：${clamp(c.contribution, 300)}`);
  if (c.abstract && !c.findings) parts.push(`- 摘要：${clamp(c.abstract, 400)}`);
  return parts.join("\n");
}

function buildClusterPrompt({ topic, clusterId, clusterSize, cards, wantAppendix, theme, briefingSnippet }) {
  const system = `
你是一个细心的社会学研究助手。 
你只能使用提供的论文卡片（标题/年份/期刊/摘要/结构化字段）。 
不要编造作者、理论、数据集、样本大小、国家或摘要中没有明确提到的发现。
如果某个细节缺失，请说“在摘要/总结中未指定”或类似表达。
你的写作风格应简洁、实质性强，适合研究简报，并融入社会学理论与视角。

**引用纪律（必须遵守）**：简报中的每条论述若来自某一篇或某几篇具体文献，必须“有理有据”——在该句或该要点末尾（或句中合适处）标明文内引用。不得出现“有研究指出”“部分文献认为”等无引用支撑的概括句；每条基于文献的论断都要带引用。
**可点击引用（必须遵守）**：正文与各小节中出现的每一处文内引用，都必须写成 Markdown 可点击链接形式，以便读者点击查看文献详情。格式为 [(Surname & Surname, Year)](#paper-<id>) 或 [(Surname et al., Year)](#paper-<id>)（仅用姓氏：2人用 A & B，3人及以上用第一作者姓氏+et al.），其中 <id> 为该文献在下方卡片中的 ID。**链接文字必须与下方卡片中的「文内引用」完全一致（仅姓氏），严禁使用作者全名。**多篇时每篇单独成链接，例如：[(Padovani & Pavan, 2016)](#paper-1)；[(Almanza-Alcalde et al., 2021)](#paper-2)。**链接文字已含括号，不要在链接外再加括号**，即只写 [...] 形式，不要写成（[(…)](#paper-id)）。不要写纯括号 (Author, Year)，一律用带 #paper-id 的链接形式。
`;

  const context = [
    theme ? `该聚类的主题标签：${theme}` : null,
    briefingSnippet ? `\n研究图谱简报摘要：\n${clamp(briefingSnippet, 800)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const user = `
任务：为主题"${topic}"，聚类=${clusterId}（n=${clusterSize}）创建一个聚类级别的“简报小评审”。每条基于具体文献的论述都必须带文内引用，做到有理有据。
${context ? `\n背景信息：\n${context}\n` : ""}

你必须输出严格的Markdown格式，结构如下：

## <主题标题（概念性、理论友好；此处不应有聚类ID）>

**该主题的主要内容（2-4句话）：**
- 每句若概括自具体文献，须在句末用可点击引用标注，格式为 [(姓氏 & 姓氏, Year)](#paper-<id>) 或 [(姓氏 et al., Year)](#paper-<id>)。例：该主题涉及数字劳动与平台治理 [(Padovani & Pavan, 2016)](#paper-1)；[(Almanza-Alcalde et al., 2021)](#paper-2)。链接外不要再加括号。

**主要的视角/视角框架（2-5个要点）：**
- 每个要点若来自某篇/某几篇文献，须用可点击引用标明（仅姓氏），如 [(Smith, 2025)](#paper-3)；[(Chen & Wang, 2026)](#paper-4)。不要写（[(…)](#paper-id)）这种双层括号。

**研究方法（基于卡片中的“数据/材料”与“方法”字段，2-4个要点）：**
- 归纳时注明来源，用可点击引用，如：多采用问卷调查与访谈 [(Author, Year)](#paper-<id>)。不同方法对应不同文献时分别写成多个链接。

**重复的主张/结论（2-5个要点）：**
- 每个结论必须注明来自哪篇/哪几篇，用可点击引用（仅姓氏，链接外不加括号），如：……[(Smith, 2025)](#paper-1)；[(Padovani & Pavan, 2016)](#paper-2)。不得写无引用的“研究指出……”。

**从摘要中可见的限制（2-5个要点）：**
- 只使用可从摘要推断的内容，并用可点击引用标注 [(Author, Year)](#paper-<id>)。采用软性表述：“通常”“倾向于”“摘要中很少提到……”。

**研究空白/下一步研究方向（2-5个要点）：**
- 若某条基于某篇文献的局限或建议，用可点击引用标注该文献 [(Author, Year)](#paper-<id>)。

### 该主题的论文（每篇论文一句话总结；必须覆盖所有论文；按年份降序排列；使用可点击引用）
- [(文内引用)](#paper-<id>): <基于卡片的一句总结>

${wantAppendix ? `
### 附录：论文卡片（每篇论文3行；必须覆盖所有论文；使用文内引用）
- **<标题> (<年份>) — <期刊>** （(文内引用)）
  - 问题：...
  - 方法：...
  - 主要主张：...
` : ""}

约束条件：
- 主题标题必须是概念性的（例如：“AI作为地缘政治基础设施”），而不是仅仅列举的项目。
- 一句话总结不超过35个字。
- 如果期刊缺失，则不应显示。
- 如果你找不到方法/数据/主张，应该说“未指定”而不是猜测。
- **引用规范（强制）**：文内引用仅用姓氏（2人：A & B；3人及以上：第一作者 et al.）；用可点击链接标注 [(Surname, Year)](#paper-<id>)，多篇时每篇单独一个链接；链接外不要加括号，不要写（[(…)](#paper-id)）。无引用支撑的文献性论断不允许出现。
- **该主题的论文**列表中，每行必须使用可点击引用：[(文内引用)](#paper-<id>): 一句话总结，其中 <id> 为卡片中的 ID（数字）。

现在，这里是论文卡片（每篇论文一个；文内引用与 ID 用于生成符合学术规范的引用与链接）：
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
    `Usage: node concept_synthesize.mjs <topic> [--meta-clusters path] [--briefing path] [--summaries path] [--date YYYYMMDD] [--v N] [--model MODEL] [--no-appendix] [--exclude-out-of-scope] [--max-papers-per-cluster N] [--only-clusters "0,3,5"] [--dry-run] [--debug] [--test-api]`
  );
  process.exit(1);
}

const date = String(args.date || todayYYYYMMDD());
const debug = !!args.debug;
const dryRun = !!args["dry-run"];
const testApi = !!args["test-api"];
const v = args.v ? Number(args.v) : null;

const model = args.model || "gpt-5.2"; // 默认使用 GPT-5.2，可通过 --model 覆盖

const apiKey = process.env.OPENAI_API_KEY || ""; // 从环境变量读取 API 密钥

// --test-api：仅测试 API 连通性，不读文件、不写报告；执行后必须 exit，主流程放在 else 中
if (testApi) {
  if (!apiKey) {
    console.error("[concept_synthesis] --test-api 需要设置 OPENAI_API_KEY");
    process.exit(1);
  }
  console.log("[concept_synthesis] 正在测试 OpenAI API (model:", model, ")...");
  openAIChat(
    [{ role: "user", content: "回复：OK" }],
    model
  )
    .then((content) => {
      if (content == null) {
        console.error("[concept_synthesis] API 返回为空");
        process.exit(1);
      }
      console.log("[concept_synthesis] API 调用成功，回复长度:", content.length);
      console.log("[concept_synthesis] 回复内容:", content.slice(0, 200));
      process.exit(0);
    })
    .catch((err) => {
      console.error("[concept_synthesis] API 调用失败:", err?.message || err);
      process.exit(1);
    });
} else {
// ========== 以下为正常流程（非 --test-api）==========
const metaClustersPath =
  args["meta-clusters"] || path.join(PROJECT_ROOT, "outputs", topic, "04_meta", "meta_clusters_latest.md");
const briefingInputPath =
  args.briefing || path.join(PROJECT_ROOT, "outputs", topic, "04_meta", "briefing_latest.md");
const summariesPath =
  args.summaries || path.join(PROJECT_ROOT, "outputs", topic, "03_summaries", "summaries_latest.md");
const wantAppendix = args["no-appendix"] !== true;
const excludeOutOfScope = !!args["exclude-out-of-scope"];
const maxPapersPerCluster = toInt(args["max-papers-per-cluster"], 999);
const onlyClustersRaw = args["only-clusters"] ? String(args["only-clusters"]) : "";
const onlyClusters = onlyClustersRaw
  ? onlyClustersRaw.split(",").map((s) => toInt(s.trim(), -1)).filter((n) => n >= 0)
  : null;

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
if (excludeOutOfScope) {
  let excluded = 0;
  for (const c of clusters) {
    const before = c.papers.length;
    c.papers = c.papers.filter((p) => !p.outOfScope);
    excluded += before - c.papers.length;
  }
  const inScope = clusters.reduce((acc, c) => acc + c.papers.length, 0);
  console.log(
    `[concept_synthesis] 已排除质检疑似跑题论文 ${excluded} 篇，仅使用优质论文 ${inScope} 篇进行综述（--exclude-out-of-scope）`
  );
}
const totalPapersFromClusters = clusters.reduce((acc, c) => acc + c.papers.length, 0);
if (totalPapersFromClusters === 0) {
  console.error(`[concept_synthesis] ERROR: meta_clusters 中未解析到任何论文行。`);
  process.exit(1);
}

const briefingText = readText(briefingInputPath);
const summaryItems = parseSummariesMarkdown(readText(summariesPath));
const summaryByTitle = buildIndexByTitle(summaryItems);
const summaryByDoi = buildIndexByDoi(summaryItems);

const clusterData = [];
let totalJoined = 0;
for (const c of clusters) {
  const joined = [];
  for (const p of c.papers) {
    let sum = summaryByTitle.get(normalizeTitleKey(p.title));
    if (!sum && p.doi) sum = summaryByDoi.get(normalizeDoi(p.doi));
    joined.push({
      ...p,
      paperId: sum?.id ?? null,
      rq: sum?.rq ?? "",
      data_material: sum?.data_material ?? "",
      method: sum?.method ?? "",
      findings: sum?.findings ?? "",
      contribution: sum?.contribution ?? "",
      abstract: sum?.abstract ?? "",
      citation: sum?.citation ?? "",
      inTextCitation: sum?.inTextCitation ?? (sum?.citation ? `(${sum.citation})` : ""),
    });
    if (sum) totalJoined++;
  }
  clusterData.push({ cid: String(c.clusterId), theme: c.theme, papers: joined });
}

const toProcess = onlyClusters
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
  process.exit(0);
}

const briefingParts = [];
briefingParts.push(`# 概念简报：${topic}`);
briefingParts.push(`模型：OpenAI ${model}`);
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
    id: p.paperId != null ? p.paperId : idx + 1,
    title: p.title,
    year: p.year,
    journal: p.journal,
    rq: p.rq,
    data_material: p.data_material,
    method: p.method,
    findings: p.findings,
    contribution: p.contribution,
    abstract: p.abstract,
    citation: p.citation,
    inTextCitation: p.inTextCitation || (p.citation ? `(${p.citation})` : ""),
  }));

  if (cards.length === 0) {
    console.warn(`[concept_synthesis] Cluster ${cid}: 0 papers, skipping OpenAI call`);
    briefingParts.push(`## Cluster ${cid}\n\n（该聚类无论文）`);
    continue;
  }

  console.log(`[concept_synthesis] Cluster ${cid} (${cards.length} papers) -> OpenAI...`);
  const { messages } = buildClusterPrompt({
    topic,
    clusterId: cid,
    clusterSize: cards.length,
    cards,
    wantAppendix,
    theme: entry.theme ?? "",
    briefingSnippet: briefingText,
  });

  const content = await openAIChat(messages, model);
  if (content == null) {
    console.error(`[concept_synthesis] Cluster ${cid} API 返回为空，已写入占位`);
    briefingParts.push(`## Cluster ${cid}\n\n（调用失败，请检查 API 或重试）`);
  } else {
    briefingParts.push(content);
  }
  if (i < toProcess.length - 1) briefingParts.push(``);
}

const version = v ?? nextVersion(outDir, "report", date);
const briefingPath = path.join(outDir, `report_${date}_v${version}.md`);
const rawReport = briefingParts.join("\n\n");
const allPapersForNorm = toProcess.flatMap((d) => d.papers);
const normalizedReport = normalizeReportCitations(rawReport, allPapersForNorm);
writeText(briefingPath, normalizedReport);
writeLatest(path.join(outDir, "report_latest.md"), briefingPath);

console.log(`[concept_synthesis] Wrote: ${briefingPath}`);
}
