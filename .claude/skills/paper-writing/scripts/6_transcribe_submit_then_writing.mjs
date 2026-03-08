#!/usr/bin/env node
/**
 * 6_transcribe_submit_then_writing.mjs — 用户上传的写作样本：转录到 references/submit/<style>，再执行综述
 *   1) 1_input_to_md.mjs  assets/<style>/<savedFileName> → references/submit/<style>/<basename>.md
 *   2) 2_compact_report.mjs  05_report → chunks
 *   3) 3_writing_under_style.mjs  REFERENCE_STYLE=submit/<style>，--style <basename>.md
 *
 * 用法（从项目根）：
 *   node .claude/skills/paper-writing/scripts/6_transcribe_submit_then_writing.mjs <topic> <style> <savedFileName> [providerOrModel]
 * style = academic | colloquial；providerOrModel 同 upload_then_writing。
 */

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAPER_WRITING = path.resolve(__dirname, "..");
const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..", "..");

function run(name, cmd, args, env = {}) {
  console.log(`\n[transcribe_submit_then_writing] === ${name} ===`);
  const result = spawnSync(cmd, args, {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
    shell: false,
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    console.error(`[transcribe_submit_then_writing] ${name} 退出码: ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

const topic = process.argv[2];
const style = (process.argv[3] || "academic").toLowerCase();
const savedFileName = process.argv[4];
const providerOrModel = (process.argv[5] || "gpt").toLowerCase();
const useZhipu = providerOrModel === "glm" || providerOrModel === "glm-4.7-flash" || providerOrModel === "glm-5";
const provider = useZhipu ? "glm" : "gpt";
const zhipuModel = useZhipu ? (providerOrModel === "glm" ? "glm-4.7-flash" : providerOrModel) : null;

if (!topic || !savedFileName) {
  console.error("用法: node 6_transcribe_submit_then_writing.mjs <topic> <academic|colloquial> <savedFileName> [providerOrModel]");
  process.exit(1);
}

if (style !== "academic" && style !== "colloquial") {
  console.error("style 须为 academic 或 colloquial");
  process.exit(1);
}

const inputPath = path.join(PAPER_WRITING, "assets", style, savedFileName);
if (!fs.existsSync(inputPath)) {
  console.error("上传文件不存在:", inputPath);
  process.exit(1);
}

const outBasename = path.basename(savedFileName, path.extname(savedFileName)) + ".md";
const outputPath = `submit/${style}/${outBasename}`;

run("input_to_md", "node", [
  path.join(PAPER_WRITING, "scripts", "1_input_to_md.mjs"),
  `${style}/${savedFileName}`,
  outputPath,
]);

run("compact_report", "node", [
  path.join(PAPER_WRITING, "scripts", "2_compact_report.mjs"),
  topic,
]);

const writingArgs = [
  path.join(PAPER_WRITING, "scripts", "3_writing_under_style.mjs"),
  topic,
  "--provider",
  provider,
  "--style",
  outBasename,
];
if (zhipuModel) writingArgs.push("--model", zhipuModel);
run("writing_under_style", "node", writingArgs, {
  REFERENCE_STYLE: `submit/${style}`,
});

console.log("\n[transcribe_submit_then_writing] 全部完成。可查看 outputs/" + topic + "/06_review/review_latest.md");
