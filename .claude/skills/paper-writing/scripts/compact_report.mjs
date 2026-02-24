#!/usr/bin/env node
/**
 * compact_report.mjs
 *
 * Purpose:
 *   Preprocess a long report to avoid API timeout:
 *   1) Remove bulky "appendix paper cards" sections (high redundancy)
 *   2) Split into top-level chunks by '## ' headings
 *
 * Default I/O:
 *   In : outputs/<topic>/05_report/report_latest.md
 *   Out: outputs/<topic>/05_report/report_compact_latest.md
 *   Dir: outputs/<topic>/05_report/chunks/*.md
 *
 * Usage:
 *   From project root:
 *     node .claude/skills/paper-writing/scripts/compact_report.mjs <topic> [--in ...] [--out ...] [--chunkDir ...] [--keepAppendix] [--debug]
 *   From paper-writing/scripts:
 *     node compact_report.mjs <topic> [--in ...] [--out ...] [--chunkDir ...] [--keepAppendix] [--debug]
 *
 * Notes:
 *   - Deterministic: yes
 *   - No third-party deps
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Default project root: 2 levels up from scripts/ (paper-writing/scripts -> project root)
let projectRoot = path.resolve(__dirname, "..", "..", "..", "..");
if (!fs.existsSync(path.join(projectRoot, "outputs"))) {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, "outputs"))) projectRoot = cwd;
}

function getArg(flag, defVal) {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) {
    return process.argv[i + 1];
  }
  return defVal;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

const topic = process.argv[2];
if (!topic || topic.startsWith("--")) {
  console.error(
    "Usage: node .claude/skills/paper-writing/scripts/compact_report.mjs <topic> [--in ...] [--out ...] [--chunkDir ...] [--keepAppendix] [--debug]"
  );
  process.exit(1);
}

const inDefault = path.join(projectRoot, "outputs", topic, "05_report", "report_latest.md");
const outDefault = path.join(projectRoot, "outputs", topic, "05_report", "report_compact_latest.md");
const chunkDirDefault = path.join(projectRoot, "outputs", topic, "05_report", "chunks");

const inPath = getArg("--in", inDefault);
const outPath = getArg("--out", outDefault);
const chunkDir = getArg("--chunkDir", chunkDirDefault);

const keepAppendix = hasFlag("--keepAppendix");
const debug = hasFlag("--debug");

if (!fs.existsSync(inPath)) {
  console.error(`[ERR] input not found: ${inPath}`);
  process.exit(1);
}

const raw = fs.readFileSync(inPath, "utf8");

/**
 * Remove "appendix paper cards" blocks.
 *
 * We try to be robust to common variants:
 *   - ### 附录：论文卡片
 *   - ### 附录: 论文卡片
 *   - ### Appendix: Paper cards
 *   - ### Appendix — Paper Cards
 *
 * Strategy:
 *   Delete from the appendix heading line up to (but not including) the next top-level section '## '
 *   or end-of-file.
 */
function dropAppendixCards(text) {
  // Match heading lines that look like appendix paper-cards (allow trailing text e.g. "（每篇论文3行...）").
  // Then consume everything until next '## ' section or EOF.
  const appendixHead =
    String.raw`^###\s*(?:附录|Appendix)\s*[:：—-]?\s*(?:论文卡片|Paper\s*cards?|Paper\s*Cards?).*$`;

  // In JS there is no \Z; use (?![\s\S]) for end-of-string
  const re = new RegExp(String.raw`${appendixHead}\n[\s\S]*?(?=^\s*##\s+|(?![\s\S]))`, "gmi");
  return text.replace(re, "");
}

/** normalize excessive blank lines (keep at most 2) */
function normalizeNewlines(text) {
  return text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

let compact = raw;
if (!keepAppendix) compact = dropAppendixCards(compact);
compact = normalizeNewlines(compact);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, compact, "utf8");

/**
 * Split by top-level headings '## '.
 * - If file starts with content before first '## ', write it as chunk_00_intro.md
 * - Each subsequent '## <title>' becomes one chunk file
 */
fs.mkdirSync(chunkDir, { recursive: true });

function slugify(s) {
  return (
    s
      .trim()
      // remove windows-illegal and other noisy chars
      .replace(/[\/\\:?*"<>|]/g, "")
      // collapse whitespace
      .replace(/\s+/g, "_")
      // limit length
      .slice(0, 80) || "untitled"
  );
}

const parts = compact.split(/\n(?=##\s+)/g);

let idx = 0;

if (parts.length && !parts[0].startsWith("## ")) {
  const intro = parts.shift().trim();
  if (intro) {
    const p = path.join(chunkDir, `chunk_${String(idx).padStart(2, "0")}_intro.md`);
    fs.writeFileSync(p, intro + "\n", "utf8");
    idx++;
  }
}

for (const part of parts) {
  const block = part.trim();
  if (!block) continue;

  const m = block.match(/^##\s+(.+)\s*$/m);
  const title = m ? m[1] : `section_${idx}`;
  const fname = `chunk_${String(idx).padStart(2, "0")}_${slugify(title)}.md`;
  fs.writeFileSync(path.join(chunkDir, fname), block + "\n", "utf8");
  idx++;
}

if (debug) {
  console.log("----- compact_report debug -----");
  console.log("projectRoot:", projectRoot);
  console.log("inPath     :", inPath);
  console.log("outPath    :", outPath);
  console.log("chunkDir   :", chunkDir);
  console.log("keepAppendix:", keepAppendix);
  console.log("--------------------------------");
}

console.log(`[OK] compact -> ${outPath}`);
console.log(`[OK] chunks  -> ${chunkDir} (${idx} files)`);