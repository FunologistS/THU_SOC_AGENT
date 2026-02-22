#!/usr/bin/env node
/**
 * synthesis.mjs
 * Input: outputs/<topic>/03_summaries/summaries_latest.md (default)
 * Outputs:
 *  - outputs/<topic>/04_meta/meta_table_YYYYMMDD_vN.csv + meta_table_latest.csv
 *  - outputs/<topic>/04_meta/meta_clusters_YYYYMMDD_vN.md + meta_clusters_latest.md
 *  - outputs/<topic>/04_meta/briefing_YYYYMMDD_vN.md + briefing_latest.md
 *  - outputs/<topic>/04_meta/qa_report_YYYYMMDD_vN.md + qa_report_latest.md
 *  - outputs/<topic>/04_meta/year_cluster_YYYYMMDD_vN.csv + year_cluster_latest.csv
 *  - outputs/<topic>/04_meta/journal_cluster_YYYYMMDD_vN.csv + journal_cluster_latest.csv
 *  - outputs/<topic>/04_meta/method_cluster_YYYYMMDD_vN.csv + method_cluster_latest.csv
 *  - outputs/<topic>/04_meta/data_cluster_YYYYMMDD_vN.csv + data_cluster_latest.csv
 *  - (optional) outputs/<topic>/04_meta/k_scan_YYYYMMDD_vN.md + k_scan_latest.md
 *
 * Deterministic: Yes (seeded kmeans + sorted vocab + deterministic phrase handling)
 * Versioning: meta_table decides vN; other outputs share the same vN for a single run.
 *
 * Features:
 * - protected_phrases.yml + stopwords.yml + lemmatization.yml (token-level) cleaning
 * - --debug-text <rowIndex|titleContains> prints token pipeline for one paper
 * - ai_score + out_of_scope_candidate in meta_table
 * - qa_report (unknown/missing stats + top missing journals)
 * - extra pivot tables: year×cluster, journal×cluster, method×cluster, data×cluster
 * - optional --k-scan "5..10" to inspect cluster size + top terms across k
 *
 * v8 (your request): Scheme A labeling fix
 * - clustering tokens unchanged
 * - cluster label uses "distinctive" terms by:
 *   (1) label_stoplist: remove global generic terms (ai, technology, etc.)
 *   (2) df filter: remove terms with global DF ratio >= --labelDfMax (default 0.5)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { removeStopwords } from "stopword";
import YAML from "yaml";

/** --------- Resolve skill paths --------- **/

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// scripts/ -> skill root -> references/
const SKILL_ROOT = path.resolve(__dirname, "..");
const REFERENCES_DIR = path.join(SKILL_ROOT, "references");

// Expected files
const PROTECTED_PHRASES_FILE = path.join(REFERENCES_DIR, "sociology_protected_phrases.yml");
const SOC_STOPWORDS_FILE = path.join(REFERENCES_DIR, "sociology_stopwords.yml");
const LEMMATIZATION_FILE = path.join(REFERENCES_DIR, "lemmatization.yml");

/** --------- Load references --------- **/

function loadYamlFile(p) {
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, "utf-8");
  return YAML.parse(raw);
}

function loadStringListFromYaml(p, key) {
  const obj = loadYamlFile(p);
  if (!obj) return [];
  const arr = obj?.[key];
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => String(x || "").trim())
    .filter(Boolean);
}

function loadLemmas(yamlPath) {
  const raw = loadYamlFile(yamlPath) || {};
  const tokens = raw.tokens && typeof raw.tokens === "object" ? raw.tokens : {};
  const phrases = raw.phrases && typeof raw.phrases === "object" ? raw.phrases : {};

  // normalize keys/values to lowercase
  const normTokens = {};
  for (const [k, v] of Object.entries(tokens)) {
    if (!k || !v) continue;
    normTokens[String(k).trim().toLowerCase()] = String(v).trim().toLowerCase();
  }
  const normPhrases = {};
  for (const [k, v] of Object.entries(phrases)) {
    if (!k || !v) continue;
    normPhrases[String(k).trim().toLowerCase()] = String(v).trim().toLowerCase();
  }
  return { tokens: normTokens, phrases: normPhrases };
}

const SOC_PROTECTED_PHRASES = loadStringListFromYaml(
  PROTECTED_PHRASES_FILE,
  "sociology_protected_phrases"
);

const SOC_STOPWORDS_RAW = loadStringListFromYaml(SOC_STOPWORDS_FILE, "sociology_stopwords");

const LEMMAS = fs.existsSync(LEMMATIZATION_FILE)
  ? loadLemmas(LEMMATIZATION_FILE)
  : { tokens: {}, phrases: {} };

// split stopwords into phrase-level (has space) vs token-level
const SOC_STOPWORD_PHRASES = SOC_STOPWORDS_RAW
  .filter((s) => /\s/.test(s))
  .map((s) => s.toLowerCase());

const SOC_STOPWORD_TOKENS = new Set(
  SOC_STOPWORDS_RAW
    .filter((s) => !/\s/.test(s))
    .map((s) => s.toLowerCase())
);

/** --------- Text cleaning / tokenization --------- **/

// 领域噪音/模板噪音（会污染主题词）
const DOMAIN_NOISE = new Set([
  "unknown",
  "stated",
  "abstract",
  "paper",
  "article",
  "study",
  "research",
  "findings",
  "results",
  "method",
  "methods",
  "data",
  "using",
  "use",
  "used",
]);

// 摘要模板占位句（建议直接抹掉）
const TEMPLATE_PATTERNS = [
  /unknown\s*\(not stated in abstract\)/gi,
  /not stated in abstract/gi,
  /\bunknown\b/gi,
];

function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build phrase replacers:
 * - Sort by word count desc then length desc for determinism
 * - Replace "a b c" => "a_b_c"
 */
function buildPhraseReplacers(phrases) {
  const cleaned = (phrases || [])
    .map((p) => String(p || "").trim().toLowerCase())
    .filter(Boolean)
    .map((p) => p.replace(/\s+/g, " "));

  const uniq = Array.from(new Set(cleaned));

  uniq.sort((a, b) => {
    const wa = a.split(" ").length;
    const wb = b.split(" ").length;
    if (wb !== wa) return wb - wa;
    if (b.length !== a.length) return b.length - a.length;
    return a.localeCompare(b);
  });

  return uniq.map((p) => {
    const parts = p.split(" ").map(escapeReg);
    const pattern = `\\b${parts.join("\\s+")}\\b`;
    const re = new RegExp(pattern, "g");
    const replacement = p.replace(/\s+/g, "_");
    return { re, replacement, phrase: p };
  });
}

const PROTECTED_REPLACERS = buildPhraseReplacers(SOC_PROTECTED_PHRASES);
const STOPWORD_PHRASE_REPLACERS = buildPhraseReplacers(SOC_STOPWORD_PHRASES);

/**
 * Normalize text:
 * - lower
 * - remove template placeholders
 * - remove links/doi
 * - keep only a-z0-9 and spaces
 */
function normalizeText(raw) {
  let t = (raw || "").toLowerCase();

  for (const re of TEMPLATE_PATTERNS) t = t.replace(re, " ");

  t = t.replace(/https?:\/\/\S+/g, " ");
  t = t.replace(/\bdoi:\s*\S+/g, " ");

  t = t.replace(/[^a-z0-9\s]/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

function applyProtectedPhrases(t) {
  let s = t;
  for (const { re, replacement } of PROTECTED_REPLACERS) {
    s = s.replace(re, replacement);
  }
  return s;
}

function removeStopwordPhrases(t) {
  let s = t;
  for (const { re } of STOPWORD_PHRASE_REPLACERS) {
    s = s.replace(re, " ");
  }
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/**
 * Lemmatize token after protected phrases:
 * - token-level only (recommended)
 */
function lemmatizeToken(tok) {
  if (!tok) return tok;
  return LEMMAS.tokens?.[tok] ?? tok;
}

function tokenize(raw) {
  let t = normalizeText(raw);
  if (!t) return [];

  // 1) protect phrases => underscores
  t = applyProtectedPhrases(t);

  // 2) remove multi-word stopword phrases
  t = removeStopwordPhrases(t);

  // 3) split
  let tokens = t.split(" ").filter(Boolean);

  // 4) remove very short tokens (but keep certain short whitelist tokens)
  const KEEP_SHORT = new Set(["ai"]);
  tokens = tokens.filter((w) => w.length >= 3 || KEEP_SHORT.has(w));

  // 5) generic english stopwords
  tokens = removeStopwords(tokens);

  // 6) lemmatize (token-level)
  tokens = tokens.map(lemmatizeToken);

  // 7) sociology token stopwords
  tokens = tokens.filter((w) => !SOC_STOPWORD_TOKENS.has(w));

  // 7.5) remove pure numbers (e.g., 2020)
  tokens = tokens.filter((w) => !/^\d+$/.test(w));

  // 8) domain/template noise
  tokens = tokens.filter((w) => !DOMAIN_NOISE.has(w));

  return tokens;
}

/** --------- Debug token flow --------- **/

function debugTokenFlow({ id, rawText }) {
  const norm = normalizeText(rawText);
  const protectedText = applyProtectedPhrases(norm);
  const noPhraseStops = removeStopwordPhrases(protectedText);

  const KEEP_SHORT = new Set(["ai"]);

  let rawTokens = noPhraseStops
    .split(" ")
    .filter(Boolean)
    .filter((w) => w.length >= 3 || KEEP_SHORT.has(w));
  rawTokens = removeStopwords(rawTokens);

  const lemmaTokens = rawTokens.map(lemmatizeToken);

  const finalTokens = lemmaTokens
    .filter((w) => !SOC_STOPWORD_TOKENS.has(w))
    .filter((w) => !/^\d+$/.test(w))
    .filter((w) => !DOMAIN_NOISE.has(w));

  console.log("\n[debug-text] =", id);
  console.log("norm:", norm.slice(0, 240));
  console.log("protected:", protectedText.slice(0, 240));
  console.log("noPhraseStops:", noPhraseStops.slice(0, 240));
  console.log("rawTokens:", rawTokens.slice(0, 40));
  console.log("lemmaTokens:", lemmaTokens.slice(0, 40));
  console.log("finalTokens:", finalTokens.slice(0, 40));
}

/** --------- TF-IDF matrix --------- **/

function buildTfidfMatrix(docsTokens, { minDf = 2 } = {}) {
  const N = docsTokens.length;

  const df = new Map();
  for (const toks of docsTokens) {
    const seen = new Set(toks);
    for (const w of seen) df.set(w, (df.get(w) || 0) + 1);
  }

  const vocab = [];
  for (const [w, c] of df.entries()) {
    if (c >= minDf) vocab.push(w);
  }
  vocab.sort();
  const index = new Map(vocab.map((w, i) => [w, i]));

  const idf = new Array(vocab.length);
  for (let i = 0; i < vocab.length; i++) {
    const w = vocab[i];
    const dfi = df.get(w) || 0;
    idf[i] = Math.log((N + 1) / (dfi + 1)) + 1;
  }

  const X = new Array(N);
  for (let di = 0; di < N; di++) {
    const toks = docsTokens[di];
    const counts = new Map();

    for (const w of toks) {
      const j = index.get(w);
      if (j === undefined) continue;
      counts.set(j, (counts.get(j) || 0) + 1);
    }

    const total = toks.length || 1;
    const vec = new Array(vocab.length).fill(0);

    for (const [j, c] of counts.entries()) {
      const tf = c / total;
      vec[j] = tf * idf[j];
    }

    let norm = 0;
    for (const v of vec) norm += v * v;
    norm = Math.sqrt(norm) || 1;
    for (let j = 0; j < vec.length; j++) vec[j] /= norm;

    X[di] = vec;
  }

  return { X, vocab };
}

function topTermsForCluster(X, labels, vocab, clusterId, topN = 8) {
  const V = vocab.length;
  const sum = new Array(V).fill(0);
  let n = 0;

  for (let i = 0; i < X.length; i++) {
    if (labels[i] !== clusterId) continue;
    const vec = X[i];
    for (let j = 0; j < V; j++) sum[j] += vec[j];
    n++;
  }
  if (n === 0) return [];

  for (let j = 0; j < V; j++) sum[j] /= n;

  const pairs = sum.map((v, j) => [j, v]);
  pairs.sort((a, b) => b[1] - a[1]);
  return pairs.slice(0, topN).map(([j]) => vocab[j]);
}

/** --------- Scheme A labeling (distinctiveness by filtering) --------- **/

// label-only stoplist (DOES NOT affect clustering)
const LABEL_STOP = new Set([
  "ai",
  "artificial_intelligence",
  "technology",
  "technological",
  "model",
  "models",
  "language",
  "paper",
  "study",
  "research",
  "article",
  "approach",
  "analysis",
]);

function buildGlobalDf(docsTokens) {
  const df = new Map();
  for (const toks of docsTokens) {
    const seen = new Set(toks);
    for (const t of seen) df.set(t, (df.get(t) || 0) + 1);
  }
  return df;
}

/**
 * Cluster-local token frequency for label (filtered):
 * - remove LABEL_STOP
 * - remove terms with global DF ratio >= labelDfMax (default 0.5)
 * Deterministic (stable sort).
 */
function clusterTopTermsForLabel(docsTokens, memberIdx, globalDf, Ndocs, topN = 12, labelDfMax = 0.5) {
  const freq = new Map();
  for (const i of memberIdx) {
    const toks = docsTokens[i] || [];
    for (const t of toks) freq.set(t, (freq.get(t) || 0) + 1);
  }

  const items = [];
  for (const [term, count] of freq.entries()) {
    if (LABEL_STOP.has(term)) continue;
    const gdf = globalDf.get(term) || 0;
    const ratio = gdf / Math.max(1, Ndocs);
    if (ratio >= labelDfMax) continue;
    items.push({ term, count, gdf });
  }

  items.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.term.localeCompare(b.term);
  });

  return items.slice(0, topN);
}

function makeClusterLabel(topTerms) {
  return topTerms.slice(0, 4).map((x) => x.term.replace(/_/g, " ")).join(" / ");
}

/** --------- Deterministic kmeans (cosine) --------- **/

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cosineDist(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return 1 - dot;
}

function kmeans(vectors, k, seed = 42, maxIter = 50) {
  const rand = mulberry32(seed);
  const n = vectors.length;
  if (n === 0) return { labels: [], centroids: [] };

  const kk = Math.max(1, Math.min(k, n));

  const centroids = [];
  const used = new Set();
  while (centroids.length < kk) {
    const idx = Math.floor(rand() * n);
    if (used.has(idx)) continue;
    used.add(idx);
    centroids.push(Float64Array.from(vectors[idx]));
  }

  let labels = new Array(n).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = 0;

    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const d = cosineDist(vectors[i], centroids[c]);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (labels[i] !== best) {
        labels[i] = best;
        changed++;
      }
    }

    const dim = centroids[0].length;
    const sums = Array.from({ length: centroids.length }, () => new Float64Array(dim));
    const counts = new Array(centroids.length).fill(0);

    for (let i = 0; i < n; i++) {
      const c = labels[i];
      counts[c]++;
      const v = vectors[i];
      const s = sums[c];
      for (let j = 0; j < dim; j++) s[j] += v[j];
    }

    for (let c = 0; c < centroids.length; c++) {
      const s = sums[c];
      const cnt = counts[c] || 1;
      for (let j = 0; j < dim; j++) s[j] /= cnt;

      let norm = 0;
      for (let j = 0; j < dim; j++) norm += s[j] * s[j];
      norm = Math.sqrt(norm) || 1;
      for (let j = 0; j < dim; j++) s[j] /= norm;

      centroids[c] = s;
    }

    if (changed === 0) break;
  }

  return { labels, centroids };
}

/** --------- Field repair layer --------- **/

function isUnknownField(s) {
  const t = String(s || "").trim().toLowerCase();
  if (!t) return true;
  if (t === "unknown") return true;
  if (t.startsWith("unknown")) return true;
  if (t.includes("not stated in abstract")) return true;
  return false;
}

function inferMethodFromText(text) {
  const t = String(text || "").toLowerCase();

  if (/\bethnograph(y|ic)|participant observation|fieldwork\b/.test(t)) return "ethnography";
  if (/\binterview(s|ed|ing)?\b|semi-structured|in-depth interview/.test(t)) return "interviews";
  if (/\bfocus group(s)?\b/.test(t)) return "focus groups";
  if (/\bcontent analysis\b/.test(t)) return "content analysis";
  if (/\bcase study\b/.test(t)) return "case study";

  if (/\bexperiment(s|al)?\b|randomi[sz]ed|field experiment|lab experiment/.test(t)) return "experiment";
  if (/\bsurvey(s)?\b|questionnaire|respondent(s)?\b/.test(t)) return "survey";
  if (/\bregression\b|panel data|difference-in-differences|instrumental variable/.test(t))
    return "quantitative analysis";

  if (/\btopic model(l)?(ing)?\b|lda\b/.test(t)) return "topic modeling";
  if (/\bnlp\b|natural language processing|text mining|computational text analysis/.test(t))
    return "computational text analysis";
  if (/\bnetwork analysis\b|social network/.test(t)) return "network analysis";

  if (/\bliterature review\b|systematic review|meta-analysis/.test(t)) return "review";
  if (/\bconceptual\b|\btheoretical\b|framework|normative/.test(t)) return "conceptual/theoretical paper";

  return "Unknown";
}

function inferDataFromText(text) {
  const t = String(text || "").toLowerCase();

  if (/\btwitter\b|x\.com\b/.test(t)) return "twitter/x data";
  if (/\breddit\b/.test(t)) return "reddit data";
  if (/\bfacebook\b|instagram|tiktok|youtube|bilibili|wechat|weibo/.test(t)) return "social media/platform data";
  if (/\bplatform\b|\bonline\b|\bdigital trace(s)?\b|\blog(s)?\b/.test(t)) return "online/platform data";

  if (/\binterview(s)?\b|semi-structured|in-depth interview/.test(t)) return "interviews";
  if (/\bfocus group(s)?\b/.test(t)) return "focus groups";
  if (/\bsurvey(s)?\b|questionnaire|respondent(s)?\b/.test(t)) return "survey data";

  if (/\bcorpus\b|\bdocument(s)?\b|\barchive(s)?\b|\bnews\b|\bmedia\b/.test(t)) return "documents/media texts";
  if (/\bpolicy\b|\bregulation(s)?\b|\blaw(s)?\b/.test(t)) return "policy/legal documents";

  if (/\bexperiment(s|al)?\b|randomi[sz]ed|field experiment|lab experiment/.test(t)) return "experimental data";
  if (/\bethnograph(y|ic)|participant observation|fieldwork\b/.test(t)) return "ethnographic observation";

  return "Unknown";
}

/** --------- CLI / IO helpers --------- **/

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        args[k] = true;
      } else {
        args[k] = next;
        i++;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function todayYYYYMMDD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function nextVersion(outDir, prefix, date) {
  if (!fs.existsSync(outDir)) return 1;
  const re = new RegExp(`^${escapeReg(prefix)}_${date}_v(\\d+)\\.`);
  let maxV = 0;
  for (const f of fs.readdirSync(outDir)) {
    const m = f.match(re);
    if (m) maxV = Math.max(maxV, Number(m[1]));
  }
  return maxV + 1;
}

function readText(p) {
  return fs.readFileSync(p, "utf-8");
}

function writeText(p, s) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, s, "utf-8");
}

function writeLatest(latestPath, contentPath) {
  writeText(latestPath, readText(contentPath));
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCSV(rows, headers) {
  const lines = [];
  lines.push(headers.map(csvEscape).join(","));
  for (const r of rows) {
    lines.push(headers.map((h) => csvEscape(r[h])).join(","));
  }
  return lines.join("\n") + "\n";
}

function groupCount(rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!k) continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].map(([key, n]) => ({ key, n }));
}

function parseRangeK(s) {
  const m = String(s || "").trim().match(/^(\d+)\s*(?:\.\.|-)\s*(\d+)$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return { lo, hi };
}

/** --------- Parse summaries_latest.md --------- **/

function parseSummariesMarkdown(md) {
  const blocks = md
    .split(/\n---\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const papers = [];
  for (const b of blocks) {
    const h = b.match(/^##\s+\d+\.\s+(.*)\s+\((\d{4})\)\s*$/m);
    if (!h) continue;

    const title = h[1].trim();
    const year = Number(h[2]);

    const journal = (b.match(/^- Journal:\s*(.*)$/m)?.[1] ?? "").trim();
    const doi = (b.match(/^- DOI:\s*(.*)$/m)?.[1] ?? "").trim();
    const openalex = (b.match(/^- OpenAlex:\s*(.*)$/m)?.[1] ?? "").trim();

    const rq =
      (b.match(/\*\*Research question\*\*:\s*([\s\S]*?)(?:\n\n|\n\*\*Data \/ material\*\*|$)/m)?.[1] ?? "").trim();

    const data =
      (b.match(/\*\*Data \/ material\*\*:\s*([\s\S]*?)(?:\n\n|\n\*\*Method\*\*|$)/m)?.[1] ?? "").trim();

    const method =
      (b.match(/\*\*Method\*\*:\s*([\s\S]*?)(?:\n\n|\n\*\*Key findings|$)/m)?.[1] ?? "").trim();

    const findings =
      (b.match(/\*\*Key findings.*?\*\*:\s*([\s\S]*?)(?:\n\n|\n\*\*Contribution\*\*|$)/m)?.[1] ?? "").trim();

    const manual = /\[MANUAL\]/.test(b);

    papers.push({
      title,
      year,
      journal,
      doi,
      openalex,
      rq,
      data_material: data,
      method,
      findings,
      manual,
    });
  }
  return papers;
}

/** --------- Relevance scoring (AI marker gate) --------- **/

const AI_MARKERS = [
  "ai",
  "artificial_intelligence",
  "llm",
  "generative_ai",
  "chatgpt",
  "gpt",
  "machine_learning",
  "ml",
  "deep_learning",
  "dl",
  "nlp",
  "automation",
  "robot",
  "algorithm",
];

function relevanceScore(tokens) {
  const set = new Set(tokens || []);
  let s = 0;
  for (const m of AI_MARKERS) if (set.has(m)) s += 2;
  return s;
}

/** --------- QA report --------- **/

function writeQaReport(outPath, { topic, inPath, date, v, kEff, seed, qa, topMissingByJournal }) {
  const lines = [];
  lines.push(`# QA Report: ${topic}`);
  lines.push(``);
  lines.push(`- source: ${inPath}`);
  lines.push(`- date: ${date}`);
  lines.push(`- version: v${v}`);
  lines.push(`- k: ${kEff}, seed=${seed}`);
  lines.push(``);
  lines.push(`## Summary`);
  lines.push(`- total: ${qa.total}`);
  lines.push(`- unknown_method_final: ${qa.unknownMethod}`);
  lines.push(`- unknown_data_final: ${qa.unknownData}`);
  lines.push(`- missing_journal: ${qa.missingJournal}`);
  lines.push(`- out_of_scope_candidates: ${qa.outOfScope}`);
  lines.push(`- method_auto_hits: ${qa.methodAuto}`);
  lines.push(`- data_auto_hits: ${qa.dataAuto}`);
  lines.push(``);
  lines.push(`## Top missing (method_final/data_final) by journal`);
  if (!topMissingByJournal.length) {
    lines.push(`- (none)`);
  } else {
    for (const x of topMissingByJournal) lines.push(`- ${x.journal}: ${x.missing} missing`);
  }
  lines.push(``);
  writeText(outPath, lines.join("\n"));
}

/** --------- Briefing generator --------- **/

function briefing(topic, rowsForBriefing, clusterInfo, qa) {
  const total = rowsForBriefing.length;
  const years = rowsForBriefing.map((r) => Number(r.year)).filter((x) => Number.isFinite(x));
  const minY = years.length ? Math.min(...years) : "";
  const maxY = years.length ? Math.max(...years) : "";

  const journalCount = new Map();
  for (const r of rowsForBriefing) {
    const j = (r.journal || "").trim();
    if (!j) continue;
    journalCount.set(j, (journalCount.get(j) || 0) + 1);
  }
  const topJournals = [...journalCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

  const lines = [];
  lines.push(`# 简报：${topic} 研究图谱（自动生成）`);
  lines.push(``);
  lines.push(
    `（refs）protected_phrases=${SOC_PROTECTED_PHRASES.length}, stopwords=${SOC_STOPWORDS_RAW.length}, lemmas(tokens)=${Object.keys(
      LEMMAS.tokens || {}
    ).length}`
  );
  lines.push(``);

  const span = minY && maxY ? `**${minY}–${maxY}**` : `（年份缺失）`;
  const topJ = topJournals.length ? topJournals.map(([j, c]) => `${j}（${c}）`).join("、") : "（期刊字段缺失）";

  lines.push(`截至目前共纳入 **${total}** 篇文献，时间跨度 ${span}。主要发表载体集中在：${topJ}。`);
  lines.push(``);
  lines.push(`## 一、主题版图（聚类）`);
  for (const c of clusterInfo) {
    lines.push(
      `- **主题 ${c.id}：${c.label}**（${c.count} 篇，约 ${((c.count / Math.max(1, total)) * 100).toFixed(1)}%）`
    );
  }
  lines.push(``);
  lines.push(`## 二、方法与材料概况（来自结构化摘要字段 + 自动修复后的粗统计）`);

  const mCount = new Map();
  const dCount = new Map();
  for (const r of rowsForBriefing) {
    const m = (r.method_final || "Unknown").split(";")[0].trim() || "Unknown";
    const d = (r.data_material_final || "Unknown").split(";")[0].trim() || "Unknown";
    mCount.set(m, (mCount.get(m) || 0) + 1);
    dCount.set(d, (dCount.get(d) || 0) + 1);
  }
  const topM = [...mCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const topD = [...dCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

  lines.push(`- **常见方法**：${topM.map(([k, v]) => `${k}（${v}）`).join("、")}。`);
  lines.push(`- **常见材料/数据**：${topD.map(([k, v]) => `${k}（${v}）`).join("、")}。`);
  lines.push(``);

  lines.push(`## 三、质量提示（QA）`);
  lines.push(`- Unknown(method_final)：${qa.unknownMethod}/${qa.total}`);
  lines.push(`- Unknown(data_material_final)：${qa.unknownData}/${qa.total}`);
  lines.push(`- 缺 journal：${qa.missingJournal}/${qa.total}`);
  lines.push(`- 疑似跑题（out_of_scope_candidate）：${qa.outOfScope}/${qa.total}`);
  lines.push(`- 自动修复命中：method_auto=${qa.methodAuto}, data_auto=${qa.dataAuto}`);
  lines.push(``);

  lines.push(`## 四、下一步建议（系统优先）`);
  lines.push(`- 优先补齐：Top missing by journal（QA 报告）列出的期刊；`);
  lines.push(`- label 已做“全局泛化词过滤”：如果仍觉得泛，可把 --labelDfMax 从 0.5 调小到 0.35；`);
  lines.push(`- 自动修复是兜底：建议抽查 source=auto 的条目，逐步完善规则；`);
  lines.push(``);
  return lines.join("\n");
}

/** --------- Main --------- **/

const args = parseArgs(process.argv);
const topic = args._[0];

if (!topic) {
  console.error(
    `Usage: node synthesis.mjs <topic> [--in path] [--k 6] [--date YYYYMMDD] [--v N] [--seed 42] [--minDf 2] [--titleWeight 2] [--debug-text <idx|substr>] [--k-scan "5..10"] [--labelDfMax 0.5]`
  );
  process.exit(1);
}

const inPath = args.in ? String(args.in) : path.join("outputs", topic, "03_summaries", "summaries_latest.md");

const k = Number(args.k || 6);
const seed = Number(args.seed || 42);
const date = String(args.date || todayYYYYMMDD());
const minDf = Number(args.minDf || 2);
const titleWeight = Number(args.titleWeight || 2);
const debugTextArg = args["debug-text"] ? String(args["debug-text"]) : "";
const kScanArg = args["k-scan"] ? String(args["k-scan"]) : "";
const labelDfMax = Number(args.labelDfMax ?? 0.5);

if (!fs.existsSync(inPath)) {
  console.error(`[synthesis] Input not found: ${inPath}`);
  process.exit(1);
}

if (!fs.existsSync(PROTECTED_PHRASES_FILE)) console.warn(`[warn] Missing protected phrases file: ${PROTECTED_PHRASES_FILE}`);
if (!fs.existsSync(SOC_STOPWORDS_FILE)) console.warn(`[warn] Missing sociology stopwords file: ${SOC_STOPWORDS_FILE}`);
if (!fs.existsSync(LEMMATIZATION_FILE)) console.warn(`[warn] Missing lemmatization file: ${LEMMATIZATION_FILE}`);

const md = readText(inPath);
const papers = parseSummariesMarkdown(md);

const outDir = path.join("outputs", topic, "04_meta");
ensureDir(outDir);

const v = args.v ? Number(args.v) : nextVersion(outDir, "meta_table", date);

/** --------- Repair method/data BEFORE docs --------- **/

const repairedPapers = papers.map((p) => {
  const combined = [p.title, p.rq, p.findings].filter(Boolean).join(" ");

  const methodOrig = p.method || "";
  const dataOrig = p.data_material || "";

  let methodFinal = methodOrig;
  let dataFinal = dataOrig;
  let methodSource = "original";
  let dataSource = "original";

  if (isUnknownField(methodOrig)) {
    const inferred = inferMethodFromText(combined);
    methodFinal = inferred;
    if (!isUnknownField(inferred)) methodSource = "auto";
  }

  if (isUnknownField(dataOrig)) {
    const inferred = inferDataFromText(combined);
    dataFinal = inferred;
    if (!isUnknownField(inferred)) dataSource = "auto";
  }

  return {
    ...p,
    method_orig: methodOrig,
    data_material_orig: dataOrig,
    method_final: methodFinal,
    data_material_final: dataFinal,
    method_source: methodSource,
    data_source: dataSource,
  };
});

/** --------- Build docs / tokens --------- **/

function buildDocText(p, tw = 2) {
  const titlePart = Array.from({ length: Math.max(1, tw) }, () => p.title || "").join(" ");
  const methodPart = isUnknownField(p.method_final) ? "" : p.method_final;
  const dataPart = isUnknownField(p.data_material_final) ? "" : p.data_material_final;
  return [titlePart, p.journal, p.rq, methodPart, dataPart, p.findings].filter(Boolean).join(" ");
}

const docs = repairedPapers.map((p) => buildDocText(p, titleWeight));
const docsTokens = docs.map(tokenize);

// global DF for labeling filter
const globalDf = buildGlobalDf(docsTokens);
const Ndocs = docsTokens.length;

// Debug one example (by index or title substring)
if (debugTextArg) {
  let idx = -1;
  if (/^\d+$/.test(debugTextArg)) {
    idx = Math.max(0, Math.min(repairedPapers.length - 1, Number(debugTextArg)));
  } else {
    const needle = debugTextArg.toLowerCase();
    idx = repairedPapers.findIndex((p) => (p.title || "").toLowerCase().includes(needle));
    if (idx < 0) idx = 0;
  }
  const p = repairedPapers[idx] || repairedPapers[0];
  const rawText = buildDocText(p, titleWeight);
  debugTokenFlow({ id: `paper[${idx}] ${p?.title || ""}`, rawText });
}

/** --------- TF-IDF + kmeans --------- **/

const { X, vocab } = buildTfidfMatrix(docsTokens, { minDf });

const kEff = Math.max(1, Math.min(k, repairedPapers.length || 1));
const km = kmeans(X, kEff, seed);
const labels = km.labels;

/** --------- Optional k-scan --------- **/

const kRange = kScanArg ? parseRangeK(kScanArg) : null;
if (kRange) {
  const lines = [];
  lines.push(`# k-scan: ${topic}`);
  lines.push(`source: ${inPath}`);
  lines.push(`date: ${date}, v${v}`);
  lines.push(`seed: ${seed}, minDf=${minDf}, titleWeight=${titleWeight}`);
  lines.push(`labelDfMax=${labelDfMax}`);
  lines.push(
    `refs: protected=${SOC_PROTECTED_PHRASES.length}, stopwords=${SOC_STOPWORDS_RAW.length}, lemmas=${Object.keys(
      LEMMAS.tokens || {}
    ).length}`
  );
  lines.push(``);

  for (let kk = kRange.lo; kk <= kRange.hi; kk++) {
    const kEff2 = Math.max(1, Math.min(kk, repairedPapers.length || 1));
    const { labels: lab2 } = kmeans(X, kEff2, seed);

    const sizes = new Array(kEff2).fill(0);
    for (const x of lab2) sizes[x]++;

    const sizePairs = sizes.map((n, id) => ({ id, n })).sort((a, b) => b.n - a.n);
    lines.push(`## k=${kEff2}`);
    lines.push(`sizes: ${sizePairs.map((x) => `${x.id}:${x.n}`).join(", ")}`);

    for (const c of sizePairs.slice(0, Math.min(6, sizePairs.length))) {
      const memberIdx = [];
      for (let i = 0; i < lab2.length; i++) if (lab2[i] === c.id) memberIdx.push(i);
      const top = clusterTopTermsForLabel(docsTokens, memberIdx, globalDf, Ndocs, 10, labelDfMax);
      const label = makeClusterLabel(top);
      lines.push(`- cluster ${c.id} (${c.n}): ${label}`);
    }
    lines.push(``);
  }

  const kScanPath = path.join(outDir, `k_scan_${date}_v${v}.md`);
  writeText(kScanPath, lines.join("\n"));
  writeLatest(path.join(outDir, `k_scan_latest.md`), kScanPath);
}

/** --------- Cluster stats + labels (Scheme A) --------- **/

const clusterStats = [];
for (let cid = 0; cid < kEff; cid++) {
  const memberIdx = [];
  for (let i = 0; i < labels.length; i++) if (labels[i] === cid) memberIdx.push(i);
  if (memberIdx.length === 0) continue;

  // label: filtered freq
  const topLabel = clusterTopTermsForLabel(docsTokens, memberIdx, globalDf, Ndocs, 12, labelDfMax);
  const label = makeClusterLabel(topLabel);

  // debug view: tf-idf terms (kept)
  const keywords = topTermsForCluster(X, labels, vocab, cid, 8);

  clusterStats.push({
    id: cid,
    count: memberIdx.length,
    label: `Theme: ${label}`,
    labelTop: topLabel.map((x) => x.term),
    keywords,
  });
}
clusterStats.sort((a, b) => b.count - a.count);

/** --------- Relevance / out_of_scope --------- **/

const aiScores = docsTokens.map((toks) => relevanceScore(toks));
const outOfScope = aiScores.map((s) => s < 2);

/** --------- meta_table --------- **/

const rows = repairedPapers.map((p, idx) => {
  const cid = labels[idx] ?? 0;
  const c = clusterStats.find((x) => x.id === cid);
  return {
    cluster_id: cid,
    theme_label: c?.label || "",
    ai_score: aiScores[idx] ?? 0,
    out_of_scope_candidate: outOfScope[idx] ? 1 : 0,
    year: p.year || "",
    journal: p.journal || "",
    title: p.title || "",
    doi: p.doi || "",
    openalex: p.openalex || "",
    data_material: p.data_material_orig || "",
    method: p.method_orig || "",
    data_material_final: p.data_material_final || "",
    method_final: p.method_final || "",
    data_source: p.data_source || "original",
    method_source: p.method_source || "original",
    rq: (p.rq || "").slice(0, 220),
    notes: p.manual ? "MANUAL" : "",
  };
});

const csvHeaders = [
  "cluster_id",
  "theme_label",
  "ai_score",
  "out_of_scope_candidate",
  "year",
  "journal",
  "title",
  "doi",
  "openalex",
  "data_material",
  "method",
  "data_material_final",
  "method_final",
  "data_source",
  "method_source",
  "rq",
  "notes",
];

const csvPath = path.join(outDir, `meta_table_${date}_v${v}.csv`);
writeText(csvPath, toCSV(rows, csvHeaders));
writeLatest(path.join(outDir, `meta_table_latest.csv`), csvPath);

/** --------- Pivots --------- **/

// year × cluster
{
  const counts = groupCount(rows, (r) => {
    const y = String(r.year || "").trim();
    if (!y) return "";
    return `${y}\t${r.cluster_id}`;
  }).map((x) => {
    const [year, cluster_id] = x.key.split("\t");
    return { year, cluster_id, n: x.n };
  });

  counts.sort((a, b) => {
    if (a.year !== b.year) return Number(a.year) - Number(b.year);
    return Number(a.cluster_id) - Number(b.cluster_id);
  });

  const p = path.join(outDir, `year_cluster_${date}_v${v}.csv`);
  writeText(p, toCSV(counts, ["year", "cluster_id", "n"]));
  writeLatest(path.join(outDir, `year_cluster_latest.csv`), p);
}

// journal × cluster
{
  const counts = groupCount(rows, (r) => {
    const j = String(r.journal || "").trim();
    if (!j) return "";
    return `${j}\t${r.cluster_id}`;
  }).map((x) => {
    const [journal, cluster_id] = x.key.split("\t");
    return { journal, cluster_id, n: x.n };
  });

  counts.sort((a, b) => b.n - a.n);

  const p = path.join(outDir, `journal_cluster_${date}_v${v}.csv`);
  writeText(p, toCSV(counts, ["journal", "cluster_id", "n"]));
  writeLatest(path.join(outDir, `journal_cluster_latest.csv`), p);
}

// method_final × cluster
{
  const counts = groupCount(rows, (r) => {
    const m = String(r.method_final || "").trim();
    const mm = isUnknownField(m) ? "Unknown" : m.split(";")[0].trim();
    return `${mm}\t${r.cluster_id}`;
  }).map((x) => {
    const [method, cluster_id] = x.key.split("\t");
    return { method, cluster_id, n: x.n };
  });

  counts.sort((a, b) => b.n - a.n);

  const p = path.join(outDir, `method_cluster_${date}_v${v}.csv`);
  writeText(p, toCSV(counts, ["method", "cluster_id", "n"]));
  writeLatest(path.join(outDir, `method_cluster_latest.csv`), p);
}

// data_material_final × cluster
{
  const counts = groupCount(rows, (r) => {
    const d = String(r.data_material_final || "").trim();
    const dd = isUnknownField(d) ? "Unknown" : d.split(";")[0].trim();
    return `${dd}\t${r.cluster_id}`;
  }).map((x) => {
    const [data_material, cluster_id] = x.key.split("\t");
    return { data_material, cluster_id, n: x.n };
  });

  counts.sort((a, b) => b.n - a.n);

  const p = path.join(outDir, `data_cluster_${date}_v${v}.csv`);
  writeText(p, toCSV(counts, ["data_material", "cluster_id", "n"]));
  writeLatest(path.join(outDir, `data_cluster_latest.csv`), p);
}

/** --------- QA --------- **/

const qa = {
  total: rows.length,
  unknownMethod: 0,
  unknownData: 0,
  missingJournal: 0,
  outOfScope: 0,
  methodAuto: 0,
  dataAuto: 0,
};

for (const r of rows) {
  if (isUnknownField(r.method_final)) qa.unknownMethod++;
  if (isUnknownField(r.data_material_final)) qa.unknownData++;
  if (!String(r.journal || "").trim()) qa.missingJournal++;
  if (Number(r.out_of_scope_candidate) === 1) qa.outOfScope++;
  if (String(r.method_source) === "auto") qa.methodAuto++;
  if (String(r.data_source) === "auto") qa.dataAuto++;
}

// Top missing by journal
{
  const missByJournal = new Map();
  for (const r of rows) {
    const j = String(r.journal || "").trim() || "(Missing journal)";
    const miss = (isUnknownField(r.method_final) ? 1 : 0) + (isUnknownField(r.data_material_final) ? 1 : 0);
    if (miss === 0) continue;
    missByJournal.set(j, (missByJournal.get(j) || 0) + miss);
  }
  const topMissingByJournal = [...missByJournal.entries()]
    .map(([journal, missing]) => ({ journal, missing }))
    .sort((a, b) => b.missing - a.missing)
    .slice(0, 10);

  const qaPath = path.join(outDir, `qa_report_${date}_v${v}.md`);
  writeQaReport(qaPath, { topic, inPath, date, v, kEff, seed, qa, topMissingByJournal });
  writeLatest(path.join(outDir, `qa_report_latest.md`), qaPath);
}

/** --------- Clusters MD --------- **/

const clusterLines = [];
clusterLines.push(`# Meta clusters for topic: ${topic}`);
clusterLines.push(`Source: ${inPath}`);
clusterLines.push(`Total papers: ${repairedPapers.length}`);
clusterLines.push(`k=${kEff}, seed=${seed}`);
clusterLines.push(`minDf=${minDf}, titleWeight=${titleWeight}`);
clusterLines.push(`labelDfMax=${labelDfMax}`);
clusterLines.push(
  `refs: protected_phrases=${SOC_PROTECTED_PHRASES.length}, stopwords=${SOC_STOPWORDS_RAW.length}, lemmas(tokens)=${Object.keys(
    LEMMAS.tokens || {}
  ).length}`
);
clusterLines.push(`repair: method_auto=${qa.methodAuto}, data_auto=${qa.dataAuto}`);
clusterLines.push(``);

for (const c of clusterStats) {
  clusterLines.push(`## Cluster ${c.id} (${c.count} papers)`);
  clusterLines.push(`**${c.label}**`);
  clusterLines.push(`Top terms (label): ${c.labelTop.map((t) => t.replace(/_/g, " ")).join(", ")}`);
  clusterLines.push(`Top terms (tf-idf): ${c.keywords.map((t) => t.replace(/_/g, " ")).join(", ")}`);
  clusterLines.push(``);

  const items = repairedPapers
    .map((p, i) => ({ p, i }))
    .filter((x) => labels[x.i] === c.id)
    .sort((a, b) => (b.p.year || 0) - (a.p.year || 0));

  for (const { p, i } of items) {
    const metaBits = [];
    if (p.journal) metaBits.push(p.journal);
    if (p.doi) metaBits.push(`DOI: ${p.doi}`);
    if (!isUnknownField(p.method_final)) metaBits.push(`M:${p.method_final}${p.method_source === "auto" ? "*" : ""}`);
    if (!isUnknownField(p.data_material_final))
      metaBits.push(`D:${p.data_material_final}${p.data_source === "auto" ? "*" : ""}`);

    const meta = metaBits.length ? `- ${metaBits.join(" | ")}` : "";
    const flag = outOfScope[i] ? " ⚑out_of_scope" : "";
    clusterLines.push(`- **${p.title} (${p.year || ""})** ${meta}${flag}`);
  }
  clusterLines.push(``);
}

const clustersPath = path.join(outDir, `meta_clusters_${date}_v${v}.md`);
writeText(clustersPath, clusterLines.join("\n"));
writeLatest(path.join(outDir, `meta_clusters_latest.md`), clustersPath);

/** --------- Briefing MD --------- **/

const briefingPath = path.join(outDir, `briefing_${date}_v${v}.md`);
writeText(briefingPath, briefing(topic, rows, clusterStats, qa));
writeLatest(path.join(outDir, `briefing_latest.md`), briefingPath);

/** --------- Logs --------- **/

console.log(`[synthesis] Skill root: ${SKILL_ROOT}`);
console.log(`[synthesis] Refs: ${REFERENCES_DIR}`);
console.log(`[synthesis] Protected phrases: ${SOC_PROTECTED_PHRASES.length}`);
console.log(`[synthesis] Sociology stopwords: ${SOC_STOPWORDS_RAW.length}`);
console.log(
  `[synthesis] Lemmas: tokens=${Object.keys(LEMMAS.tokens || {}).length}, phrases=${Object.keys(LEMMAS.phrases || {}).length}`
);
console.log(`[synthesis] Input: ${inPath}`);
console.log(`[synthesis] Papers: ${repairedPapers.length}`);
console.log(`[synthesis] Params: k=${kEff}, seed=${seed}, minDf=${minDf}, titleWeight=${titleWeight}, labelDfMax=${labelDfMax}`);
console.log(`[synthesis] Repair hits: method_auto=${qa.methodAuto}, data_auto=${qa.dataAuto}`);
console.log(
  `[synthesis] QA(final): unknownMethod=${qa.unknownMethod}, unknownData=${qa.unknownData}, missingJournal=${qa.missingJournal}, outOfScope=${qa.outOfScope}`
);
console.log(`[synthesis] Wrote: ${csvPath}`);
console.log(`[synthesis] Wrote: ${clustersPath}`);
console.log(`[synthesis] Wrote: ${briefingPath}`);
console.log(`[synthesis] Wrote: ${path.join(outDir, `qa_report_${date}_v${v}.md`)}`);
console.log(`[synthesis] Wrote: ${path.join(outDir, `year_cluster_${date}_v${v}.csv`)}`);
console.log(`[synthesis] Wrote: ${path.join(outDir, `journal_cluster_${date}_v${v}.csv`)}`);
console.log(`[synthesis] Wrote: ${path.join(outDir, `method_cluster_${date}_v${v}.csv`)}`);
console.log(`[synthesis] Wrote: ${path.join(outDir, `data_cluster_${date}_v${v}.csv`)}`);