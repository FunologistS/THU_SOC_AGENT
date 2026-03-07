#!/usr/bin/env node
/**
 * 2_sync_ssci_q1q4.mjs — 从归一化 JCR CSV 生成 SSCI Q1–Q4 的 source YAML（主流程第 2 步）
 *
 * 两种模式：
 * 1) 多学科（默认）：对 02_normalize 下每学科取最新 CSV，各生成一份 source yml，再可选执行 merge。
 * 2) 单学科：指定 --input <csv> [--prefix <prefix>]，只处理一个文件。
 *
 * 用法（项目根目录）:
 *   node .claude/skills/journal-catalog/scripts/2_sync_ssci_q1q4.mjs           # 多学科 + merge
 *   node .../2_sync_ssci_q1q4.mjs --no-merge                                             # 多学科，不 merge
 *   node .../2_sync_ssci_q1q4.mjs --input path/to/Sociology_normalized.csv --prefix journals_ssci_sociology_q1
 *   node .../2_sync_ssci_q1q4.mjs --input path/to/Sociology_normalized.csv                 # prefix 从文件名推导
 *
 * 选项: --input <csv> --prefix <prefix> [--all-categories | --category X] [--all] [--no-merge]
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import YAML from "yaml";

const ROOT = process.cwd();
const NORMALIZED_DIR = path.join(ROOT, ".claude/skills/journal-catalog/assets/02_normalize");
const OUT_DIR = path.join(ROOT, ".claude/skills/journal-catalog/references/sources");
const MERGE_SCRIPT = path.join(ROOT, ".claude/skills/journal-catalog/scripts/3_merge_journals.mjs");

const DEFAULT_PREFIX = "journals_ssci_sociology_q1";
const NORMALIZED_RE = /^WOS_JCR_\d{6}_(.+)_\d{6}_normalized\.csv$/i;

const SLUG_TO_PREFIX = {
  Area_and_Asian_Studies: "journals_ssci_area_asian_studies_q1",
  Industrial_Relations_and_Labor: "journals_ssci_industrial_relations_labor_q1",
};

function slugToPrefix(slug) {
  if (SLUG_TO_PREFIX[slug]) return SLUG_TO_PREFIX[slug];
  return `journals_ssci_${String(slug).toLowerCase()}_q1`;
}

// ---------- helpers ----------
function norm(s) {
  return (s ?? "").toString().trim();
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function getTodayYYYYMMDD(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getNextVersion(dir, prefix, dateTag) {
  ensureDir(dir);
  const files = fs.readdirSync(dir);
  const pattern = new RegExp(`^${escapeRegExp(prefix)}_${escapeRegExp(dateTag)}_v(\\d+)\\.yml$`);
  let max = 0;
  for (const f of files) {
    const m = f.match(pattern);
    if (m) {
      const v = parseInt(m[1], 10);
      if (!Number.isNaN(v) && v > max) max = v;
    }
  }
  return max + 1;
}

function normIssn(s) {
  return norm(s).toUpperCase().replace(/[^0-9X]/g, "");
}

function guessShort(name) {
  const words = norm(name)
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const stop = new Set(["OF", "THE", "AND", "A", "AN", "IN", "ON", "FOR", "TO"]);
  const letters = words
    .map((w) => w.toUpperCase())
    .filter((w) => !stop.has(w))
    .slice(0, 6)
    .map((w) => w[0])
    .join("");
  return letters.length >= 2 ? letters : "";
}

function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = "";
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (c === "\r") {
      i += 1;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function toRowObjects(csvText) {
  const table = parseCSV(csvText).filter((r) => r.some((x) => norm(x) !== ""));
  if (table.length < 2) return { header: [], rows: [] };
  const header = table[0].map((h) => norm(h));
  const rows = [];
  for (let r = 1; r < table.length; r++) {
    const line = table[r];
    const obj = {};
    for (let c = 0; c < header.length; c++) obj[header[c]] = line[c] ?? "";
    rows.push(obj);
  }
  return { header, rows };
}

function uniqByKey(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const k = keyFn(it);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

function detectKeys(header) {
  const lower = header.map((h) => h.toLowerCase());
  const get = (k) => {
    const idx = lower.indexOf(k.toLowerCase());
    return idx >= 0 ? header[idx] : "";
  };
  return {
    nameKey: get("journal_name") || get("Journal name") || get("Journal"),
    abbrevKey: get("jcr_abbrev") || get("abbrev") || get("short"),
    publisherKey: get("publisher"),
    issnKey: get("issn_print") || get("issn") || get("print_issn"),
    eissnKey: get("issn_e") || get("eissn") || get("issn_online") || get("online_issn"),
    quartileKey: get("quartile") || get("jif_quartile") || get("jcr_quartile"),
    editionKey: get("edition"),
    categoryKey: get("category"),
    yearKey: get("jcr_year"),
    jifKey: get("jif") || get("journal_impact_factor") || get("impact_factor"),
    jciKey: get("jci") || get("journal_citation_indicator"),
    oaKey: get("oa_citable_pct") || get("oa_citable"),
    totalCitationsKey: get("total_citations") || get("total_citations"),
  };
}

function isQ1toQ4(v) {
  const t = norm(v).toUpperCase();
  return /^Q?[1-4]$/.test(t) || ["Q1", "Q2", "Q3", "Q4"].some((q) => t.startsWith(q));
}

function isSSCI(v) {
  return norm(v).toUpperCase() === "SSCI";
}

/** 从 02_normalize 下按学科 slug 取最新一份 CSV */
function getLatestNormalizedPerSlug() {
  if (!fs.existsSync(NORMALIZED_DIR)) return [];
  const files = fs
    .readdirSync(NORMALIZED_DIR)
    .filter((f) => NORMALIZED_RE.test(f))
    .map((f) => {
      const m = f.match(NORMALIZED_RE);
      const slug = (m && m[1]) ? m[1] : "";
      const fullPath = path.join(NORMALIZED_DIR, f);
      const stat = fs.statSync(fullPath);
      return { file: f, slug, fullPath, mtimeMs: stat.mtimeMs };
    });
  const bySlug = new Map();
  for (const o of files) {
    const cur = bySlug.get(o.slug);
    if (!cur || o.mtimeMs > cur.mtimeMs) bySlug.set(o.slug, o);
  }
  return Array.from(bySlug.values()).sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * 单次同步：一个 normalized CSV -> 一个 source YAML。
 * @param {string} inputPath - 归一化 CSV 绝对路径
 * @param {string} prefix - 输出文件名前缀，如 journals_ssci_sociology_q1
 * @param {{ allCategories?: boolean, category?: string }} options - allCategories=true 时不按 category 过滤
 * @returns {{ ok: boolean, outputPath: string, count: number }}
 */
function syncOne(inputPath, prefix, options = {}) {
  const { allCategories = false, category = null } = options;
  const effectiveCategory = allCategories ? null : (category ?? "SOCIOLOGY");

  ensureDir(OUT_DIR);
  const dateTag = getTodayYYYYMMDD();
  const version = getNextVersion(OUT_DIR, prefix, dateTag);
  const outputPath = path.join(OUT_DIR, `${prefix}_${dateTag}_v${version}.yml`);

  const csvText = fs.readFileSync(inputPath, "utf-8");
  const { header, rows } = toRowObjects(csvText);
  if (rows.length === 0) {
    console.error("[sync_ssci_q1q4] No data rows in:", inputPath);
    return { ok: false, outputPath, count: 0 };
  }

  const keys = detectKeys(header);
  for (const need of ["nameKey", "quartileKey", "editionKey"]) {
    if (!keys[need]) {
      console.error(`[sync_ssci_q1q4] Missing column: ${need} in ${inputPath}`);
      return { ok: false, outputPath, count: 0 };
    }
  }

  const filtered = rows.filter((r) => {
    const okEdition = isSSCI(r[keys.editionKey]);
    const okQuartile = isQ1toQ4(r[keys.quartileKey]);
    const okCategory =
      effectiveCategory && keys.categoryKey
        ? norm(r[keys.categoryKey]).toUpperCase() === effectiveCategory
        : true;
    return okEdition && okQuartile && okCategory;
  });

  const quartileNorm = (v) => {
    const t = norm(v).toUpperCase();
    if (/^Q[1-4]$/.test(t)) return t;
    if (/^[1-4]$/.test(t)) return `Q${t}`;
    return t || "";
  };

  let journals = filtered
    .map((r) => {
      const name = norm(r[keys.nameKey]);
      if (!name) return null;
      const issn = normIssn(keys.issnKey ? r[keys.issnKey] : "") || norm(keys.issnKey ? r[keys.issnKey] : "");
      const eissn = normIssn(keys.eissnKey ? r[keys.eissnKey] : "") || norm(keys.eissnKey ? r[keys.eissnKey] : "");
      const short = norm(keys.abbrevKey ? r[keys.abbrevKey] : "") || guessShort(name);
      const publisherRaw = keys.publisherKey ? r[keys.publisherKey] : "";
      const quartile = keys.quartileKey ? quartileNorm(r[keys.quartileKey]) : "";
      const jif = keys.jifKey ? norm(r[keys.jifKey]) : "";
      const jci = keys.jciKey ? norm(r[keys.jciKey]) : "";
      const oa_citable_pct = keys.oaKey ? norm(r[keys.oaKey]) : "";
      const total_citations = keys.totalCitationsKey ? norm(r[keys.totalCitationsKey]) : "";
      return {
        name,
        short,
        issn,
        eissn,
        site: "",
        notes: norm(publisherRaw) ? `WOS/JCR; ${norm(publisherRaw)}` : "WOS/JCR",
        ...(quartile ? { quartile } : {}),
        ...(jif ? { jif } : {}),
        ...(jci ? { jci } : {}),
        ...(oa_citable_pct ? { oa_citable_pct } : {}),
        ...(total_citations ? { total_citations } : {}),
      };
    })
    .filter(Boolean);

  journals = uniqByKey(journals, (j) => {
    const i = normIssn(j.issn);
    const e = normIssn(j.eissn);
    if (i) return `issn:${i}`;
    if (e) return `eissn:${e}`;
    return `name:${norm(j.name).toLowerCase()}`;
  });
  journals.sort((a, b) => a.name.localeCompare(b.name));

  const payload = {
    meta: {
      source: "WOS/JCR",
      dataset: effectiveCategory ? `SSCI ${effectiveCategory.charAt(0) + effectiveCategory.slice(1).toLowerCase()}` : "SSCI",
      filter: {
        edition: "SSCI",
        quartile: "Q1-Q4",
        ...(effectiveCategory ? { category: effectiveCategory } : {}),
      },
      input: path.relative(ROOT, inputPath).replaceAll("\\", "/"),
      generated_at: new Date().toISOString(),
      date_tag: dateTag,
      version,
      count_filtered_rows: filtered.length,
      count_unique_journals: journals.length,
      detected_columns: keys,
    },
    journals,
  };

  fs.writeFileSync(outputPath, YAML.stringify(payload), "utf-8");
  console.log("[sync_ssci_q1q4]", path.relative(ROOT, inputPath), "->", path.relative(ROOT, outputPath), "|", journals.length, "journals");
  return { ok: true, outputPath, count: journals.length };
}

function runMerge() {
  const r = spawnSync(process.execPath, [MERGE_SCRIPT], { cwd: ROOT, stdio: "inherit", shell: false });
  return r.status === 0;
}

function parseArgv() {
  const args = process.argv.slice(2);
  const out = {
    input: null,
    prefix: null,
    category: undefined,
    allCategories: false,
    all: false,
    noMerge: false,
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--input" && args[i + 1]) {
      out.input = args[++i];
    } else if (args[i] === "--prefix" && args[i + 1]) {
      out.prefix = args[++i];
    } else if (args[i] === "--category" && args[i + 1]) {
      out.category = args[++i].trim().toUpperCase();
    } else if (args[i] === "--all-categories") {
      out.allCategories = true;
    } else if (args[i] === "--all") {
      out.all = true;
    } else if (args[i] === "--no-merge") {
      out.noMerge = true;
    }
  }
  return out;
}

function main() {
  const argv = parseArgv();

  // 单学科：仅当显式传入 --input 时
  if (argv.input != null) {
    const inputPath = path.isAbsolute(argv.input) ? argv.input : path.join(ROOT, argv.input);
    if (!fs.existsSync(inputPath)) {
      console.error("[sync_ssci_q1q4] INPUT not found:", inputPath);
      process.exit(1);
    }
    let prefix = argv.prefix;
    if (!prefix) {
      const base = path.basename(inputPath);
      const m = base.match(NORMALIZED_RE);
      prefix = m && m[1] ? slugToPrefix(m[1]) : DEFAULT_PREFIX;
    }
    const result = syncOne(inputPath, prefix, {
      allCategories: argv.allCategories,
      category: argv.category,
    });
    process.exit(result.ok ? 0 : 1);
  }

  // 多学科
  const latest = getLatestNormalizedPerSlug();
  if (latest.length === 0) {
    console.error("[sync_ssci_q1q4] No normalized CSVs in", NORMALIZED_DIR);
    process.exit(1);
  }

  console.log("[sync_ssci_q1q4] Disciplines (latest per slug):", latest.length);
  let ok = 0;
  let fail = 0;
  for (const { file, slug, fullPath } of latest) {
    const prefix = slugToPrefix(slug);
    console.log("[sync_ssci_q1q4] Sync", slug, "->", prefix);
    const result = syncOne(fullPath, prefix, { allCategories: true });
    if (result.ok) ok++;
    else {
      fail++;
      console.error("[sync_ssci_q1q4] Failed:", slug);
    }
  }

  console.log("[sync_ssci_q1q4] Sync done: ok=" + ok + " fail=" + fail);
  if (fail > 0) process.exit(1);

  if (!argv.noMerge && fs.existsSync(MERGE_SCRIPT)) {
    console.log("[sync_ssci_q1q4] Running merge...");
    if (!runMerge()) {
      console.error("[sync_ssci_q1q4] Merge failed.");
      process.exit(1);
    }
    console.log("[sync_ssci_q1q4] Merge done. journals.yml updated.");
  } else if (argv.noMerge) {
    console.log("[sync_ssci_q1q4] Skipping merge (--no-merge).");
  }
}

main();
