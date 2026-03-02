#!/usr/bin/env node
/**
 * writing_under_style.mjs — 用 references/academic 的写作风格，将 report/chunks 改写成成段落的 review
 *
 * ✅ 支持两种模式（自动选择）：
 *  1) Chunk 模式（优先）：若存在 outputs/<topic>/05_report/chunks/*.md，则逐 chunk 调 API，避免超时
 *  2) 单文件模式（回退）：使用输入文件（默认 report_latest.md 或你传入的 .md）
 *
 * ✅ 新增/增强（已把我上条提到的问题都改进进来）：
 *  - 风格样本 MAX_STYLE_CHARS 严格不超限（修复 total 计数）
 *  - 日期按本地时区（默认 America/Los_Angeles，可用 TZ 覆盖），避免跨日
 *  - truncateByChars() 额外补全 Markdown 代码围栏（```）避免结构被截断破坏
 *  - Merge prompt 有“总字符上限”控制（style + draft + wrapper 一起算），更稳地降低 520
 *  - chunk 断点续跑：chunks_styled 已存在则跳过（--force 可强制重跑）
 *  - --merge-only 支持 --styled-dir 覆盖 styledDir（避免 OUTPUT_DIR 变了导致找不到）
 *  - 更稳的重试：识别 429/503/520/504/timeout/网络断连，并读 status/code
 *  - 温度分阶段可调：CHUNK_TEMPERATURE / MERGE_TEMPERATURE / SMOOTH_TEMPERATURE
 *  - 写出 review_latest.md（复制覆盖），方便下游使用
 *
 * Usage（保持兼容 + 新增）：
 *  - node writing_under_style.mjs
 *      => 默认 topic=artificial_intelligence，优先 chunks，否则 report_latest.md
 *  - node writing_under_style.mjs <topic>
 *      => 用指定 topic，优先 chunks
 *  - node writing_under_style.mjs <input.md> [style_files...]
 *      => 强制单文件模式（按你传入文件处理），style_files 可覆盖默认风格
 *  - node writing_under_style.mjs <topic> --merge-only
 *      => 仅从已有 06_review/chunks_styled/*.md 合并为最终综述
 *
 * 新增 flags：
 *  - --provider gpt | glm
 *      => 使用 OpenAI（gpt，默认）或智谱 GLM（glm）。glm 时需 ZHIPU_API_KEY，模型默认 glm-4.7-flash
 *  - --model <id>
 *      => 智谱模型 id（仅当 --provider glm 时生效），如 glm-4.7-flash、glm-5；未传则用 ZHIPU_MODEL 或默认
 *  - --force
 *      => chunk 模式强制重跑所有 chunk（无视已有 chunks_styled）
 *  - --styled-dir <dir>
 *      => 指定 merge-only 时读取 styled chunks 的目录（默认 OUTPUT_DIR/chunks_styled）
 *  - --style <a.md,b.md,...>
 *      => 显式指定风格文件（逗号分隔）。仍兼容旧用法（把位置参数当 style files）
 *
 * 环境变量：
 *  - OPENAI_API_KEY（必填）
 *  - OPENAI_BASE_URL（可选，默认 https://api.gptsapi.net/v1）
 *  - OPENAI_MODEL（可选，默认 gpt-5.2）
 *  - OUTPUT_DIR（可选，默认 outputs/<topic>/06_review）
 *  - TZ（可选，默认 America/Los_Angeles，用于日期命名）
 *  - MAX_STYLE_CHARS（可选，默认 1000；风格样本总字数上限）
 *  - CHUNK_MAX_CHARS（可选，默认 16000；每个 chunk 送入模型的最大字符数，超出截断）
 *  - CHUNK_MAX_TOKENS（可选，默认 1800；每个 chunk 输出 token 上限）
 *  - MERGE_MAX_TOKENS（可选，默认 6000；合并后的最终输出 token 上限）
 *  - MERGE_MAX_CHARS（可选，默认 15000；合并/润色时“总 prompt 字符上限”，合并阶段 504 时可改为 12000 再 --merge-only）
 *  - FINAL_SMOOTH（可选，设为 1 则对合并稿做一次“轻量润色统一”）
 *  - CHUNK_TEMPERATURE（可选，默认 0.35）
 *  - MERGE_TEMPERATURE（可选，默认 0.25）
 *  - SMOOTH_TEMPERATURE（可选，默认 0.20）
 *
 * 单文件模式传入 .md 时：绝对路径用原样；以 ./ 或 ../ 开头按当前工作目录解析；否则按项目根解析。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OpenAI } from "openai";

/** ---------- root detection ---------- **/
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAPER_WRITING_ROOT = path.resolve(__dirname, ".."); // .claude/skills/paper-writing
let PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..", ".."); // -> THU_SOC_AGENT
if (!fs.existsSync(path.join(PROJECT_ROOT, "outputs"))) {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, "outputs"))) PROJECT_ROOT = cwd;
}

const REFERENCE_STYLE = (process.env.REFERENCE_STYLE || "academic").toLowerCase();
const REFERENCES_DIR = path.join(PAPER_WRITING_ROOT, "references", REFERENCE_STYLE);
const REFERENCES_ACADEMIC = REFERENCES_DIR;
/** 用户上传并转录的样例目录（与 REFERENCES_DIR 同类型时生效：academic → submit/academic，colloquial → submit/colloquial） */
const REFERENCES_SUBMIT_DIR =
  REFERENCE_STYLE === "academic"
    ? path.join(PAPER_WRITING_ROOT, "references", "submit", "academic")
    : REFERENCE_STYLE === "colloquial"
      ? path.join(PAPER_WRITING_ROOT, "references", "submit", "colloquial")
      : null;

/** ---------- env / provider ---------- **/
const providerRaw = (() => {
  const idx = process.argv.indexOf("--provider");
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return process.env.WRITING_PROVIDER || "gpt";
})();
const PROVIDER = providerRaw === "glm" ? "glm" : "gpt";

const modelFlag = (() => {
  const i = process.argv.indexOf("--model");
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return null;
})();
let API_KEY;
let BASE_URL;
let MODEL;
if (PROVIDER === "glm") {
  API_KEY = process.env.ZHIPU_API_KEY;
  BASE_URL = process.env.ZHIPU_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";
  MODEL = modelFlag || process.env.ZHIPU_MODEL || "glm-4.7-flash";
} else {
  API_KEY = process.env.OPENAI_API_KEY;
  BASE_URL = process.env.OPENAI_BASE_URL || "https://api.gptsapi.net/v1";
  MODEL = process.env.OPENAI_MODEL || "gpt-5.2";
}
const MODEL_LABEL = PROVIDER === "glm" ? `智谱 ${MODEL}` : "OpenAI GPT-5.2";

const MAX_STYLE_CHARS = Number(process.env.MAX_STYLE_CHARS) || 1000;
const CHUNK_MAX_CHARS = Number(process.env.CHUNK_MAX_CHARS) || 16000;
const CHUNK_MAX_TOKENS = Number(process.env.CHUNK_MAX_TOKENS) || 1800;
const MERGE_MAX_TOKENS = Number(process.env.MERGE_MAX_TOKENS) || 6000;
/**
 * 重要：MERGE_MAX_CHARS 现在视为“总 prompt 字符上限”（包含 style + draft + wrapper）
 * 这样更能实际降低 520/网关限制的概率。
 */
const MERGE_MAX_CHARS = Number(process.env.MERGE_MAX_CHARS) || 15000;
const FINAL_SMOOTH = String(process.env.FINAL_SMOOTH || "").trim() === "1";

const CHUNK_TEMPERATURE = Number(process.env.CHUNK_TEMPERATURE ?? 0.35);
const MERGE_TEMPERATURE = Number(process.env.MERGE_TEMPERATURE ?? 0.25);
const SMOOTH_TEMPERATURE = Number(process.env.SMOOTH_TEMPERATURE ?? 0.2);

const DEFAULT_TZ = process.env.TZ || "America/Los_Angeles";

/** ---------- args / flags ---------- **/
const argv = process.argv.slice(2);
const hasMergeOnly = argv.includes("--merge-only");
const hasForce = argv.includes("--force");
const hasNoStyle = argv.includes("--no-style"); // 不参考任何风格，直接生成综述
const styleFlagValue = getFlagValue("--style"); // e.g. "a.md,b.md"
const styledDirFlag = getFlagValue("--styled-dir"); // directory path for merge-only
const userPromptFlag = getFlagValue("--user-prompt"); // 用户额外提示词（UI 传入）

function getFlagValue(flag) {
  const idx = argv.indexOf(flag);
  if (idx >= 0 && idx + 1 < argv.length) return argv[idx + 1];
  return null;
}

/** ---------- utils ---------- **/
function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}
function stripBom(s) {
  if (s && s.charCodeAt(0) === 0xfeff) return s.slice(1);
  return s ?? "";
}

/** 从作者串中提取仅姓氏（与 literature-synthesis / papers-citations 一致） */
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
  const surnames = [];
  for (let i = 1; i < words.length; i += 2) surnames.push(words[i]);
  return surnames.length ? surnames : [words[words.length - 1]];
}

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

/** 根据 summaries 构建 (全名, year) -> (仅姓氏, year) 的替换列表，用于把综述中的全名引用统一成仅姓氏 */
function loadCitationReplacements(projectRoot, topic) {
  const summariesPath = path.join(projectRoot, "outputs", topic, "03_summaries", "summaries_latest.md");
  if (!fs.existsSync(summariesPath)) return [];
  const raw = stripBom(fs.readFileSync(summariesPath, "utf8"));
  const blocks = raw.split(/\n---\n/).map((s) => s.trim()).filter(Boolean);
  const list = [];
  for (const b of blocks) {
    const h = b.match(/^##\s+(\d+)\.\s+(.*)\s+\((\d{4})\)\s*$/m);
    if (!h) continue;
    const year = Number(h[3]);
    const authors = (
      b.match(/^- Author\(s\):\s*(.+)$/m)?.[1] ??
      b.match(/^- Authors?:\s*(.+)$/m)?.[1] ??
      b.match(/\*\*Author\(s\)\*\*:\s*(.+?)(?:\n|$)/m)?.[1] ??
      b.match(/\*\*Authors?\*\*:\s*(.+?)(?:\n|$)/m)?.[1] ??
      ""
    ).trim();
    if (!authors) continue;
    const canonical = toInTextCitation(authors, year);
    const escaped = authors.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`[（(]\\s*${escaped}\\s*[,，]\\s*${year}\\s*[）)]`, "g");
    list.push({ pattern, canonical });
  }
  list.sort((a, b) => (b.pattern.source.length - a.pattern.source.length));
  return list;
}

/** 将正文中的全名引用统一替换为仅姓氏形式 */
function normalizeCitationsToSurname(text, projectRoot, topic) {
  if (!text || !topic) return text;
  const replacements = loadCitationReplacements(projectRoot, topic);
  let out = text;
  for (const { pattern, canonical } of replacements) {
    out = out.replace(pattern, canonical);
  }
  return out;
}
function existsNonEmptyDir(dir) {
  return (
    fs.existsSync(dir) &&
    fs.statSync(dir).isDirectory() &&
    fs.readdirSync(dir).some((f) => f.endsWith(".md"))
  );
}
function isMdPath(s) {
  return typeof s === "string" && /\.md$/i.test(s.trim());
}

function countFenceOccurrences(text) {
  // count occurrences of ``` (triple backticks)
  const m = text.match(/```/g);
  return m ? m.length : 0;
}

/**
 * 截断字符串并尽量保持 Markdown 结构：
 * - 字符截断
 * - 若 ``` 围栏数量为奇数，自动补一个结尾 ```
 */
function truncateByCharsMarkdownSafe(s, maxChars) {
  if (!s) return "";
  if (s.length <= maxChars) return s;

  let out = s.slice(0, maxChars);
  // 补一句截断提示
  out += "\n\n[... 因长度限制已截断 ...]";

  // 若围栏不成对，补全
  const fences = countFenceOccurrences(out);
  if (fences % 2 === 1) {
    out += "\n```\n";
  }
  return out;
}

/**
 * 用“总 prompt 上限”裁剪 draft，使得 style+wrapper+draft 不超过 maxTotalChars
 * - wrapperOverhead：你拼 prompt 时额外固定文本的大概长度（我们用真实构造后再测量更稳）
 */
function fitDraftToPromptBudget({ styleSamples, draft, promptWrapperPrefix, promptWrapperSuffix, maxTotalChars }) {
  const styleLen = (styleSamples || "").length;
  const prefixLen = (promptWrapperPrefix || "").length;
  const suffixLen = (promptWrapperSuffix || "").length;

  const budgetForDraft = Math.max(0, maxTotalChars - styleLen - prefixLen - suffixLen);

  if (!draft) return "";
  if (draft.length <= budgetForDraft) return draft;

  return truncateByCharsMarkdownSafe(draft, budgetForDraft);
}

/** ---------- style loading (keep behavior + strict cap) ---------- **/
function loadStyleSamples(files = [], maxTotalChars = 1000) {
  if (!fs.existsSync(REFERENCES_ACADEMIC)) {
    console.warn("[writing_under_style] references/academic 目录不存在，将不注入风格样本");
    return "";
  }
  if (files.length === 0) {
    console.warn("[writing_under_style] 未指定风格参考文件，将加载默认风格样本");
    files = ["academic-2a-tsyzm.md", "academic-2b-qnyj.md"];
  }

  const parts = [];
  let totalUsed = 0;

  // 为避免每个文件都加尾巴导致超限，按 remaining 动态裁剪
  for (const name of files) {
    const remaining = maxTotalChars - totalUsed;
    if (remaining <= 0) break;

    let fullPath = path.join(REFERENCES_ACADEMIC, name);
    if (!fs.existsSync(fullPath) && REFERENCES_SUBMIT_DIR && fs.existsSync(path.join(REFERENCES_SUBMIT_DIR, name))) {
      fullPath = path.join(REFERENCES_SUBMIT_DIR, name);
    }
    if (!fs.existsSync(fullPath)) {
      console.warn(`[writing_under_style] 未找到指定的风格参考文件: ${name}`);
      continue;
    }

    let text = stripBom(fs.readFileSync(fullPath, "utf8"));

    // 每个文件最多拿一部分，但严格受 remaining 控制
    // 先预留 header 与略号尾巴的空间
    const header = `--- ${name} ---\n`;
    const tail = "\n\n[... 略 ...]";
    const overhead = header.length + tail.length;

    if (remaining <= header.length + 10) break; // 剩下太少就别加了

    // 可用于正文的字符
    const bodyBudget = Math.max(0, remaining - header.length);
    // 先不急着加 tail，只有截断才加 tail
    let take = Math.min(text.length, bodyBudget);

    let body = text.slice(0, take);

    // 如果我们截断了正文，且 remaining 够放 tail，则加 tail；否则不加 tail
    const willTruncate = text.length > take;
    if (willTruncate) {
      // 如果加 tail 会超 remaining，就再缩一点
      if (header.length + body.length + tail.length > remaining) {
        const shrinkTo = Math.max(0, remaining - header.length - tail.length);
        body = body.slice(0, shrinkTo);
      }
      body += tail;
    }

    const chunk = header + body;
    parts.push(chunk);

    // 严格用实际写入的 chunk 长度累计，保证不超 maxTotalChars
    totalUsed += chunk.length;
  }

  const joined = parts.join("\n\n");
  // 双保险：若仍然超了（极端情况），再硬截一刀并补全围栏
  if (joined.length > maxTotalChars) {
    return truncateByCharsMarkdownSafe(joined, maxTotalChars);
  }
  return joined;
}

/** ---------- versioning ---------- **/
function getNextVersion(outDir, date) {
  if (!fs.existsSync(outDir)) return 1;
  const prefix = `review_${date}_v`;
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+)\\.md$`);
  let max = 0;
  for (const name of fs.readdirSync(outDir)) {
    const full = path.join(outDir, name);
    try {
      if (!fs.statSync(full).isFile()) continue;
    } catch {
      continue;
    }
    const m = name.match(re);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

/** ---------- chunk listing ---------- **/
function listChunkFiles(chunkDir) {
  const all = fs
    .readdirSync(chunkDir)
    .filter((f) => {
      if (!f.endsWith(".md")) return false;
      if (f.startsWith(".")) return false;
      if (f.endsWith("~")) return false;
      try {
        return fs.statSync(path.join(chunkDir, f)).isFile();
      } catch {
        return false;
      }
    });

  all.sort((a, b) => {
    const na = a.match(/^chunk_(\d+)/)?.[1];
    const nb = b.match(/^chunk_(\d+)/)?.[1];
    if (na && nb) return Number(na) - Number(nb);
    return a.localeCompare(b);
  });

  return all.map((f) => path.join(chunkDir, f));
}

/** 从 chunks_styled 目录按顺序读取已改写内容（用于 --merge-only） */
function readStyledPiecesFromDisk(styledDir) {
  const files = listChunkFiles(styledDir);
  return files
    .map((p) => stripBom(fs.readFileSync(p, "utf8")).trim())
    .filter(Boolean);
}

/** ---------- OpenAI client ---------- **/
function makeClient() {
  return new OpenAI({
    apiKey: API_KEY,
    baseURL: BASE_URL,
    timeout: 10 * 60 * 1000,
  });
}

/** ---------- prompts ---------- **/
const systemPromptChunk = `你是写作助手。请严格模仿用户提供的「写作样本」的句式、用词与段落风格，将「报告分块」改写为适合纳入综述（review）的连贯段落。要求：
1）文风与写作样本一致；
2）以连贯段落呈现，尽量少用列表（可以有极少量必要的小标题）；
3）保留分块中的核心论点与发现，不要编造未出现的信息；
4）不要引用“本分块/这一chunk/如下所示”等元叙述，直接写成综述正文；
5）保持学术克制，不要夸张修辞；
6）**必须保留文内引用**：原文中的 (Surname & Surname, Year) 或 (Surname et al., Year) 以及可点击链接 [文本](#paper-数字) 必须完整保留，不得删除或改写成无引用表述；文内引用仅用姓氏（2人 A & B，3人及以上 第一作者 et al.），链接外不要加括号；基于某篇/某几篇文献的论断在改写后仍须带对应引用，做到有理有据。`;

const systemPromptMerge = `你是写作助手。请将若干段“已改写的综述段落”整合成一篇连贯的综述（review）。要求：
1）整体风格统一，段落衔接自然；
2）允许使用少量必要的小标题，但不要堆砌小标题；
3）不要重复同义内容，尽量合并同类论点；
4）不编造事实，保留原段落中出现过的关键概念与发现；
5）**保留所有文内引用**：合并时不得删除 (Surname, Year) 或 [文本](#paper-数字) 形式的引用与链接；文内引用仅用姓氏，链接外不要加括号；综述中基于文献的论述须继续带引用。`;

/** ---------- API call with retry ---------- **/
function extractStatusCode(err) {
  // best-effort across SDK/proxy variants
  return (
    err?.status ??
    err?.response?.status ??
    err?.cause?.status ??
    err?.cause?.response?.status ??
    null
  );
}

function extractErrCode(err) {
  return err?.code ?? err?.cause?.code ?? null;
}

function isTransientError(err) {
  const status = extractStatusCode(err);
  const code = extractErrCode(err);
  const msg = (err?.message ?? String(err) ?? "").slice(0, 2000);

  // HTTP statuses: 429/5xx are often transient (esp behind proxy)
  if (status === 429) return true;
  if (status === 503) return true;
  if (status === 504) return true;
  if (status === 520) return true;
  if (status && status >= 500) return true;

  // Node/network codes
  if (code && /ETIMEDOUT|ECONNRESET|EAI_AGAIN|ENOTFOUND|ECONNREFUSED/i.test(code)) return true;

  // message patterns (proxy/html)
  if (/520|504|503|429|Gateway|time-out|timeout|ETIMEDOUT|ECONNRESET|<!DOCTYPE/i.test(msg)) return true;

  return false;
}

function systemWithUserHint(systemText) {
  if (!userPromptFlag || !String(userPromptFlag).trim()) return systemText;
  return systemText + "\n\n用户额外要求：" + String(userPromptFlag).trim();
}

async function chatComplete({ client, system, user, maxTokens, temperature }) {
  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemWithUserHint(system) },
      { role: "user", content: user },
    ],
    max_tokens: maxTokens,
    temperature,
  });

  const content = response.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("API 返回内容为空");
  return content;
}

async function callWithRetry(fn, { tries = 3, backoffMs = 1200 } = {}) {
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const transient = isTransientError(e);
      if (!transient || i === tries) break;
      await new Promise((r) => setTimeout(r, backoffMs * i));
    }
  }
  throw lastErr;
}

/** ---------- date ---------- **/
function getLocalYYYYMMDD(timeZone = DEFAULT_TZ) {
  // Use Intl for timezone-safe date string
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA gives YYYY-MM-DD
  const ymd = fmt.format(new Date());
  return ymd.replace(/-/g, "");
}

/** ---------- latest pointer ---------- **/
function writeLatestCopy(outputFile, outputDir) {
  try {
    const latestPath = path.join(outputDir, "review_latest.md");
    fs.copyFileSync(outputFile, latestPath);
    console.log(`已更新: ${latestPath}`);
  } catch (e) {
    console.warn("[writing_under_style] 写 review_latest.md 失败:", (e?.message ?? String(e)).slice(0, 200));
  }
}

/** ---------- merge + optional smooth ---------- **/
async function doMergeAndOptionalSmooth({ client, styleSamples, mergedDraft, outputFile, outputDir, projectRoot, topic }) {
  const draft = (mergedDraft || "").trim();
  if (!draft || draft.length < 50) {
    throw new Error("合并内容过短或为空，请检查 chunks_styled 下是否有有效 .md 文件。");
  }
  if (MERGE_MAX_CHARS < 500) {
    throw new Error("MERGE_MAX_CHARS 过小（<500），请设置合理上限以避免无效请求。");
  }

  console.log(`[writing_under_style] 正在合并为最终综述... (MERGE_MAX_CHARS(total)=${MERGE_MAX_CHARS})`);

  const prefix = `【我的写作风格参考（references/academic 下的文档）】\n\n${styleSamples}\n\n【已改写的综述段落（按分块顺序）】\n\n`;
  const suffix = `\n\n请将这些段落整合为一篇连贯的综述（review），输出 Markdown。`;

  const fittedDraft = fitDraftToPromptBudget({
    styleSamples,
    draft,
    promptWrapperPrefix: prefix,
    promptWrapperSuffix: suffix,
    maxTotalChars: MERGE_MAX_CHARS,
  });

  const mergePrompt = prefix + fittedDraft + suffix;

  const merged = await callWithRetry(
    () =>
      chatComplete({
        client,
        system: systemPromptMerge,
        user: mergePrompt,
        maxTokens: MERGE_MAX_TOKENS,
        temperature: MERGE_TEMPERATURE,
      }),
    { tries: 4, backoffMs: 1500 }
  );

  let finalText = merged.trim();

  if (projectRoot && topic) {
    finalText = normalizeCitationsToSurname(finalText, projectRoot, topic);
  }

  if (FINAL_SMOOTH) {
    console.log("[writing_under_style] FINAL_SMOOTH=1：执行一次轻量全局统一润色...");

    const smoothSystem = `你是写作助手。请对“综述草稿”做轻量润色，使其更像同一作者写作：
- 仅调整衔接、重复、措辞一致性
- 不要改动事实含义，不新增信息
- 保持段落体例，不要改成列表
输出 Markdown。`;

    // smooth 也走“总 prompt 上限”策略
    const smoothPrefix = `【综述草稿】\n\n`;
    const smoothSuffix = ``;

    const smoothDraft = fitDraftToPromptBudget({
      styleSamples: "", // smooth 不再带 style（避免浪费预算）
      draft: finalText,
      promptWrapperPrefix: smoothPrefix,
      promptWrapperSuffix: smoothSuffix,
      maxTotalChars: MERGE_MAX_CHARS,
    });

    const smoothUser = smoothPrefix + smoothDraft;

    finalText = (
      await callWithRetry(
        () =>
          chatComplete({
            client,
            system: smoothSystem,
            user: smoothUser,
            maxTokens: MERGE_MAX_TOKENS,
            temperature: SMOOTH_TEMPERATURE,
          }),
        { tries: 4, backoffMs: 1500 }
      )
    ).trim();
    if (projectRoot && topic) {
      finalText = normalizeCitationsToSurname(finalText, projectRoot, topic);
    }
  }

  const withHeader = `模型：${MODEL_LABEL}\n\n` + finalText;
  fs.writeFileSync(outputFile, withHeader + "\n", "utf8");
  console.log(`已保存: ${outputFile}`);
  writeLatestCopy(outputFile, outputDir);
}

/** ---------- arg parsing (compat) ---------- **/
const arg1 = process.argv[2]; // may be topic or input.md or flag
const defaultTopic = "artificial_intelligence";

/**
 * style files resolution priority:
 *  1) --style "a.md,b.md"
 *  2) 位置参数（旧行为）：node ... <topic> a.md b.md
 */
function parseStyleFilesFromArgs() {
  if (styleFlagValue) {
    return styleFlagValue
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // 旧行为：rest args 里排除 flags 以及它们的值
  const rest = process.argv.slice(3);
  const filtered = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--merge-only" || a === "--force") continue;
    if (a === "--style" || a === "--styled-dir") {
      i += 1; // skip value
      continue;
    }
    if (a.startsWith("--")) continue;
    filtered.push(a);
  }
  return filtered;
}

const styleFiles = parseStyleFilesFromArgs();

/**
 * topic 判定（保持你原逻辑）：
 * - arg1 为空 or 是 flag：topic=default
 * - arg1 是 .md：topic=default（单文件强制）
 * - 否则 arg1 当 topic
 */
const topic =
  !arg1 || arg1.startsWith("--") ? defaultTopic : isMdPath(arg1) ? defaultTopic : arg1;

const reportDir = path.join(PROJECT_ROOT, "outputs", topic, "05_report");
const chunkDir = path.join(reportDir, "chunks");

// 单文件输入：若 arg1 是 .md 则强制用它；否则用 report_latest.md
const defaultReportPath = path.join(reportDir, "report_latest.md");
function resolveInputPath(p) {
  if (path.isAbsolute(p)) return p;
  if (p.startsWith("./") || p.startsWith("../")) return path.resolve(p);
  return path.join(PROJECT_ROOT, p);
}
const inputFile = isMdPath(arg1) ? resolveInputPath(arg1) : defaultReportPath;

// 输出目录：允许 OUTPUT_DIR 覆盖，但默认按 topic 走
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(PROJECT_ROOT, "outputs", topic, "06_review");

function checkFilePath(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`文件不存在: ${filePath}`);
    process.exit(1);
  }
}

/** ---------- main ---------- **/
async function main() {
  if (!API_KEY) {
    console.error(PROVIDER === "glm" ? "请设置环境变量 ZHIPU_API_KEY" : "请设置环境变量 OPENAI_API_KEY");
    process.exit(1);
  }
  console.log("[writing_under_style] provider:", PROVIDER, "model:", MODEL);
  if (MERGE_MAX_CHARS < 500) {
    console.error("[writing_under_style] MERGE_MAX_CHARS 过小（<500），请设置合理上限（如 15000）。");
    process.exit(1);
  }

  const styleSamples = hasNoStyle ? "" : loadStyleSamples(styleFiles, MAX_STYLE_CHARS);
  if (hasNoStyle) {
    console.log("[writing_under_style] --no-style：不注入风格样本，直接生成综述");
  }
  if (!styleSamples && !hasNoStyle && fs.existsSync(REFERENCES_ACADEMIC)) {
    console.warn(
      "[writing_under_style] 未加载到任何风格样本（检查 references 下是否有对应 .md 文件）"
    );
  }

  ensureDir(OUTPUT_DIR);

  const today = getLocalYYYYMMDD(DEFAULT_TZ);
  const version = getNextVersion(OUTPUT_DIR, today);
  const outputFile = path.join(OUTPUT_DIR, `review_${today}_v${version}.md`);

  console.log("[writing_under_style] PROJECT_ROOT:", PROJECT_ROOT);
  console.log("[writing_under_style] topic:", topic);
  console.log("[writing_under_style] TZ:", DEFAULT_TZ, "=>", today);
  console.log("[writing_under_style] 风格参考:", REFERENCES_ACADEMIC);
  console.log("[writing_under_style] 风格参考上限:", MAX_STYLE_CHARS, "chars");
  console.log("[writing_under_style] OUTPUT_DIR:", OUTPUT_DIR);
  console.log("[writing_under_style] 输出:", outputFile);
  console.log(
    "[writing_under_style] temp:",
    `chunk=${CHUNK_TEMPERATURE}, merge=${MERGE_TEMPERATURE}, smooth=${SMOOTH_TEMPERATURE}`
  );

  const client = makeClient();

  /** ---- --merge-only：仅从已有 styled chunks 合并，不再调 N 次 API ---- */
  const defaultStyledDir = path.join(OUTPUT_DIR, "chunks_styled");
  const styledDir = styledDirFlag ? resolveInputPath(styledDirFlag) : defaultStyledDir;

  if (hasMergeOnly) {
    console.log("[writing_under_style] 模式: merge-only（仅从 chunks_styled 合并为最终综述）");
    console.log("[writing_under_style] styledDir:", styledDir);

    if (!existsNonEmptyDir(styledDir)) {
      console.error("[writing_under_style] --merge-only 需要 styledDir 存在且内含 .md。");
      console.error("  - 你可以先跑一次 chunk 模式生成 chunks_styled");
      console.error("  - 或用 --styled-dir 指向已有目录");
      process.exit(1);
    }

    const styledPieces = readStyledPiecesFromDisk(styledDir);
    if (styledPieces.length === 0) {
      console.error("[writing_under_style] styledDir 下未读到任何有效内容，请检查 .md 文件是否非空。");
      process.exit(1);
    }
    const mergedDraft = styledPieces.filter(Boolean).join("\n\n");
    await doMergeAndOptionalSmooth({
      client,
      styleSamples,
      mergedDraft,
      outputFile,
      outputDir: OUTPUT_DIR,
      projectRoot: PROJECT_ROOT,
      topic,
    });
    return;
  }

  /** ---- Mode decision ----
   * 如果没显式传 input.md（即 arg1 不是 .md），并且 chunks 存在且非空，则启用 chunk 模式
   * 否则：单文件模式
   */
  const forceSingle = isMdPath(arg1); // 用户明确给了输入文件，就别自动 chunk 了（避免惊讶）
  const useChunks = !forceSingle && existsNonEmptyDir(chunkDir);

  if (useChunks) {
    console.log("[writing_under_style] 模式: chunk（逐块改写，避免超时）");
    console.log("[writing_under_style] chunkDir:", chunkDir);

    const chunks = listChunkFiles(chunkDir);
    if (chunks.length === 0) {
      console.error("[writing_under_style] chunkDir 下无有效 .md 文件，请检查或改用单文件模式。");
      process.exit(1);
    }
    ensureDir(defaultStyledDir);

    const styledPieces = [];

    for (const chunkPath of chunks) {
      const base = path.basename(chunkPath);
      const outChunk = path.join(defaultStyledDir, base);

      // 断点续跑：已有且非空则跳过（除非 --force）
      if (!hasForce && fs.existsSync(outChunk)) {
        try {
          const existing = stripBom(fs.readFileSync(outChunk, "utf8")).trim();
          if (existing.length > 20) {
            console.log(`[writing_under_style] 跳过已有 chunk: ${base} （用 --force 强制重跑）`);
            styledPieces.push(existing);
            continue;
          }
        } catch {
          // fallthrough to re-run
        }
      }

      const rawChunk = stripBom(fs.readFileSync(chunkPath, "utf8"));
      const chunkText = truncateByCharsMarkdownSafe(rawChunk, CHUNK_MAX_CHARS);

      const userPrompt =
        `【我的写作风格参考（references/academic 下的文档）】\n\n${styleSamples}\n\n` +
        `【报告分块：${base}】\n\n${chunkText}\n\n` +
        `请将该分块改写成可直接纳入综述正文的连贯段落（Markdown）。`;

      console.log(`[writing_under_style] 正在处理 chunk: ${base} ...`);

      const styled = await callWithRetry(
        () =>
          chatComplete({
            client,
            system: systemPromptChunk,
            user: userPrompt,
            maxTokens: CHUNK_MAX_TOKENS,
            temperature: CHUNK_TEMPERATURE,
          }),
        { tries: 4, backoffMs: 1500 }
      );

      fs.writeFileSync(outChunk, styled.trim() + "\n", "utf8");
      styledPieces.push(styled.trim());

      console.log(`[writing_under_style] 已保存 chunk: ${outChunk}`);
    }

    const mergedDraft = styledPieces.filter(Boolean).join("\n\n");
    await doMergeAndOptionalSmooth({
      client,
      styleSamples,
      mergedDraft,
      outputFile,
      outputDir: OUTPUT_DIR,
      projectRoot: PROJECT_ROOT,
      topic,
    });
    return;
  }

  /** ---- single doc mode ---- */
  console.log("[writing_under_style] 模式: single-doc（单文件一次性改写）");
  console.log("[writing_under_style] 输入:", inputFile);

  checkFilePath(inputFile);
  const reportContent = stripBom(fs.readFileSync(inputFile, "utf8"));

  const systemPrompt = `你是写作助手。请严格模仿用户提供的「写作样本」的句式、用词与段落风格，将「待改写的报告」改写成一篇成段落的综述（review）。要求：
1）文风与写作样本一致；
2）以连贯段落呈现，不要用列表或小标题堆砌（允许极少量必要的小标题）；
3）保留报告中的核心论点和发现，逻辑清晰、段落之间自然衔接；
4）不要编造报告中未出现的信息。`;

  const prefix = styleSamples
    ? `【我的写作风格参考（references/academic 下的文档）】\n\n${styleSamples}\n\n【待改写的报告】\n\n`
    : `【待改写的报告】\n\n`;

  const suffix = `\n\n请将上述报告改写成一篇成段落的综述，输出为 Markdown。`;

  // 单文件也用“总 prompt 上限”来控输入（否则 report 很长时仍可能撞网关）
  const fittedReport = fitDraftToPromptBudget({
    styleSamples,
    draft: reportContent,
    promptWrapperPrefix: prefix,
    promptWrapperSuffix: suffix,
    maxTotalChars: MERGE_MAX_CHARS,
  });

  const userPrompt = prefix + fittedReport + suffix;

  console.log("[writing_under_style] 正在请求 API...");

  try {
    const content = await callWithRetry(
      () =>
        chatComplete({
          client,
          system: systemPrompt,
          user: userPrompt,
          maxTokens: MERGE_MAX_TOKENS,
          temperature: MERGE_TEMPERATURE,
        }),
      { tries: 4, backoffMs: 1500 }
    );

    let finalContent = content.trim();
    finalContent = normalizeCitationsToSurname(finalContent, PROJECT_ROOT, topic);
    const withHeader = `模型：${MODEL_LABEL}\n\n` + finalContent;
    fs.writeFileSync(outputFile, withHeader + "\n", "utf8");
    console.log(`已保存: ${outputFile}`);
    writeLatestCopy(outputFile, OUTPUT_DIR);
  } catch (err) {
    const msg = err?.message ?? String(err);
    const status = extractStatusCode(err);
    const code = extractErrCode(err);

    if (isTransientError(err)) {
      console.error(
        `[writing_under_style] 当前 API/网关服务异常（status=${status ?? "?"}, code=${code ?? "?"}）。` +
          `可稍后重试，或设置 OPENAI_BASE_URL 换用其他接口。`
      );
      console.error("[writing_under_style] 若为合并阶段 504/520，可缩小请求后重试: MERGE_MAX_CHARS=12000 node writing_under_style.mjs <topic> --merge-only");
    } else {
      console.error("[writing_under_style] API 或写入出错:", msg.slice(0, 600));
    }
    process.exit(1);
  }
}

main().catch((e) => {
  const msg = e?.message ?? String(e);
  const status = extractStatusCode(e);
  const code = extractErrCode(e);

  if (isTransientError(e)) {
    console.error(
      `[writing_under_style] 当前 API/网关服务异常（status=${status ?? "?"}, code=${code ?? "?"}）。` +
        `可稍后重试，或设置 OPENAI_BASE_URL 换用其他接口。`
    );
    console.error("[writing_under_style] 若为合并阶段 504/520，可缩小请求后重试: MERGE_MAX_CHARS=12000 node writing_under_style.mjs <topic> --merge-only");
  } else {
    console.error("[writing_under_style] 致命错误:", e?.stack || msg);
  }
  process.exit(1);
});