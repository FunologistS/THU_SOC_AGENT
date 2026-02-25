#!/usr/bin/env node
/**
 * filter_then_summarize.mjs
 * 清洗规整一步到位：先 filter（01_raw → 02_clean），再 summarize（02_clean 或 01_raw → 03_summaries）。
 * 供 UI /api/run 的 paper_summarize 调用，确保 02_clean 被填充且后续摘要基于清洗结果。
 *
 * Usage:
 *   node filter_then_summarize.mjs <topic> [--year-from YYYY] [--year-to YYYY] [--strong-keywords "a, b"]
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../../..");
const outputsDir = path.join(projectRoot, "outputs");

const topic = process.argv[2];
if (!topic) {
  console.error("Usage: node filter_then_summarize.mjs <topic> [--year-from YYYY] [--year-to YYYY]");
  process.exit(1);
}

const filterScript = path.join(__dirname, "filter.mjs");
const summarizeScript = path.join(__dirname, "summarize.mjs");

const filterArgs = [topic, "--no-interactive"];
for (let i = 3; i < process.argv.length; i++) {
  if (process.argv[i] === "--year-from" && process.argv[i + 1]) {
    filterArgs.push("--year-from", process.argv[i + 1]);
    i++;
  } else if (process.argv[i] === "--year-to" && process.argv[i + 1]) {
    filterArgs.push("--year-to", process.argv[i + 1]);
    i++;
  } else if (process.argv[i] === "--strong-keywords" && process.argv[i + 1]) {
    filterArgs.push("--strong-keywords", process.argv[i + 1]);
    i++;
  }
}

console.log("[filter_then_summarize] Step 1: filter (01_raw → 02_clean)");
const filterRun = spawnSync("node", [filterScript, ...filterArgs], {
  cwd: projectRoot,
  stdio: "inherit",
  encoding: "utf-8",
});

if (filterRun.status !== 0) {
  console.error("[filter_then_summarize] filter exited with", filterRun.status);
  process.exit(filterRun.status ?? 1);
}

const cleanLatest = path.join(outputsDir, topic, "02_clean", "papers_clean_latest.md");
const rawLatest = path.join(outputsDir, topic, "01_raw", "papers_latest.md");
const inPath = fs.existsSync(cleanLatest) ? cleanLatest : rawLatest;

if (!fs.existsSync(inPath)) {
  console.error("[filter_then_summarize] No input for summarize:", inPath);
  process.exit(1);
}

console.log("[filter_then_summarize] Step 2: summarize --in", path.relative(projectRoot, inPath));
const sumRun = spawnSync("node", [summarizeScript, topic, "--in", inPath], {
  cwd: projectRoot,
  stdio: "inherit",
  encoding: "utf-8",
});

if (sumRun.status !== 0) {
  console.error("[filter_then_summarize] summarize exited with", sumRun.status);
  process.exit(sumRun.status ?? 1);
}

console.log("[filter_then_summarize] Done.");
