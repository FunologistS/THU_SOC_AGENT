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
 *     [--model gpt-4] \
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
        });
      }
    }
    clusters.push({ clusterId, theme, papers });
  }
  return clusters.sort((a, b) => a.clusterId - b.clusterId);
}

/** ---------------- OpenAI Client ---------------- **/

// 使用环境变量中的 API 密钥创建 OpenAI 客户端
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,  // 从环境变量中读取 API 密钥
  baseUrl: 'https://api.gptsapi.net/v1', // 使用自定义的 base URL
});

// OpenAI 调用函数
async function openAIChat(messages) {
  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4', // 选择使用 GPT-4 模型
      messages: messages,
    });
    return response.choices[0].message.content;
  } catch (error) {
    console.error('OpenAI API 错误:', error);
    return null;
  }
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

const model = args.model || "gpt-4"; // 默认使用 GPT-4 模型
const apiKey = process.env.OPENAI_API_KEY || ""; // 从环境变量读取 API 密钥

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

const briefingParts = [];
briefingParts.push(`# 概念简报：${topic}`);
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

  const content = await openAIChat(messages);
  briefingParts.push(content);
  if (i < toProcess.length - 1) briefingParts.push(``);
}

const version = v ?? nextVersion(outDir, "report", date);
const briefingPath = path.join(outDir, `report_${date}_v${version}.md`);
writeText(briefingPath, briefingParts.join("\n\n"));
writeLatest(path.join(outDir, "report_latest.md"), briefingPath);

console.log(`[concept_synthesis] Wrote: ${briefingPath}`);