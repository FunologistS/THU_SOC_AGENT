#!/usr/bin/env node
/**
 * 3_summarize.mjs — 生成结构化摘要（表格 → 03_summaries）
 *
 * 将论文表格（02_clean 或 01_raw）转为每篇一篇的结构化摘要块，供下游荟萃分析使用。
 *
 * Input:  papers_*.md 或 papers_clean_*.md
 * Output: outputs/<topic>/03_summaries/summaries_YYYYMMDD_vN.md + summaries_latest.md
 *
 * Usage:
 *   node 3_summarize.mjs <topic> --in <md_table>
 *
 * Optional:
 *   --max-abstract-chars <N>   (default: 0 = no truncation)
 *
 * 注：本脚本不补抓缺失摘要；缺摘要时输出 "No usable abstract."，补摘要在批量检索时勾选「摘要补全」。
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import process from "node:process";

function slugify(s) {
  return (s || "topic")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\p{Letter}\p{Number}_\-]+/gu, "");
}

function todayYYYYMMDD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readText(p) {
  return fs.readFileSync(p, "utf-8");
}

function writeText(p, t) {
  fs.writeFileSync(p, t, "utf-8");
}

function autoVersionPath(dir, baseName, ext) {
  // baseName like "summaries_20260221"
  let v = 1;
  while (true) {
    const out = path.join(dir, `${baseName}_v${v}${ext}`);
    if (!fs.existsSync(out)) return out;
    v += 1;
  }
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      args[k] = v;
    } else {
      args._.push(a);
    }
  }
  return args;
}

/**
 * Parse Markdown table rows.
 * Supports:
 *   - 7 columns: Journal | Year | Title | Authors | DOI | OpenAlex | Abstract
 *   - 6 columns (legacy): Journal | Year | Title | DOI | OpenAlex | Abstract (authors empty)
 * Cells are separated by " | " (space-pipe-space); content after the last expected column is merged into abstract.
 */
function parseMdTable(md) {
  const lines = md.split(/\r?\n/);
  const tableLines = lines.filter((l) => l.trim().startsWith("|"));
  if (tableLines.length < 3) return [];

  const dataLines = tableLines.slice(2); // skip header + separator
  const headerLine = tableLines[0];
  const coreHeader = headerLine.trim().replace(/^\|/, "").replace(/\|$/, "");
  const headerParts = coreHeader.split(" | ").map((x) => x.trim().toLowerCase());
  // 支持英文 Authors/author 与中文「作者」表头，否则 7 列表会被误判为 6 列，作者列丢失
  const hasAuthors = headerParts.some((h) => h === "authors" || h.includes("author") || h === "作者");
  const expectedCols = hasAuthors ? 7 : 6;
  const dataRows = [];

  for (const line of dataLines) {
    const core = line.trim().replace(/^\|/, "").replace(/\|$/, "");
    const parts = core.split(" | ");
    if (parts.length < expectedCols) continue;
    const journal = (parts[0] || "").trim();
    const year = parts[1] ? Number(parts[1].trim()) : null;
    const title = (parts[2] || "").trim();
    let authors = "";
    let doiCell, openalexCell, abstractCell;
    if (hasAuthors && parts.length >= 7) {
      authors = (parts[3] || "").trim();
      doiCell = (parts[4] || "").trim();
      openalexCell = (parts[5] || "").trim();
      abstractCell = parts.slice(6).join(" | ").trim();
    } else {
      doiCell = (parts[3] || "").trim();
      openalexCell = (parts[4] || "").trim();
      abstractCell = parts.slice(5).join(" | ").trim();
    }
    dataRows.push({
      journal,
      year,
      title,
      authors,
      doiCell,
      openalexCell,
      abstractRaw: abstractCell || "",
    });
  }
  return dataRows;
}

function mdLinkUrl(cell) {
  // markdown link: [text](url)
  const m = String(cell || "").match(/\((https?:\/\/[^)]+)\)/);
  return m ? m[1] : "";
}

function cleanAbstract(s) {
  let t = String(s || "");
  // collapse whitespace/newlines
  t = t.replace(/\s+/g, " ").trim();

  // strip common prefixes
  t = t.replace(/^(abstract|abstract:|ABSTRACT|ABSTRACT:)\s*/i, "");

  // if the field is literally "No abstract." etc
  if (/^(no abstract|n\/a|none|unknown)\.?$/i.test(t)) return "";

  return t;
}

function maybeTruncate(s, maxChars) {
  if (!maxChars || maxChars <= 0) return s;
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars).trim() + "…";
}

function splitSentences(text) {
  // lightweight sentence splitter; good enough for abstracts
  const t = String(text || "").trim();
  if (!t) return [];
  // keep punctuation
  return t
    .split(/(?<=[.?!])\s+(?=[A-Z(])/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function pickResearchQuestion(abstract) {
  const sents = splitSentences(abstract);

  const patterns = [
    /\b(this study|this article|this paper|we (examine|investigate|analy[sz]e|explore|argue|propose|present|develop))\b/i,
    /\b(the aim of|we ask|we address|we focus on|we consider)\b/i,
  ];

  for (const p of patterns) {
    const hit = sents.find((s) => p.test(s));
    if (hit) return hit;
  }

  // fallback: first sentence
  return sents[0] || "";
}

function detectDataMaterial(abstract) {
  const t = abstract.toLowerCase();

  const hits = [];
  const add = (label, re) => { if (re.test(t)) hits.push(label); };

  add("survey data", /\bsurvey\b|\bquestionnaire\b/);
  add("interviews", /\binterview(s)?\b|\bin[- ]depth interviews?\b/);
  add("ethnographic observation", /\bethnograph(y|ic)\b|\bparticipant observation\b|\bfieldwork\b/);
  add("experiment", /\bexperiment(s)?\b|\brandomi[sz]ed\b/);
  add("case study", /\bcase stud(y|ies)\b/);
  add("platform/social media data", /\bforum posts?\b|\bsocial media\b|\btwitter\b|\breddit\b|\bfacebook\b|\btripadvisor\b/);
  add("administrative/registry data", /\badministrative data\b|\bregistry\b/);
  add("text corpus", /\bcorpus\b|\btext analysis\b|\bcomputational text\b/);
  add("dataset", /\bdataset\b|\bdata set\b|\bmicrodata\b/);

  if (hits.length === 0) return "Unknown (not stated in abstract)";
  // de-duplicate
  return [...new Set(hits)].join("; ");
}

function detectMethod(abstract) {
  const t = abstract.toLowerCase();

  const hits = [];
  const add = (label, re) => { if (re.test(t)) hits.push(label); };

  add("computational text analysis", /\bcomputational text\b|\btopic model(ing)?\b|\bembedding(s)?\b|\bmachine learning\b/);
  add("regression/statistical analysis", /\bregression\b|\bquantitative\b|\bstatistical\b|\bmultivariate\b/);
  add("mixed methods", /\bmixed[- ]methods?\b/);
  add("qualitative analysis", /\bqualitative\b|\bthematic\b|\bcoding\b/);
  add("ethnography", /\bethnograph(y|ic)\b/);
  add("interviews", /\binterview(s)?\b/);
  add("experiment", /\bexperiment(s)?\b|\brandomi[sz]ed\b/);
  add("conceptual/theoretical paper", /\bconceptual\b|\btheoretical\b|\bwe theorize\b|\bwe develop a typology\b/);
  add("literature review", /\breview(s)?\b|\bwe review\b|\bsystematic review\b/);

  if (hits.length === 0) return "Unknown (not stated in abstract)";
  return [...new Set(hits)].join("; ");
}

function buildSummary({ idx, row, maxAbstractChars }) {
  const doiUrl = mdLinkUrl(row.doiCell) || row.doiCell || "";
  const oaUrl = mdLinkUrl(row.openalexCell) || row.openalexCell || "link";

  const abs = cleanAbstract(row.abstractRaw);
  const absOut = abs ? maybeTruncate(abs, maxAbstractChars) : "";

  const rq = abs ? pickResearchQuestion(abs) : "";
  const data = abs ? detectDataMaterial(abs) : "Unknown (no usable abstract)";
  const method = abs ? detectMethod(abs) : "Unknown (no usable abstract)";

  const keyFindings = absOut ? absOut : "No usable abstract.";

  return `## ${idx}. ${row.title || "(No title)"} (${row.year || "NA"})

- Journal: ${row.journal || "NA"}
- Author(s): ${row.authors || "Unknown"}
- DOI: ${doiUrl || "NA"}
- OpenAlex: ${oaUrl || "link"}

**Research question**: ${rq || "Unknown (not stated in abstract)"}

**Data / material**: ${data}

**Method**: ${method}

**Key findings (from abstract)**: ${keyFindings}

**Contribution**: To be refined in synthesis step.

**Limitations / open questions**: To be refined in synthesis step.

---`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const topicRaw = args._[0];
  const topic = slugify(topicRaw);

  const inPath = args["in"];
  if (!topicRaw || !inPath) {
    console.error("Usage: node 3_summarize.mjs <topic> --in <md_table> [--max-abstract-chars N]");
    process.exit(1);
  }

  const maxAbstractChars = Number(args["max-abstract-chars"] || "0");

  const inputAbs = path.resolve(inPath);
  const md = readText(inputAbs);
  const rows = parseMdTable(md);

  const outDir = path.resolve(`outputs/${topic}/03_summaries`);
  ensureDir(outDir);

  const baseName = `summaries_${todayYYYYMMDD()}`;
  const outPath = autoVersionPath(outDir, baseName, ".md");
  const latestPath = path.join(outDir, "summaries_latest.md");

  const header =
`# Structured summaries (draft) for topic: ${topic}

Source: ${path.basename(inputAbs)}

Output: ${path.basename(outPath)}

Total papers: ${rows.length}

---

`;

  const body = rows.map((r, i) => buildSummary({ idx: i + 1, row: r, maxAbstractChars })).join("\n\n");
  const out = header + body + "\n";

  writeText(outPath, out);
  writeText(latestPath, out);

  console.log(`Wrote: ${outPath}`);
  console.log(`Latest: ${latestPath}`);
  console.log(`Summaries: ${rows.length}`);
}

main();