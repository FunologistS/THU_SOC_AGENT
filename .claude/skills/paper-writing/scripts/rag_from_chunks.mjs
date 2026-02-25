#!/usr/bin/env node
/**
 * rag_from_chunks.mjs — 基于 outputs/<topic>/06_review/chunks_styled 做 RAG：
 *   - 中文友好 BM25（无依赖）
 *   - 向量索引持久化 + 增量更新（可选）
 *   - Hybrid 检索（BM25 + cosine）
 *   - 可选 LLM rerank
 *   - 可选生成综述段落（强制引用绑定）
 *
 * 用法示例：
 *   # 仅检索（BM25，离线）
 *   node rag_from_chunks.mjs artificial_intelligence --query "算法治理" --top 5
 *
 *   # 建/更新向量索引（需要 OPENAI_API_KEY）
 *   node rag_from_chunks.mjs artificial_intelligence --index
 *
 *   # Hybrid 检索（BM25 + 向量；需要索引）
 *   node rag_from_chunks.mjs artificial_intelligence --query "LLM 与社会科学" --top 8 --mode hybrid
 *
 *   # 检索 + 生成（默认用 gpt-5.2；强制引用 tag）
 *   node rag_from_chunks.mjs artificial_intelligence --query "算法治理" --top 8 --mode hybrid --generate --out outputs/artificial_intelligence/06_review/paragraph.md
 *
 *   # 过滤（依赖 frontmatter 元数据）
 *   node rag_from_chunks.mjs artificial_intelligence --query "职业分化" --filter "year>=2020;cluster=2" --top 8 --mode hybrid
 *
 *   # 可选：LLM rerank（对 topN 重排，更准但要花 token）
 *   node rag_from_chunks.mjs artificial_intelligence --query "模型决定论" --top 12 --mode hybrid --rerank --rerank-top 30
 *
 * 环境变量：
 *   OPENAI_API_KEY        必填（用向量/生成/rerank 时需要）
 *   OPENAI_BASE_URL       可选，默认 https://api.gptsapi.net/v1
 *   OPENAI_MODEL          可选，默认 gpt-5.2
 *   OPENAI_EMBED_MODEL    可选，默认 text-embedding-3-small
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { OpenAI } from "openai";

/** ------------------------ 基础路径探测 ------------------------ **/
const __dirname = path.dirname(fileURLToPath(import.meta.url));
let PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
if (!fs.existsSync(path.join(PROJECT_ROOT, "outputs"))) {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, "outputs"))) PROJECT_ROOT = cwd;
}

const API_KEY = process.env.OPENAI_API_KEY;
const BASE_URL = process.env.OPENAI_BASE_URL || "https://api.gptsapi.net/v1";
const MODEL = process.env.OPENAI_MODEL || "gpt-5.2";
const EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";

/** ------------------------ 参数解析 ------------------------ **/
function getFlagValue(argv, flag, def = null) {
  const idx = argv.indexOf(flag);
  if (idx >= 0 && idx + 1 < argv.length) return argv[idx + 1];
  return def;
}
function hasFlag(argv, flag) {
  return argv.includes(flag);
}
function parseArgs() {
  const argv = process.argv.slice(2);
  const topic = (argv[0] && !argv[0].startsWith("--")) ? argv[0] : "artificial_intelligence";

  const query = getFlagValue(argv, "--query");
  const top = Math.max(1, parseInt(getFlagValue(argv, "--top", "8"), 10));

  const chunksDir = getFlagValue(argv, "--chunks-dir");
  const mode = (getFlagValue(argv, "--mode", "auto") || "auto").toLowerCase(); // auto|keyword|embed|hybrid
  const alpha = Math.min(1, Math.max(0, parseFloat(getFlagValue(argv, "--alpha", "0.5")))); // hybrid: embed权重
  const generate = hasFlag(argv, "--generate");
  const outPath = getFlagValue(argv, "--out");

  const doIndex = hasFlag(argv, "--index");
  const noAutoIndex = hasFlag(argv, "--no-auto-index");

  const filterStr = getFlagValue(argv, "--filter");
  const show = Math.max(0, parseInt(getFlagValue(argv, "--show", "300"), 10)); // 打印每个chunk预览长度

  const rerank = hasFlag(argv, "--rerank");
  const rerankTop = Math.max(5, parseInt(getFlagValue(argv, "--rerank-top", "30"), 10));

  const debug = hasFlag(argv, "--debug");

  return {
    topic,
    query,
    top,
    chunksDir,
    mode,
    alpha,
    generate,
    outPath,
    doIndex,
    noAutoIndex,
    filterStr,
    show,
    rerank,
    rerankTop,
    debug,
  };
}

function resolveChunksDir(topic, chunksDir) {
  if (chunksDir) return path.isAbsolute(chunksDir) ? chunksDir : path.join(PROJECT_ROOT, chunksDir);
  return path.join(PROJECT_ROOT, "outputs", topic, "06_review", "chunks_styled");
}
function indexPathForDir(dir) {
  return path.join(dir, ".rag_index.json");
}

/** ------------------------ 工具函数 ------------------------ **/
function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}
function readText(fp) {
  return fs.readFileSync(fp, "utf-8").replace(/^\uFEFF/, "");
}
function safeMkdir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}
function isDirectory(p) {
  try {
    return fs.existsSync(p) && fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** ------------------------ Frontmatter 解析（轻量版） ------------------------
 * 支持：
 * ---
 * key: value
 * year: 2024
 * author: Wu; Sun
 * ---
 * 正文...
 */
function parseFrontmatter(mdText) {
  const text = mdText || "";
  if (!text.startsWith("---\n")) return { meta: {}, body: text };
  const end = text.indexOf("\n---\n", 4);
  if (end < 0) return { meta: {}, body: text };
  const fm = text.slice(4, end).trim();
  const body = text.slice(end + 5);
  const meta = {};
  for (const line of fm.split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_\-]+)\s*:\s*(.*?)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    // 去引号
    val = val.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    // 数字
    if (/^\d+$/.test(val)) val = parseInt(val, 10);
    meta[key] = val;
  }
  return { meta, body };
}

/** ------------------------ Chunks 载入 ------------------------ **/
function loadChunks(dir) {
  if (!isDirectory(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
  return files.map((name) => {
    const fp = path.join(dir, name);
    const raw = readText(fp);
    const { meta, body } = parseFrontmatter(raw);
    const text = body.trim();
    return {
      id: `chunk:${name}`,
      name,
      path: fp,
      raw,
      text,
      meta,
      hash: sha256(raw),
      length: raw.length,
    };
  });
}

/** ------------------------ 中文/英文 Tokenize（无依赖） ------------------------
 * 目标：给 BM25 用，不追求完美，只要比 “按空格拆词” 强。
 * 策略：
 * - 英文/数字：按词切
 * - 中文：用“滑动二元/三元字块” + 单字（过滤停用/标点）
 */
const CN_CHAR = /[\u4e00-\u9fff]/;
const WORD_RE = /[A-Za-z0-9_]+/g;

function normalizeText(s) {
  return (s || "")
    .replace(/\s+/g, " ")
    .replace(/[“”‘’]/g, '"')
    .trim()
    .toLowerCase();
}

function tokenizeForBm25(s) {
  const text = normalizeText(s);
  const tokens = [];

  // 英文词
  const eng = text.match(WORD_RE) || [];
  for (const w of eng) {
    if (w.length >= 2) tokens.push(w);
  }

  // 中文：抽取连续中文段
  let buf = "";
  for (const ch of text) {
    if (CN_CHAR.test(ch)) buf += ch;
    else {
      if (buf.length) {
        tokens.push(...cnNgrams(buf));
        buf = "";
      }
    }
  }
  if (buf.length) tokens.push(...cnNgrams(buf));

  return tokens.filter(Boolean);
}

function cnNgrams(s) {
  // s: 纯中文串
  const out = [];
  const clean = s.replace(/[，。！？；：、（）《》【】“”‘’"'\-—…·]/g, "");
  if (!clean) return out;
  // 单字（信息弱，少用）
  for (let i = 0; i < clean.length; i++) out.push(clean[i]);
  // 二元
  for (let i = 0; i < clean.length - 1; i++) out.push(clean.slice(i, i + 2));
  // 三元（更稳一点，但会多）
  for (let i = 0; i < clean.length - 2; i++) out.push(clean.slice(i, i + 3));
  return out;
}

/** ------------------------ BM25 实现 ------------------------ **/
function buildBm25Index(chunks) {
  const docs = [];
  const df = new Map(); // term -> docfreq
  let totalLen = 0;

  for (const c of chunks) {
    const tokens = tokenizeForBm25(c.text);
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    const uniq = new Set(tf.keys());
    for (const t of uniq) df.set(t, (df.get(t) || 0) + 1);
    docs.push({ id: c.id, tf, len: tokens.length });
    totalLen += tokens.length;
  }

  const avgdl = docs.length ? totalLen / docs.length : 0;
  return { docs, df, avgdl, N: docs.length };
}

function bm25Score(index, query, docIdx, k1 = 1.2, b = 0.75) {
  const qTokens = tokenizeForBm25(query);
  if (!qTokens.length) return 0;

  const doc = index.docs[docIdx];
  const { df, avgdl, N } = index;
  const dl = doc.len || 1;

  let score = 0;
  for (const t of qTokens) {
    const f = doc.tf.get(t) || 0;
    if (!f) continue;
    const n = df.get(t) || 0;
    // idf (Okapi)
    const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
    const denom = f + k1 * (1 - b + b * (dl / (avgdl || 1)));
    score += idf * ((f * (k1 + 1)) / denom);
  }
  return score;
}

function bm25Retrieve(chunks, query, top) {
  const idx = buildBm25Index(chunks);
  const scored = chunks.map((c, i) => ({ chunk: c, score: bm25Score(idx, query, i) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, top);
}

/** ------------------------ 向量索引（持久化 + 增量更新） ------------------------ **/
function loadIndex(indexPath) {
  if (!fs.existsSync(indexPath)) return null;
  try {
    const obj = JSON.parse(readText(indexPath));
    if (!obj || obj.version !== 1) return null;
    return obj;
  } catch {
    return null;
  }
}

function saveIndex(indexPath, obj) {
  fs.writeFileSync(indexPath, JSON.stringify(obj, null, 2), "utf-8");
}

function openaiClient() {
  if (!API_KEY) return null;
  return new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL });
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const norm = Math.sqrt(na) * Math.sqrt(nb);
  return norm ? dot / norm : 0;
}

function limitConcurrency(n) {
  let active = 0;
  const queue = [];
  const runNext = () => {
    if (active >= n) return;
    const job = queue.shift();
    if (!job) return;
    active++;
    job()
      .catch(() => {})
      .finally(() => {
        active--;
        runNext();
      });
  };
  return function schedule(fn) {
    return new Promise((resolve, reject) => {
      queue.push(async () => {
        try {
          const r = await fn();
          resolve(r);
        } catch (e) {
          reject(e);
        }
      });
      runNext();
    });
  };
}

async function embedText(client, text) {
  const res = await client.embeddings.create({
    model: EMBED_MODEL,
    input: text.slice(0, 8000),
  });
  return res.data?.[0]?.embedding || null;
}

async function buildOrUpdateIndex(chunks, dir, { debug = false } = {}) {
  const idxPath = indexPathForDir(dir);
  const existing = loadIndex(idxPath);
  const client = openaiClient();
  if (!client) {
    console.error("[index] 需要 OPENAI_API_KEY 才能构建向量索引。");
    process.exit(1);
  }

  const now = new Date().toISOString();
  const base = existing && existing.embed_model === EMBED_MODEL ? existing : null;
  const byName = new Map();
  if (base?.items?.length) {
    for (const it of base.items) byName.set(it.name, it);
  }

  const schedule = limitConcurrency(4); // 防止并发过高
  let updated = 0;
  let kept = 0;

  const newItems = [];
  for (const c of chunks) {
    const prev = byName.get(c.name);
    if (prev && prev.hash === c.hash && Array.isArray(prev.embedding)) {
      newItems.push({ ...prev });
      kept++;
      continue;
    }

    const textForEmbed = (c.name + "\n" + c.text).slice(0, 8000);
    const embedding = await schedule(async () => {
      if (debug) console.error(`[index] embedding: ${c.name} ...`);
      return await embedText(client, textForEmbed);
    });

    if (!embedding) {
      console.error("[index] embedding 失败:", c.name);
      continue;
    }
    updated++;

    newItems.push({
      name: c.name,
      id: c.id,
      path: c.path,
      hash: c.hash,
      meta: c.meta || {},
      embedding,
      updated_at: now,
    });
  }

  const out = {
    version: 1,
    created_at: base?.created_at || now,
    updated_at: now,
    embed_model: EMBED_MODEL,
    base_url: BASE_URL,
    items: newItems,
  };
  saveIndex(idxPath, out);

  console.error(`[index] 写入索引: ${idxPath} | kept=${kept} updated=${updated} total=${newItems.length}`);
  return out;
}

/** ------------------------ 过滤条件解析 ------------------------
 * 支持：
 *  year>=2020;year<=2025
 *  cluster=2
 *  author~王  (包含)
 *  title~治理
 *  paper_id=xxx
 */
function parseFilter(filterStr) {
  if (!filterStr) return [];
  const parts = filterStr.split(";").map((s) => s.trim()).filter(Boolean);
  const clauses = [];
  for (const p of parts) {
    let m;
    if ((m = p.match(/^(\w+)\s*>=\s*(.+)$/))) clauses.push({ k: m[1], op: ">=", v: m[2] });
    else if ((m = p.match(/^(\w+)\s*<=\s*(.+)$/))) clauses.push({ k: m[1], op: "<=", v: m[2] });
    else if ((m = p.match(/^(\w+)\s*=\s*(.+)$/))) clauses.push({ k: m[1], op: "=", v: m[2] });
    else if ((m = p.match(/^(\w+)\s*~\s*(.+)$/))) clauses.push({ k: m[1], op: "~", v: m[2] });
  }
  return clauses;
}

function passFilter(chunk, clauses) {
  if (!clauses.length) return true;
  const m = chunk.meta || {};
  for (const c of clauses) {
    const val = m[c.k];
    if (val === undefined || val === null) return false;

    if (c.op === "=") {
      if (String(val) !== String(c.v)) return false;
    } else if (c.op === "~") {
      if (!String(val).includes(String(c.v))) return false;
    } else if (c.op === ">=") {
      const a = Number(val), b = Number(c.v);
      if (!(a >= b)) return false;
    } else if (c.op === "<=") {
      const a = Number(val), b = Number(c.v);
      if (!(a <= b)) return false;
    }
  }
  return true;
}

/** ------------------------ 检索：keyword/embed/hybrid ------------------------ **/
function normalizeScores(arr) {
  // arr: [{chunk, score}]
  const scores = arr.map((x) => x.score);
  const max = Math.max(...scores, 0);
  const min = Math.min(...scores, 0);
  const range = max - min;
  if (!range) return arr.map((x) => ({ ...x, norm: 0 }));
  return arr.map((x) => ({ ...x, norm: (x.score - min) / range }));
}

async function embedRetrieve(chunks, query, top, dir, { autoIndex = true, debug = false } = {}) {
  const idxPath = indexPathForDir(dir);
  let idx = loadIndex(idxPath);

  if (!idx) {
    if (!autoIndex) {
      console.error(`[embed] 未找到索引：${idxPath}。先运行 --index 构建索引，或去掉 --no-auto-index 允许自动构建。`);
      process.exit(1);
    }
    console.error(`[embed] 未找到索引，自动构建中：${idxPath}`);
    idx = await buildOrUpdateIndex(chunks, dir, { debug });
  }

  if (idx.embed_model !== EMBED_MODEL) {
    console.error(`[embed] 索引的 embed_model=${idx.embed_model} 与当前 EMBED_MODEL=${EMBED_MODEL} 不一致。建议重新 --index。`);
  }

  const client = openaiClient();
  if (!client) {
    console.error("[embed] 需要 OPENAI_API_KEY。");
    process.exit(1);
  }

  const qEmb = await embedText(client, query);
  if (!qEmb) {
    console.error("[embed] query embedding 失败。");
    process.exit(1);
  }

  const byName = new Map(idx.items.map((it) => [it.name, it]));
  const scored = [];
  for (const c of chunks) {
    const it = byName.get(c.name);
    if (!it?.embedding) continue;
    const score = cosineSimilarity(qEmb, it.embedding);
    scored.push({ chunk: c, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, top);
}

async function hybridRetrieve(chunks, query, top, dir, alpha, opts) {
  // alpha: embedding 权重；(1-alpha): bm25 权重
  const bm = bm25Retrieve(chunks, query, Math.max(top, 50));
  const em = await embedRetrieve(chunks, query, Math.max(top, 50), dir, opts);

  const bmN = normalizeScores(bm);
  const emN = normalizeScores(em);

  const bmMap = new Map(bmN.map((x) => [x.chunk.name, x.norm]));
  const emMap = new Map(emN.map((x) => [x.chunk.name, x.norm]));

  const union = new Map();
  for (const c of chunks) {
    const b = bmMap.get(c.name) || 0;
    const e = emMap.get(c.name) || 0;
    const score = (1 - alpha) * b + alpha * e;
    if (score > 0) union.set(c.name, { chunk: c, score, bm: b, em: e });
  }

  const arr = Array.from(union.values());
  arr.sort((a, b) => b.score - a.score);
  return arr.slice(0, top);
}

async function retrieve(chunks, query, top, dir, { mode, alpha, noAutoIndex, debug } = {}) {
  const client = openaiClient();
  const canEmbed = !!client;

  let m = mode;
  if (m === "auto") {
    // auto: 有 key 则 hybrid，否则 keyword
    m = canEmbed ? "hybrid" : "keyword";
  }

  if (m === "keyword") return bm25Retrieve(chunks, query, top);
  if (m === "embed") return embedRetrieve(chunks, query, top, dir, { autoIndex: !noAutoIndex, debug });
  if (m === "hybrid") {
    if (!canEmbed) {
      console.error("[hybrid] 没有 OPENAI_API_KEY，自动降级为 keyword(BM25)。");
      return bm25Retrieve(chunks, query, top);
    }
    return hybridRetrieve(chunks, query, top, dir, alpha, { autoIndex: !noAutoIndex, debug });
  }

  console.error("未知 mode:", mode);
  process.exit(1);
}

/** ------------------------ 可选：LLM rerank ------------------------ **/
async function llmRerank(query, candidates, topKeep) {
  const client = openaiClient();
  if (!client) {
    console.error("[rerank] 需要 OPENAI_API_KEY。");
    process.exit(1);
  }

  // 为了省 token，给每个候选只传很短摘要（头600字）
  const items = candidates.map((x, i) => {
    const c = x.chunk;
    const meta = c.meta || {};
    const header = [
      `ID: ${c.id}`,
      meta.author ? `author: ${meta.author}` : "",
      meta.year ? `year: ${meta.year}` : "",
      meta.title ? `title: ${meta.title}` : "",
      meta.cluster ? `cluster: ${meta.cluster}` : "",
    ].filter(Boolean).join(" | ");
    const snippet = c.text.slice(0, 600).replace(/\s+/g, " ").trim();
    return { idx: i + 1, id: c.id, header, snippet };
  });

  const prompt = [
    `你是一个严谨的检索重排序器。用户查询：「${query}」。`,
    `下面给出若干候选片段，请你按“对回答该查询的直接相关性”从高到低排序，并返回前 ${topKeep} 个的 idx 列表。`,
    `规则：`,
    `- 只根据候选片段内容判断相关性；`,
    `- 主题相近但不回答问题的，排后；`,
    `- 返回 JSON：{"ranked":[3,1,5,...]}，不要输出其他文本。`,
    ``,
    ...items.map((it) => `### idx=${it.idx}\n${it.header}\n${it.snippet}`),
  ].join("\n");

  const res = await client.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
    max_tokens: 300,
  });

  const text = res.choices?.[0]?.message?.content?.trim() || "";
  let ranked = [];
  try {
    const obj = JSON.parse(text);
    if (Array.isArray(obj.ranked)) ranked = obj.ranked.map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n));
  } catch {
    // 失败就不 rerank
    return candidates.slice(0, topKeep);
  }

  const picked = [];
  for (const idx of ranked) {
    const i = idx - 1;
    if (i >= 0 && i < candidates.length) picked.push(candidates[i]);
    if (picked.length >= topKeep) break;
  }
  // fallback 补齐
  if (picked.length < topKeep) {
    for (const x of candidates) {
      if (picked.includes(x)) continue;
      picked.push(x);
      if (picked.length >= topKeep) break;
    }
  }
  return picked;
}

/** ------------------------ 生成：强制引用绑定 ------------------------ **/
function formatMetaLine(meta = {}) {
  const parts = [];
  if (meta.author) parts.push(String(meta.author));
  if (meta.year) parts.push(String(meta.year));
  if (meta.title) parts.push(String(meta.title));
  if (meta.paper_id) parts.push(String(meta.paper_id));
  if (meta.cluster) parts.push(`cluster=${meta.cluster}`);
  return parts.join(" | ");
}

function buildGeneratePrompt(query, retrieved) {
  const context = retrieved
    .map((x, i) => {
      const c = x.chunk || x; // 兼容不同结构
      const metaLine = formatMetaLine(c.meta);
      const head = metaLine ? `**${metaLine}**` : "";
      return `## 参考 ${i + 1}（${c.id} / ${c.name}）\n${head}\n\n${c.text}`;
    })
    .join("\n\n---\n\n");

  return [
    `你是一位严谨的社会学文献综述作者。请**仅依据**下面提供的参考片段，围绕主题/问题「${query}」写出连贯的综述段落（1–4 段）。`,
    ``,
    `硬性要求（必须遵守）：`,
    `1) **不得**引入参考片段之外的事实、论文、数据或作者；不确定就明确写“参考不足”。`,
    `2) 你的每个关键论断/概括句后必须带引用标签，格式为 **[@chunk:文件名.md]**，且引用只能来自本次提供的 chunks。`,
    `   - 例：……因此形成了两种路径分歧。[@chunk:chunk_001.md][@chunk:chunk_017.md]`,
    `3) 尽量做“述而有评”：在忠于原意的前提下，可以概括视角差异、证据类型与局限，但每个评价也要有引用支撑。`,
    `4) 输出 Markdown 正文即可，不要输出“参考列表/目录/解释”。`,
    ``,
    `参考片段：`,
    context,
  ].join("\n");
}

async function generateFromChunks(query, retrieved) {
  const client = openaiClient();
  if (!client) {
    console.error("[generate] 需要 OPENAI_API_KEY。");
    process.exit(1);
  }
  const prompt = buildGeneratePrompt(query, retrieved);
  const res = await client.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    max_tokens: 2200,
  });
  return (res.choices?.[0]?.message?.content || "").trim();
}

/** ------------------------ 主流程 ------------------------ **/
async function main() {
  const args = parseArgs();
  const dir = resolveChunksDir(args.topic, args.chunksDir);
  const idxPath = indexPathForDir(dir);

  if (!isDirectory(dir)) {
    console.error("未找到 chunks 目录:", dir);
    process.exit(1);
  }

  const allChunks = loadChunks(dir);
  if (!allChunks.length) {
    console.error("未找到 .md chunk 文件，目录:", dir);
    process.exit(1);
  }

  const clauses = parseFilter(args.filterStr);
  const chunks = allChunks.filter((c) => passFilter(c, clauses));

  if (args.doIndex) {
    await buildOrUpdateIndex(chunks, dir, { debug: args.debug });
    return;
  }

  if (!args.query) {
    console.log("用法:");
    console.log('  node rag_from_chunks.mjs [topic] --query "主题或问题" [--top N] [--mode auto|keyword|embed|hybrid] [--generate] [--out out.md]');
    console.log("目录:", dir);
    console.log("chunk 数量:", allChunks.length, "| 过滤后:", chunks.length);
    console.log("向量索引:", fs.existsSync(idxPath) ? idxPath : "(不存在，可用 --index 构建)");
    process.exit(0);
  }

  if (!chunks.length) {
    console.error("过滤后无可用 chunk。请检查 --filter 或 frontmatter 元数据。");
    process.exit(1);
  }

  // 检索
  let retrieved = await retrieve(chunks, args.query, args.top, dir, {
    mode: args.mode,
    alpha: args.alpha,
    noAutoIndex: args.noAutoIndex,
    debug: args.debug,
  });

  // rerank（可选）
  if (args.rerank) {
    const cand = await retrieve(chunks, args.query, Math.max(args.rerankTop, args.top), dir, {
      mode: args.mode,
      alpha: args.alpha,
      noAutoIndex: args.noAutoIndex,
      debug: args.debug,
    });
    const reranked = await llmRerank(args.query, cand, args.top);
    retrieved = reranked;
  }

  // 打印检索结果预览
  console.log(`检索到 ${retrieved.length} 个相关 chunk（query: ${args.query} | mode=${args.mode} | alpha=${args.alpha}）\n`);
  for (const item of retrieved) {
    const c = item.chunk || item;
    const metaLine = formatMetaLine(c.meta);
    const scoreLine = item.score !== undefined ? `score=${item.score.toFixed(4)}` : "";
    console.log(`--- ${c.id} (${c.name}) ${scoreLine}`);
    if (metaLine) console.log(metaLine);
    if (args.show > 0) {
      const preview = c.text.slice(0, args.show);
      console.log(preview + (c.text.length > args.show ? "..." : ""));
    }
    console.log("");
  }

  // 生成（可选）
  if (args.generate) {
    console.log("正在根据检索结果生成段落...\n");
    const paragraph = await generateFromChunks(args.query, retrieved);

    if (args.outPath) {
      const out = path.isAbsolute(args.outPath) ? args.outPath : path.join(PROJECT_ROOT, args.outPath);
      safeMkdir(path.dirname(out));
      fs.writeFileSync(out, paragraph, "utf-8");
      console.log("已写入:", out);
    } else {
      console.log("--- 生成段落 ---\n");
      console.log(paragraph);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});