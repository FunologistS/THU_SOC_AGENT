#!/usr/bin/env node
/**
 * 1_command.mjs — 清洗规整入口（先清洗论文表，再生成结构化摘要）
 *
 * 供 UI「清洗规整」调用：先执行 2_clean（仅格式规整，--no-relevance-gate），再执行 3_summarize。
 *
 * Usage:
 *   node 1_command.mjs <topic>
 *   node 1_command.mjs <topic> [--year-from YYYY] [--year-to YYYY] [--strong-keywords "a, b"]
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
  console.error("Usage: node 1_command.mjs <topic> [--year-from YYYY] [--year-to YYYY]");
  process.exit(1);
}

const cleanScript = path.join(__dirname, "2_clean.mjs");
const summarizeScript = path.join(__dirname, "3_summarize.mjs");

// 管线默认：仅格式规整，不做关键词相关性过滤；可选透传年份、强关键词
const cleanArgs = [topic, "--no-interactive", "--no-relevance-gate"];
for (let i = 3; i < process.argv.length; i++) {
  if (process.argv[i] === "--year-from" && process.argv[i + 1]) {
    cleanArgs.push("--year-from", process.argv[i + 1]);
    i++;
  } else if (process.argv[i] === "--year-to" && process.argv[i + 1]) {
    cleanArgs.push("--year-to", process.argv[i + 1]);
    i++;
  } else if (process.argv[i] === "--strong-keywords" && process.argv[i + 1]) {
    cleanArgs.push("--strong-keywords", process.argv[i + 1]);
    i++;
  }
}

console.log("[1_command] Step 1: 2_clean (01_raw → 02_clean)");
const cleanRun = spawnSync("node", [cleanScript, ...cleanArgs], {
  cwd: projectRoot,
  stdio: "inherit",
  encoding: "utf-8",
});

if (cleanRun.status !== 0) {
  console.error("[1_command] 2_clean exited with", cleanRun.status);
  process.exit(cleanRun.status ?? 1);
}

const cleanLatest = path.join(outputsDir, topic, "02_clean", "papers_clean_latest.md");
const rawLatest = path.join(outputsDir, topic, "01_raw", "papers_latest.md");
const inPath = fs.existsSync(cleanLatest) ? cleanLatest : rawLatest;

if (!fs.existsSync(inPath)) {
  console.error("[1_command] No input for 3_summarize:", inPath);
  process.exit(1);
}

console.log("[1_command] Step 2: 3_summarize --in", path.relative(projectRoot, inPath));
const sumRun = spawnSync("node", [summarizeScript, topic, "--in", inPath], {
  cwd: projectRoot,
  stdio: "inherit",
  encoding: "utf-8",
});

if (sumRun.status !== 0) {
  console.error("[1_command] 3_summarize exited with", sumRun.status);
  process.exit(sumRun.status ?? 1);
}

console.log("[1_command] Done.");
