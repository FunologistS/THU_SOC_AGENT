#!/usr/bin/env node
/**
 * upload_then_writing.mjs — 用户上传写作样本后，按顺序执行：
 *   1) input_to_md.mjs  上传文件 → references/<style> 的 Markdown
 *   2) compact_report.mjs  05_report → chunks（供 writing_under_style 使用）
 *   3) writing_under_style.mjs  按 references/<style> 风格改写 → 06_review
 *   4) rag_from_chunks.mjs --index  可选：建 RAG 索引
 *
 * 用法（从项目根）：
 *   node .claude/skills/paper-writing/scripts/upload_then_writing.mjs <topic> <style> <savedFileName>
 * 其中 style = academic | colloquial，savedFileName 为 assets/<style>/ 下的文件名（如 uuid-sample.docx）。
 */

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAPER_WRITING = path.resolve(__dirname, "..");
const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..", "..");

function run(name, cmd, args, env = {}) {
  console.log(`\n[upload_then_writing] === ${name} ===`);
  const result = spawnSync(cmd, args, {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
    shell: false,
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    console.error(`[upload_then_writing] ${name} 退出码: ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

const topic = process.argv[2];
const style = (process.argv[3] || "academic").toLowerCase();
const savedFileName = process.argv[4];

if (!topic || !savedFileName) {
  console.error("用法: node upload_then_writing.mjs <topic> <academic|colloquial> <savedFileName>");
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
run(
  "input_to_md",
  "node",
  [
    path.join(PAPER_WRITING, "scripts", "input_to_md.mjs"),
    `${style}/${savedFileName}`,
    outBasename,
  ]
);

run("compact_report", "node", [
  path.join(PAPER_WRITING, "scripts", "compact_report.mjs"),
  topic,
]);

run(
  "writing_under_style",
  "node",
  [path.join(PAPER_WRITING, "scripts", "writing_under_style.mjs"), topic],
  { REFERENCE_STYLE: style }
);

const ragResult = spawnSync(
  "node",
  [
    path.join(PAPER_WRITING, "scripts", "rag_from_chunks.mjs"),
    topic,
    "--index",
  ],
  { cwd: PROJECT_ROOT, stdio: "inherit", shell: false }
);
if (ragResult.status !== 0) {
  console.warn("[upload_then_writing] rag_from_chunks --index 未成功（可忽略，如需 RAG 检索可稍后单独运行）");
}

console.log("\n[upload_then_writing] 全部完成。可查看 outputs/" + topic + "/06_review/review_latest.md");
