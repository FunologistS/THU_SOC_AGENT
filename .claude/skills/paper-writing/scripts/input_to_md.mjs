#!/usr/bin/env node
/**
 * input_to_md.mjs — 将 PDF 或 Word 转为 Markdown
 *
 * 重要：当前目录决定如何写命令
 *   - 若终端在 paper-writing/scripts 下（提示符带 scripts）：
 *       用 node input_to_md.mjs <输入> <输出>   （不要写 .claude/... 否则会报错找不到脚本）
 *   - 若终端在项目根 THU_SOC_AGENT 下：
 *       用 node .claude/skills/paper-writing/scripts/input_to_md.mjs <输入> <输出>
 *
 * 输入/输出路径：以 . 或 .. 开头或为绝对路径时相对 cwd；否则相对 paper-writing 的 assets / references。
 * 自动落入：来自 assets/academic 的转录 → references/academic/；来自 assets/colloquial → references/colloquial/。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import mammoth from "mammoth";

const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");
if (typeof PDFParse !== "function") {
  throw new Error("pdf-parse 未正确加载（需要 v2 的 PDFParse），请检查 node_modules");
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAPER_WRITING_ROOT = path.resolve(__dirname, "..");

function ensureDir(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch (err) {
    console.error("创建目录失败:", err);
    throw err;
  }
}

function resolvePaths(filePath, outputPath) {
  // 绝对路径或以 .. / . 开头：相对 cwd；否则相对 paper-writing 的 assets / references
  const resolveFromCwd = (p) => path.isAbsolute(p) || p.startsWith("..") || p.startsWith(".");

  const fullInput = resolveFromCwd(filePath)
    ? path.resolve(process.cwd(), filePath)
    : path.resolve(PAPER_WRITING_ROOT, "assets", filePath);
  let fullOutput = resolveFromCwd(outputPath)
    ? path.resolve(process.cwd(), outputPath)
    : path.resolve(PAPER_WRITING_ROOT, "references", outputPath);

  // 若输出已指定为 submit/ 子目录，则不再按输入自动落入 academic/colloquial
  const outPathNorm = (outputPath || "").replace(/\\/g, path.sep);
  if (outPathNorm.startsWith("submit/")) {
    return { fullInput, fullOutput };
  }

  // 小优化：按输入来源自动落入 references 子目录
  const norm = path.normalize(fullInput);
  const outBasename = path.basename(fullOutput);
  if (norm.includes(`${path.sep}academic${path.sep}`) || norm.endsWith(`${path.sep}academic`)) {
    fullOutput = path.resolve(PAPER_WRITING_ROOT, "references", "academic", outBasename);
  } else if (norm.includes(`${path.sep}colloquial${path.sep}`) || norm.endsWith(`${path.sep}colloquial`)) {
    fullOutput = path.resolve(PAPER_WRITING_ROOT, "references", "colloquial", outBasename);
  }

  return { fullInput, fullOutput };
}

function convertToMarkdown(inputPath, outputPath) {
  const ext = path.extname(inputPath).toLowerCase();
  if (ext !== ".pdf" && ext !== ".docx") {
    console.error("不支持的文件类型，仅支持 .pdf 与 .docx");
    return Promise.reject(new Error("Unsupported file type"));
  }

  if (!fs.existsSync(inputPath)) {
    console.error("输入文件不存在:", inputPath);
    return Promise.reject(new Error("Input file not found"));
  }

  ensureDir(path.dirname(outputPath));

  if (ext === ".pdf") {
    return fs.promises
      .readFile(inputPath)
      .then((data) => {
        const parser = new PDFParse({ data });
        return parser.getText();
      })
      .then((result) => {
        if (!result || !result.text) {
          throw new Error("PDF 解析结果为空或格式不正确");
        }
        const text = result.text.replace(/\n/g, "\n\n").trim();
        fs.writeFileSync(outputPath, text, "utf-8");
        console.log("PDF 已转为 Markdown:", outputPath);
      })
      .catch((err) => {
        console.error("PDF 解析失败:", err?.message || err);
        throw err;
      });
  }

  return mammoth
    .extractRawText({ path: inputPath })
    .then((result) => {
      if (!result || !result.value) {
        throw new Error("Word 文件解析结果为空或格式不正确");
      }
      const text = result.value.replace(/\n/g, "\n\n").trim();
      fs.writeFileSync(outputPath, text, "utf-8");
      console.log("Word 已转为 Markdown:", outputPath);
    })
    .catch((err) => {
      console.error("Word 转换出错:", err.message);
      throw err;
    });
}

const filePath = process.argv[2];
const outputPath = process.argv[3];

if (!filePath || !outputPath) {
  console.error("用法: node input_to_md.mjs <输入文件.pdf|.docx> <输出.md>");
  process.exit(1);
}

const { fullInput, fullOutput } = resolvePaths(filePath, outputPath);

convertToMarkdown(fullInput, fullOutput).catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});