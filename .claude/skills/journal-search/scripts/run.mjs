#!/usr/bin/env node
/**
 * journal-search/run.mjs
 *
 * Purpose:
 *   Use OpenAlex to search works by topic across a curated journal list (OpenAlex sources),
 *   optionally fill missing/invalid abstracts via publisher landing page + Firecrawl + Crossref fallback,
 *   and export a versioned Markdown table to outputs/<topic>/01_raw/.
 *   On each run, the script scaffolds the full topic tree under outputs/<topic>/:
 *   01_raw, 02_clean, 03_summaries, 04_meta, 05_report, 06_review (downstream skills write into these).
 *
 * Usage:
 *   # Fast (no abstract fallback)
 *   node .claude/skills/journal-search/scripts/run.mjs artificial_intelligence \
 *     --journals .claude/skills/journal-catalog/references/system/journals.yml
 *
 *   # Slow (enable abstract fallback)
 *   ABSTRACT_FALLBACK=1 node .claude/skills/journal-search/scripts/run.mjs artificial_intelligence \
 *     --journals .claude/skills/journal-catalog/references/system/journals.yml
 *
 * Env:
 *   OPENALEX_API_KEY      optional; use your API key (openalex.org/settings/api) to use your $1/day free budget instead of anonymous limit
 *   OPENALEX_EMAIL        optional (mailto=) for polite OpenAlex requests
 *   DEBUG_OPENALEX=1      verbose OpenAlex debug logs
 *   DEBUG_FIRECRAWL=1     verbose Firecrawl debug logs
 *   FIRECRAWL_API_KEY     enable Firecrawl fallback
 *   ABSTRACT_FALLBACK=1   enable abstract fallback
 */

import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import * as cheerio from "cheerio";
import { stemmer } from "stemmer";

console.log("[script]", new URL(import.meta.url).pathname);

const DEBUG = process.env.DEBUG_OPENALEX === "1";
const DEBUG_FC = process.env.DEBUG_FIRECRAWL === "1";

/* ===============================
   Text / Abstract utils
================================= */

// ✅ 同时处理：字面量 \n + 真实换行 + nbsp + 多空格 + 轻量 HTML
function cleanText(s) {
  return String(s || "")
    .replace(/\\n/g, " ") // 字面量 \n
    .replace(/\r\n|\n|\r/g, " ") // 真实换行
    .replace(/\u00a0/g, " ")
    .replace(/<\/?[^>]+>/g, " ") // 轻量去 HTML 标签
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWhitespace(s) {
  return cleanText(s);
}

/**
 * ✅ “坏摘要”判定（统一 gate）
 * - 过短
 * - 截断（.../…）
 * - 付费墙/站内提示/导航噪声
 * - 仓储/版权提示等
 */
function isBadAbstract(raw) {
  const t = normalizeWhitespace(raw);
  if (!t) return true;

  // 1) 过短（阈值建议 120/150）
  if (t.length < 120) return true;

  // 2) 省略号/截断：末尾 ... 或 …
  if (/(\.\.\.|…)\s*$/.test(t)) return true;
  if (t.includes("...") || t.includes("…")) {
    const idx = Math.max(t.lastIndexOf("..."), t.lastIndexOf("…"));
    if (idx >= 0 && t.length - idx < 40) return true;
  }

  // 3) 典型付费墙/导航/站内提示
  const badPats = [
    "Get access",
    "Access options",
    "Log in",
    "Sign in",
    "Purchase",
    "Subscribe",
    "Search for other works",
    "Google Scholar",
    "Published:",
    "Article history",
    "View PDF",
    "Download",
    "Cited by",
    "References",
    "Permissions",
    "No abstract available",
    "Abstract not available",
    "This is a preview",
    "Summary not available",
    "Publisher's Summary",
    "All rights reserved",
    "Please refer to the full text",
  ];
  const low = t.toLowerCase();
  if (badPats.some((p) => low.includes(p.toLowerCase()))) return true;

  // 4) 模板噪声
  if (t.startsWith("Journal Article")) return true;

  // 5) 仓储提示
  if (low.includes("contains fulltext")) return true;

  return false;
}

function mdEscape(s) {
  return String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
}

/* ===============================
   KPI stats (overall + by domain)
================================= */

function domainOf(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// overall counters
const KPI = {
  totalWorks: 0,
  rowsKept: 0,

  openalexGood: 0,
  openalexBad: 0,

  fallbackTried: 0,

  landingOk: 0,
  landingFail: 0,
  landingBad: 0,

  firecrawlOk: 0,
  firecrawlFail: 0,
  firecrawlBad: 0,

  crossrefOk: 0,
  crossrefFail: 0,
  crossrefBad: 0,

  stillEmpty: 0,
};

// by-domain counters
const KPI_DOMAIN = new Map(); // domain -> counters

function bumpDomain(domain, key, inc = 1) {
  if (!domain) domain = "(unknown)";
  const o =
    KPI_DOMAIN.get(domain) || {
      tried: 0,
      landingOk: 0,
      landingFail: 0,
      landingBad: 0,
      firecrawlOk: 0,
      firecrawlFail: 0,
      firecrawlBad: 0,
      crossrefOk: 0,
      crossrefFail: 0,
      crossrefBad: 0,
      stillEmpty: 0,
    };
  o[key] = (o[key] || 0) + inc;
  KPI_DOMAIN.set(domain, o);
}

/* ===============================
   Crossref fallback
================================= */

function extractBareDoi(doiOrUrl) {
  if (!doiOrUrl) return "";
  const m = String(doiOrUrl).match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
  return m ? m[0] : "";
}

async function fetchAbstractFromCrossref(doiOrUrl) {
  const doi = extractBareDoi(doiOrUrl);
  if (!doi) return "";

  const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "THU_SOC_AGENT/1.0",
    },
  });

  if (!res.ok) return "";

  const data = await res.json().catch(() => null);
  const abs = data?.message?.abstract || "";
  return cleanText(abs);
}

/* ===============================
   CLI utils
================================= */

function getArg(flag, def = "") {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? (process.argv[i + 1] ?? def) : def;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function yyyymmddChina() {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year").value;
  const m = parts.find((p) => p.type === "month").value;
  const d = parts.find((p) => p.type === "day").value;
  return `${y}${m}${d}`;
}

/* ===============================
   OpenAlex helpers
================================= */

function abstractFromInvertedIndex(inv) {
  if (!inv || typeof inv !== "object") return "";
  const pairs = [];
  for (const [token, positions] of Object.entries(inv)) {
    for (const pos of positions) pairs.push([pos, token]);
  }
  pairs.sort((a, b) => a[0] - b[0]);
  return pairs.map((p) => p[1]).join(" ");
}

function normalizeDoi(doiRaw) {
  const d = cleanText(doiRaw);
  if (!d) return "";
  let x = d.replace(/^doi:\s*/i, "").trim();
  x = x.replace(/^https?:\/\/doi\.org\//i, "").trim();
  const m = x.match(/(10\.\d{4,9}\/\S+)/);
  return m ? m[1].replace(/[)\]>.,"']+$/g, "") : "";
}

function normalizeTitle(title) {
  const t = cleanText(title).toLowerCase();
  return t
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function makeDedupeKey({ journalSourceId, year, title }) {
  return `ty:${journalSourceId}|${year}|${normalizeTitle(title)}`;
}

function scoreRow(r) {
  let s = 0;
  const abs = (r.abstract || "").trim();
  if (abs && !isBadAbstract(abs)) s += 1000;
  if (r.doi) s += 50;
  if (r.url) s += 5;
  return s;
}

async function fetchJsonWithRetry(url, { timeoutMs = 30000, retries = 4 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
          Accept: "application/json",
        },
      });
      clearTimeout(t);

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.statusText} :: ${text.slice(0, 200)}`);
      }
      return await res.json();
    } catch (e) {
      clearTimeout(t);
      const last = attempt === retries;
      if (last) throw e;

      const wait = 800 * Math.pow(2, attempt);
      console.log(
        `[openalex retry] attempt ${attempt + 1}/${retries + 1} failed: ${e?.message || e}. wait ${wait}ms`
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

function getDoiPrefix(w) {
  const dn = normalizeDoi(w?.doi || "");
  if (!dn) return "";
  const m = dn.match(/^(10\.\d{4,9})\//);
  return m ? m[1] : "";
}

function collectCandidateLandingUrls(w) {
  const urls = new Set();
  const push = (u) => {
    if (!u || typeof u !== "string") return;
    const x = u.trim().replace(/[)\]>.,"']+$/g, "");
    if (x) urls.add(x);
  };

  push(w?.primary_location?.landing_page_url);
  push(w?.primary_location?.pdf_url);

  for (const loc of w?.locations || []) {
    push(loc?.landing_page_url);
    push(loc?.pdf_url);
  }
  return [...urls];
}

function normalizeLandingUrl(w) {
  const doiPrefix = getDoiPrefix(w);

  // 1) publisher landing
  let u = w?.primary_location?.landing_page_url || "";

  // 10.1016: prefer sciencedirect if provided
  if (doiPrefix === "10.1016") {
    const cands = collectCandidateLandingUrls(w);
    const sd = cands.find((x) => /sciencedirect\.com/i.test(x));
    if (sd) u = sd;
  }

  // 2) fallback to DOI URL
  if (!u) {
    const dn = normalizeDoi(w?.doi || "");
    if (dn) u = `https://doi.org/${dn}`;
  }

  if (!u) return null;

  // 3) cleanup tail garbage
  u = String(u).trim().replace(/[)\]>.,"']+$/g, "");

  // 4) T&F: doi.org/10.1080/... => tandfonline abs page
  if (/^https?:\/\/doi\.org\/10\.1080\//i.test(u)) {
    const doi = u.replace(/^https?:\/\/doi\.org\//i, "");
    u = `https://www.tandfonline.com/doi/abs/${doi}`;
  }

  return u;
}

/* ===============================
   Landing page scrape (no key)
================================= */

async function fetchAbstractFromLandingPage(url) {
  if (!url) return null;

  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) return null;

  const html = await res.text();

  if (/cf-turnstile|cloudflare|captcha|recaptcha|verify you are human/i.test(html)) {
    console.log("[bot wall detected]", url);
    return null;
  }

  const $ = cheerio.load(html);

  const metaCandidates = [
    'meta[name="citation_abstract"]',
    'meta[name="dc.Description"]',
    'meta[name="description"]',
    'meta[property="og:description"]',
  ];

  for (const sel of metaCandidates) {
    const v = $(sel).attr("content");
    const t = cleanText(v);
    if (t && t.length > 120 && !isBadAbstract(t)) return t;
  }

  const domCandidates = [
    "div.abstractSection",
    "div.abstractInFull",
    "div.abstract",
    "div#abstract",
    "div.hlFld-Abstract",
    "div.NLM_abstract",
    "div#Abs1",
    "div#abstract-content",
    "section.abstract",
    'section[aria-labelledby*="abstract"]',
    'div[role="region"][aria-label*="Abstract"]',
    'div[aria-label*="Abstract"]',
    '[data-testid="abstract"]',
  ];

  for (const sel of domCandidates) {
    const t = cleanText($(sel).first().text());
    if (t && t.length > 200 && !isBadAbstract(t)) return t;
  }

  return null;
}

/* ===============================
   Firecrawl scrape (key)
================================= */

async function fetchAbstractWithFirecrawl(url) {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey || !url) return null;

  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["rawHtml", "markdown", "json"],
      jsonOptions: {
        schema: {
          type: "object",
          properties: { abstract: { type: "string" } },
        },
      },
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    console.log("[firecrawl http error]", res.status, text.slice(0, 300));
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    console.log("[firecrawl json parse fail]");
    return null;
  }

  const data = payload?.data ?? {};
  const meta = data?.metadata ?? {};
  const md = data?.markdown ?? "";
  const rawHtml = data?.rawHtml || "";

  function looksLikeAbstract(s) {
    const x = cleanText(s);
    if (!x) return false;
    if (x.length < 200) return false;
    if (/(skip to main content|pdf download|request permissions|figure viewer|references|cited by)/i.test(x))
      return false;
    const linkish = (x.match(/https?:\/\//g) || []).length;
    if (linkish >= 3) return false;
    if (isBadAbstract(x)) return false;
    return true;
  }

  if (DEBUG_FC) {
    console.log("[firecrawl data keys]", Object.keys(data));
    console.log("[firecrawl meta keys]", Object.keys(meta).slice(0, 30));
    console.log("[firecrawl markdown length]", md.length);
  }

  if (rawHtml) {
    const $ = cheerio.load(rawHtml);

    const metaAbs =
      $('meta[name="citation_abstract"]').attr("content") ||
      $('meta[name="dc.Description"]').attr("content");

    const tMeta = cleanText(metaAbs);
    if (looksLikeAbstract(tMeta)) return tMeta;

    const domCandidates = [
      "div.abstractSection",
      "div.abstractInFull",
      "div.abstract",
      "div#abstract",
      "section.abstract",
      'section[aria-labelledby*="abstract"]',
      '[data-testid="abstract"]',
    ];

    for (const sel of domCandidates) {
      const t = cleanText($(sel).first().text());
      if (looksLikeAbstract(t)) return t;
    }
  }

  const absJson =
    cleanText(data?.json?.abstract) ||
    cleanText(data?.json?.data?.abstract) ||
    cleanText(Array.isArray(data?.json) ? data?.json?.[0]?.abstract : "");
  if (looksLikeAbstract(absJson)) return absJson;

  const metaKeys = ["dc.Description", "og:description", "description", "twitter:description"];
  for (const k of metaKeys) {
    const t = cleanText(meta?.[k]);
    if (looksLikeAbstract(t)) return t;
  }

  const t = cleanText(md);
  if (looksLikeAbstract(t)) return t;

  return null;
}

/* ===============================
   Word-level match: stem, plural/singular, light typo
================================= */

/** 将检索词拆成单词（空白分隔，保留顺序） */
function tokenizeToWords(term) {
  return normalizeWhitespace(String(term || ""))
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

/** 简单复数 → 单数（英文常见规则） */
function toSingular(word) {
  const w = String(word || "").toLowerCase().trim();
  if (w.length < 3) return w;
  if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
  if (w.endsWith("es") && !w.endsWith("sses") && w.length > 3) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss") && w.length > 2) return w.slice(0, -1);
  return w;
}

/** 简单单数 → 复数 */
function toPlural(word) {
  const w = String(word || "").toLowerCase().trim();
  if (w.length < 2) return w;
  const last = w.slice(-1);
  const last2 = w.slice(-2);
  if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + "ies";
  if (last === "s" || last === "x" || last === "z" || last2 === "ch" || last2 === "sh") return w + "es";
  if (last === "e") return w + "s";
  return w + "s";
}

/** 词干 + 单复数变形，去重后返回用于匹配的变体集合 */
function getWordVariants(word) {
  const w = String(word || "").toLowerCase().trim();
  if (!w) return new Set();
  const out = new Set();
  out.add(w);
  try {
    out.add(stemmer(w));
    out.add(toSingular(w));
    out.add(toPlural(w));
    out.add(stemmer(toSingular(w)));
    out.add(stemmer(toPlural(w)));
  } catch (_) {
    // stemmer may throw on odd input
  }
  return out;
}

/** Levenshtein 编辑距离（用于轻量纠错） */
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[n];
}

/** 文本中是否包含该词的任一变体（子串），或与变体编辑距离≤1的整词（仅对较长词做纠错） */
function textMatchesWord(text, word) {
  const t = normalizeWhitespace(String(text || "")).toLowerCase();
  if (!t) return false;
  const variants = getWordVariants(word);
  for (const v of variants) {
    if (!v) continue;
    if (t.includes(v)) return true;
  }
  const wordsInText = (t.match(/\b[a-z0-9']+\b/g) || []).filter((x) => x.length >= 4);
  const minLen = 4;
  for (const tw of wordsInText) {
    for (const v of variants) {
      if (!v || v.length < minLen) continue;
      const maxEdit = tw.length >= 7 && v.length >= 6 ? 2 : 1;
      if (Math.abs(tw.length - v.length) > maxEdit) continue;
      if (levenshtein(tw, v) <= maxEdit) return true;
    }
  }
  return false;
}

/** 从 work 取摘要全文（与后续使用的逻辑一致） */
function workAbstractText(w) {
  return (
    abstractFromInvertedIndex(w?.abstract_inverted_index) ||
    (typeof w?.abstract === "string" ? w.abstract.trim() : "") ||
    ""
  );
}

/** work 的 keywords 拼接成一段文本（用于按词匹配） */
function workKeywordsText(w) {
  const list = w?.keywords;
  if (!Array.isArray(list) || list.length === 0) return "";
  return list
    .map((item) =>
      item?.keyword?.display_name ?? item?.display_name ?? (typeof item === "string" ? item : "")
    )
    .filter(Boolean)
    .join(" ");
}

/** 文本是否包含检索词（大小写不敏感、归一化空格）— 保留用于兼容/短语快速路径 */
function textContains(text, query) {
  const t = normalizeWhitespace(String(text || "")).toLowerCase();
  const q = normalizeWhitespace(String(query || "")).toLowerCase();
  if (!q) return true;
  return t.includes(q);
}

/** work 的 keywords 中是否至少有一个包含对 query 的匹配（含词干/单复数/轻量纠错） */
function workKeywordsMatchWord(w, word) {
  const list = w?.keywords;
  if (!Array.isArray(list) || list.length === 0) return false;
  const kwText = workKeywordsText(w);
  return textMatchesWord(kwText, word);
}

/**
 * 严格检索：摘要与关键词都包含检索词才通过。
 * 宽松检索：标题、摘要、关键词任一包含即可。
 * 匹配规则：按词拆分；每词可用同根（stem）、单复数变形、以及编辑距离≤1 的整词匹配。
 * 多词时：logics 为数组且长度 = terms.length - 1 则按链式从左到右求值（term0 logic[0] term1 logic[1] term2...）；
 * 否则若为单 logic 则全词同一逻辑（且/或）。
 */
function workMatchesTopic(w, queryOrTerms, strictMode, logicOrLogics = "or") {
  const terms = Array.isArray(queryOrTerms)
    ? queryOrTerms.filter((t) => String(t || "").trim())
    : [String(queryOrTerms || "").trim()].filter(Boolean);
  if (terms.length === 0) return true;

  const title = w?.title ?? "";
  const abs = workAbstractText(w);
  const kwText = workKeywordsText(w);

  /** 单个检索词 q（可能为短语）是否在 title/abstract/keywords 上满足“按词匹配” */
  const singleMatch = (q) => {
    const words = tokenizeToWords(q);
    if (words.length === 0) return true;
    const everyWordMatches = (fn) => words.every((word) => fn(word));
    if (strictMode) {
      return everyWordMatches((word) => textMatchesWord(abs, word)) && everyWordMatches((word) => workKeywordsMatchWord(w, word));
    }
    return words.every(
      (word) => textMatchesWord(title, word) || textMatchesWord(abs, word) || workKeywordsMatchWord(w, word)
    );
  };

  if (terms.length === 1) return singleMatch(terms[0]);

  const logics = Array.isArray(logicOrLogics) ? logicOrLogics : [logicOrLogics];
  if (logics.length === terms.length - 1) {
    let acc = singleMatch(terms[0]);
    for (let i = 1; i < terms.length; i++) {
      const L = (logics[i - 1] || "or").toLowerCase();
      acc = L === "and" ? acc && singleMatch(terms[i]) : acc || singleMatch(terms[i]);
    }
    return acc;
  }
  const single = (typeof logicOrLogics === "string" ? logicOrLogics : "or").toLowerCase();
  if (single === "and") return terms.every((q) => singleMatch(q));
  return terms.some((q) => singleMatch(q));
}

/* ===============================
   Fetch works from OpenAlex
================================= */

/**
 * 严格检索：API 仅按摘要匹配（abstract.search），结果在后处理中再要求关键词也包含。
 * 宽松检索：API 用 search 拉取标题/摘要/全文匹配，结果在后处理中保留标题 or 摘要 or 关键词任一包含。
 * yearFrom/yearTo 可选，格式为数字年份，会追加 from_publication_date / to_publication_date 过滤。
 */
async function fetchAllWorks({ topic, sourceIds, perPage = 200, maxPerJournal = 200, strictMode = false, yearFrom, yearTo }) {
  const all = [];
  const apiKey = process.env.OPENALEX_API_KEY;
  const email = process.env.OPENALEX_EMAIL;

  console.log("search query =", topic, "| strict =", strictMode, "| source count =", sourceIds.length, "| year =", yearFrom ?? "-", "~", yearTo ?? "-");
  console.log("sourceIds sample =", sourceIds.slice(0, 5));
  console.log("maxPerJournal =", maxPerJournal);
  if (apiKey) console.log("OpenAlex: using API key (your daily budget).");
  else console.log("OpenAlex: no API key (anonymous rate limit).");

  const yearFilters = [];
  if (yearFrom != null && Number.isFinite(Number(yearFrom))) yearFilters.push(`from_publication_date:${Number(yearFrom)}-01-01`);
  if (yearTo != null && Number.isFinite(Number(yearTo))) yearFilters.push(`to_publication_date:${Number(yearTo)}-12-31`);
  const yearFilterStr = yearFilters.length ? "," + yearFilters.join(",") : "";

  for (const sourceId of sourceIds) {
    let cursor = "*";
    let collected = 0;

    while (collected < maxPerJournal) {
      const sid = String(sourceId)
        .replace(/^https?:\/\/openalex\.org\//, "")
        .replace(/^S+/, "S");

      const sourceFilter = `primary_location.source.id:${sid}`;
      const url = new URL("https://api.openalex.org/works");

      if (strictMode) {
        url.searchParams.set("filter", `${sourceFilter},abstract.search:${topic}${yearFilterStr}`);
      } else {
        url.searchParams.set("search", topic);
        url.searchParams.set("filter", `${sourceFilter}${yearFilterStr}`);
      }
      url.searchParams.set("per-page", String(perPage));
      url.searchParams.set("cursor", cursor);
      url.searchParams.set("sort", "publication_date:desc");
      if (apiKey) url.searchParams.set("api_key", apiKey);
      if (email) url.searchParams.set("mailto", email);

      if (DEBUG) {
        console.log("DEBUG sid:", sid);
        console.log("DEBUG topic:", topic);
        console.log("DEBUG URL:", url.toString());
      }

      console.log("OpenAlex request:", url.toString());
      const data = await fetchJsonWithRetry(url.toString());
      const results = Array.isArray(data?.results) ? data.results : [];

      for (const w of results) {
        all.push(w);
        collected++;
        if (collected >= maxPerJournal) break;
      }

      cursor = data?.meta?.next_cursor;
      if (!cursor || results.length === 0) break;
    }
  }

  return all;
}

/* ===============================
   Main
================================= */

async function main() {
  const topicSlug = process.argv[2];
  if (!topicSlug) {
    console.error(
      "Usage: node .claude/skills/journal-search/scripts/run.mjs <topic>\nExample: node .claude/skills/journal-search/scripts/run.mjs artificial_intelligence"
    );
    process.exit(1);
  }

  const query = topicSlug.replace(/_/g, " ").trim();
  const strictMode = hasFlag("--strict");
  const WITH_ABSTRACT = process.env.ABSTRACT_FALLBACK === "1" || hasFlag("--with-abstract");
  const yearFromRaw = getArg("--year-from", "");
  const yearToRaw = getArg("--year-to", "");
  const yearFrom = yearFromRaw && !Number.isNaN(Number(yearFromRaw)) ? Number(yearFromRaw) : undefined;
  const yearTo = yearToRaw && !Number.isNaN(Number(yearToRaw)) ? Number(yearToRaw) : undefined;
  const instruction = (getArg("--instruction", "") || "").trim() || undefined;

  const termsRaw = (getArg("--terms", "") || "").trim();
  const searchTerms = termsRaw
    ? termsRaw.split(/[,，\n]+/).map((s) => s.trim().replace(/_/g, " ")).filter(Boolean)
    : [];
  const logicRaw = (getArg("--logic", "") || "").trim();
  const searchLogics = logicRaw
    ? logicRaw.split(",").map((s) => ((s || "").toLowerCase() === "and" ? "and" : "or"))
    : [];
  const terms = searchTerms.length > 0 ? searchTerms : [query];
  const primaryQuery = terms[0];
  const useChainedLogics = searchLogics.length === terms.length - 1;
  const effectiveLogic = useChainedLogics ? null : (searchLogics[0] || "or");

  const projectRoot = process.cwd();
  const journalsPath = getArg(
    "--journals",
    path.join(projectRoot, ".claude", "skills", "journal-catalog", "references", "system", "journals.yml")
  );

  if (!fs.existsSync(journalsPath)) {
    console.error(`Missing: ${journalsPath}`);
    process.exit(1);
  }

  const parsed = YAML.parse(fs.readFileSync(journalsPath, "utf8"));
  const journals = parsed?.journals;
  if (!Array.isArray(journals)) {
    console.error(`Invalid YAML format. Expected "journals:" to be a list.`);
    process.exit(1);
  }

  const sourceIds = [];
  const sourceId2short = new Map();

  for (const j of journals) {
    if (!j.openalex_source_id) continue;
    const sid = String(j.openalex_source_id)
      .replace(/^https?:\/\/openalex\.org\//, "")
      .replace(/^S+/, "S");
    sourceIds.push(sid);
    sourceId2short.set(sid, j.short || j.name);
  }

  if (sourceIds.length === 0) {
    console.error("No openalex_source_id found in journals.yml. (You need to resolve sources first.)");
    process.exit(1);
  }

  const needMerge =
    terms.length > 1 &&
    (useChainedLogics ? searchLogics.some((l) => l === "or") : effectiveLogic === "or");
  let works;
  if (needMerge) {
    const byId = new Map();
    for (const term of terms) {
      const batch = await fetchAllWorks({ topic: term, sourceIds, maxPerJournal: 100, strictMode, yearFrom, yearTo });
      for (const w of batch) {
        if (w?.id && !byId.has(w.id)) byId.set(w.id, w);
      }
    }
    works = Array.from(byId.values());
    console.log("[works fetched, merge]", works.length);
  } else {
    works = await fetchAllWorks({ topic: primaryQuery, sourceIds, maxPerJournal: 100, strictMode, yearFrom, yearTo });
    console.log("[works fetched]", works.length);
  }

  let skipped = 0;
  const skipReasons = new Map();
  const markSkip = (reason, w) => {
    skipped++;
    skipReasons.set(reason, (skipReasons.get(reason) || 0) + 1);
    console.log("[skip]", reason, w?.id, w?.doi, (w?.title || "").slice(0, 80));
  };

  const bestByKey = new Map();
  const seenWorkId = new Set();

  for (const w of works) {
    KPI.totalWorks++;

    if (!w?.id || seenWorkId.has(w.id)) continue;
    seenWorkId.add(w.id);

    const type = (w?.type || "").toLowerCase();
    if (type && !["journal-article", "review", "article", "preprint"].includes(type)) continue;

    const title = w.title || "";
    const year = w.publication_year || "";
    if (!title || !title.trim()) {
      markSkip("missing title", w);
      continue;
    }
    if (!year) {
      markSkip("missing year", w);
      continue;
    }

    const logicArg = useChainedLogics ? searchLogics : effectiveLogic;
    if (!workMatchesTopic(w, terms, strictMode, logicArg)) {
      markSkip(
        terms.length > 1
          ? `strict=${strictMode} terms not matched`
          : strictMode
            ? "strict: abstract and keywords must both contain query"
            : "relaxed: title, abstract or keywords must contain query",
        w
      );
      continue;
    }

    const journalName = w?.primary_location?.source?.display_name || "";
    const journalSourceIdRaw = w?.primary_location?.source?.id || "";
    const journalSourceId = String(journalSourceIdRaw)
      .replace(/^https?:\/\/openalex\.org\//, "")
      .replace(/^S+/, "S");

    const short = sourceId2short.get(journalSourceId) || "";
    const doiNorm = normalizeDoi(w?.doi || "");
    const doiUrl = doiNorm ? `https://doi.org/${doiNorm}` : "";
    const url = w.id || "";

    const key = makeDedupeKey({ journalSourceId, year, title });

    // 0) OpenAlex abstract
    let abs =
      abstractFromInvertedIndex(w.abstract_inverted_index) ||
      (typeof w.abstract === "string" ? w.abstract.trim() : "") ||
      "";
    abs = cleanText(abs);

    // gate: bad => empty => triggers fallback
    if (isBadAbstract(abs)) {
      KPI.openalexBad++;
      if (DEBUG) {
        console.log("[bad abstract -> force fallback]", {
          doi: w.doi,
          abstract_len: abs.length,
          abstract_tail: abs.slice(-120),
        });
      }
      abs = "";
    } else if (abs) {
      KPI.openalexGood++;
    }

    const landing = normalizeLandingUrl(w);
    const landingDomain = domainOf(landing || "");

    // fallback chain only if empty
    if (WITH_ABSTRACT && (!abs || abs.trim() === "")) {
      // 🔴 短路：无 landing 且无 DOI => 没法补
      if (!landing && !doiUrl) {
        KPI.stillEmpty++;
        bumpDomain("(no-landing-no-doi)", "stillEmpty", 1);
        console.log("[abstract still empty - no landing & no doi]", { openalex_id: w?.id });
      } else {
        KPI.fallbackTried++;
        bumpDomain(landingDomain, "tried", 1);

        // 1) landing page
        if (landing) {
          try {
            const scraped = await fetchAbstractFromLandingPage(landing);
            if (scraped) {
              const t = cleanText(scraped);
              if (!isBadAbstract(t)) {
                console.log(`[abstract fallback OK] ${landing}`);
                KPI.landingOk++;
                bumpDomain(landingDomain, "landingOk", 1);
                abs = t;
              } else {
                console.log(`[abstract fallback BAD] ${landing}`);
                KPI.landingBad++;
                bumpDomain(landingDomain, "landingBad", 1);
                abs = "";
              }
            } else {
              console.log(`[abstract fallback FAIL] ${landing}`);
              KPI.landingFail++;
              bumpDomain(landingDomain, "landingFail", 1);
            }
          } catch (e) {
            console.log(`[abstract fallback ERROR] ${landing} :: ${e?.message || e}`);
          }
        }

        // 2) Firecrawl
        if ((!abs || abs.trim() === "") && process.env.FIRECRAWL_API_KEY && landing) {
          const fcUrl = landing;
          try {
            let fc = await fetchAbstractWithFirecrawl(fcUrl);

            // T&F: abs -> full
            if (!fc && /tandfonline\.com\/doi\/abs\//i.test(fcUrl)) {
              fc = await fetchAbstractWithFirecrawl(fcUrl.replace("/doi/abs/", "/doi/full/"));
            }

            if (fc) {
              const t = cleanText(fc);
              if (!isBadAbstract(t)) {
                console.log(`[firecrawl OK] ${doiUrl || fcUrl}`);
                KPI.firecrawlOk++;
                bumpDomain(landingDomain, "firecrawlOk", 1);
                abs = t;
              } else {
                console.log(`[firecrawl BAD] ${doiUrl || fcUrl}`);
                KPI.firecrawlBad++;
                bumpDomain(landingDomain, "firecrawlBad", 1);
                abs = "";
              }
            } else {
              console.log(`[firecrawl FAIL] ${doiUrl || fcUrl}`);
              KPI.firecrawlFail++;
              bumpDomain(landingDomain, "firecrawlFail", 1);
            }
          } catch (e) {
            console.log(`[firecrawl ERROR] ${doiUrl || fcUrl} :: ${e?.message || e}`);
          }
        }

        // 3) Crossref
        if (!abs || abs.trim() === "") {
          try {
            const cr = cleanText(await fetchAbstractFromCrossref(doiUrl || landing));
            if (cr && !isBadAbstract(cr)) {
              console.log(`[crossref OK] ${doiUrl || landing || "(no doi)"}`);
              KPI.crossrefOk++;
              bumpDomain(landingDomain, "crossrefOk", 1);
              abs = cr;
            } else if (cr) {
              console.log(`[crossref BAD] ${doiUrl || landing || "(no doi)"}`);
              KPI.crossrefBad++;
              bumpDomain(landingDomain, "crossrefBad", 1);
              abs = "";
            } else {
              console.log(`[crossref FAIL] ${doiUrl || landing || "(no doi)"}`);
              KPI.crossrefFail++;
              bumpDomain(landingDomain, "crossrefFail", 1);
            }
          } catch (e) {
            console.log(`[crossref ERROR] ${doiUrl || landing || "(no doi)"} :: ${e?.message || e}`);
          }
        }

        // after all fallbacks
        if (!abs || abs.trim() === "") {
          KPI.stillEmpty++;
          bumpDomain(landingDomain, "stillEmpty", 1);
          console.log("[abstract still empty]", {
            doi: doiUrl,
            landing_page_url: w?.primary_location?.landing_page_url,
            landing_normalized: landing,
          });
        }
      }
    }

    const authorNames = (w.authorships || [])
      .map((a) => a.author?.display_name)
      .filter(Boolean);
    const authorsStr =
      authorNames.length <= 2
        ? authorNames.join(" & ")
        : authorNames.slice(0, 2).join(" & ") + " et al.";
    const openalexId = (w.id || "").replace(/^https?:\/\/openalex\.org\//, "").trim() || "";

    const row = {
      short,
      journal: journalName,
      year,
      title,
      authors: authorsStr || "",
      openalex_id: openalexId,
      doi: doiUrl,
      url,
      abstract: abs,
    };

    const prev = bestByKey.get(key);
    if (!prev || scoreRow(row) > scoreRow(prev)) {
      bestByKey.set(key, row);
    }
  }

  let rows = Array.from(bestByKey.values());

  rows.sort((a, b) => {
    const ya = Number(a.year) || 0;
    const yb = Number(b.year) || 0;
    if (yb !== ya) return yb - ya;
    return String(a.journal).localeCompare(String(b.journal));
  });

  console.log("[rows]", rows.length, "[skipped]", skipped);
  KPI.rowsKept = rows.length;

  console.log("[skip reasons]", Object.fromEntries(skipReasons));

  console.log("\n=== KPI (overall) ===");
  console.table(KPI);

  console.log("\n=== KPI (by domain, top 25 by tried) ===");
  const domainRows = Array.from(KPI_DOMAIN.entries())
    .map(([domain, o]) => ({ domain, ...o }))
    .sort((a, b) => (b.tried || 0) - (a.tried || 0))
    .slice(0, 25);
  console.table(domainRows);

  const date = getArg("--date", yyyymmddChina());
  const topicRoot = path.join(projectRoot, "outputs", topicSlug);
  const STAGE_DIRS = ["01_raw", "02_clean", "03_summaries", "04_meta", "05_report", "06_review"];
  for (const stage of STAGE_DIRS) {
    fs.mkdirSync(path.join(topicRoot, stage), { recursive: true });
  }
  console.log(`[scaffold] outputs/${topicSlug}/ { ${STAGE_DIRS.join(", ")} }`);
  const outDir = path.join(topicRoot, "01_raw");

  function nextVersionedPath(dir, base, yyyymmdd) {
    const re = new RegExp(`^${base}_${yyyymmdd}_v(\\d+)\\.md$`);
    let maxV = 0;
    for (const f of fs.readdirSync(dir)) {
      const m = f.match(re);
      if (m) maxV = Math.max(maxV, Number(m[1]));
    }
    return path.join(dir, `${base}_${yyyymmdd}_v${maxV + 1}.md`);
  }

  const outPath = nextVersionedPath(outDir, "papers", date);

  // 用户可读的检索条件说明（中文、规范、通俗）
  const searchTypeLabel = strictMode ? "严格检索" : "宽松检索";
  let yearRangeLabel = "";
  if (yearFrom != null && yearTo != null) yearRangeLabel = `${yearFrom}–${yearTo} 年`;
  else if (yearFrom != null) yearRangeLabel = `自 ${yearFrom} 年起`;
  else if (yearTo != null) yearRangeLabel = `至 ${yearTo} 年止`;

  const queryDisplay =
    terms.length > 1
      ? useChainedLogics
        ? terms.map((t, i) => (i === 0 ? t : (searchLogics[i - 1] === "and" ? " 且 " : " 或 ") + t)).join("")
        : terms.join(effectiveLogic === "and" ? " 且 " : " 或 ")
      : query;
  let md = `# 文献检索结果 · 主题：${mdEscape(queryDisplay)}\n\n`;
  md += `---\n\n`;
  md += `### 📋 检索条件\n\n`;
  md += `- 检索主题：${mdEscape(queryDisplay)}\n`;
  const extraTermsDisplay =
    terms.length > 1 ? terms.slice(1).map((t) => mdEscape(t)).join("；") : "无";
  md += `- 额外检索词：${extraTermsDisplay}\n`;
  if (terms.length > 1) {
    if (useChainedLogics) {
      md += `- 词间逻辑：${searchLogics.map((l) => (l === "and" ? "且" : "或")).join("、")}\n`;
    } else {
      md += `- 多词逻辑：${effectiveLogic === "and" ? "且（全部包含）" : "或（任一包含）"}\n`;
    }
  }
  const journalNames = journals
    .map((j) => (j.openalex_source_id ? (j.short || j.name || "").trim() : ""))
    .filter(Boolean);
  const journalListDisplay =
    journalNames.length === 0
      ? "无"
      : journalNames.length <= 30
        ? journalNames.map((n) => mdEscape(n)).join("、")
        : journalNames.slice(0, 25).map((n) => mdEscape(n)).join("、") + " 等共 " + journalNames.length + " 本";
  md += `- 检索的期刊：${journalListDisplay}\n`;
  const quartiles = [...new Set(journals.map((j) => j.quartile).filter(Boolean))].sort();
  const partitionDisplay = quartiles.length > 0 ? quartiles.join("、") : "未标注";
  md += `- 检索的分区：${partitionDisplay}\n`;
  if (quartiles.length > 1) {
    md += `  - 说明：部分期刊归属多个 WOS 学科，各学科分区不同，上列为本次参与检索期刊在数据源中出现的分区并集；筛选条件若为某学科 Q1，则仅包含该学科下 Q1 的刊。\n`;
  }
  md += `- 检索类型：${searchTypeLabel}\n`;
  if (yearRangeLabel) md += `- 年份范围：${yearRangeLabel}\n`;
  if (instruction) md += `- 提示词：${mdEscape(instruction)}\n`;
  const abstractFilledCount = KPI.landingOk + KPI.firecrawlOk + KPI.crossrefOk;
  if (WITH_ABSTRACT) {
    md += `- 摘要补全：是\n`;
    if (abstractFilledCount > 0) md += `- 摘要补全条数：${abstractFilledCount}\n`;
  } else {
    md += `- 摘要补全：否\n`;
  }
  const missingAbstract = rows.filter((r) => {
    const t = String(r.abstract ?? "").trim();
    if (!t) return true;
    if (/^(no usable abstract|n\/a|none|unknown|no abstract)\.?$/i.test(t)) return true;
    if (/^see (the )?(abstract|link|url|paper)/i.test(t)) return true;
    if (t.length < 25) return true;
    return false;
  }).length;
  md += `- 本表共 ${rows.length} 篇，其中摘要空缺 ${missingAbstract} 篇。\n\n`;

  md += `| 期刊 | 年份 | 标题 | 作者 | DOI | OpenAlex | 摘要 |\n|---|---:|---|---|---|---|---|\n`;

  for (const r of rows) {
    const doiLink = r.doi ? `[${mdEscape(r.doi)}](${r.doi})` : "";
    const openalexLink = r.url ? `[link](${r.url})` : "";
    const j = r.short ? `${r.short} / ${r.journal}` : r.journal;

    md += `| ${mdEscape(j)} | ${mdEscape(r.year)} | ${mdEscape(r.title)} | ${mdEscape(r.authors || "")} | ${doiLink} | ${openalexLink} | ${mdEscape(
      r.abstract
    )} |\n`;
  }

  fs.writeFileSync(outPath, md, "utf8");
  const latestPath = path.join(outDir, "papers_latest.md");
  fs.copyFileSync(outPath, latestPath);
  console.log(`Wrote: ${outPath}\nLatest: ${latestPath}\nRows: ${rows.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});