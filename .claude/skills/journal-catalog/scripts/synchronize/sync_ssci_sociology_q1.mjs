// .claude/skills/journal-catalog/scripts/synchronize/sync_ssci_sociology_q1.mjs
//
// Reads normalized WOS/JCR Sociology CSV with headers like:
// jcr_year,schema,category,edition,journal_name,jcr_abbrev,publisher,issn_print,issn_e,...,quartile,...
//
// Outputs versioned YAML into:
// references/sources/journals_ssci_sociology_q1_YYYYMMDD_vN.yml
//
// Filters:
// - edition == "SSCI"
// - quartile == "Q1" (also tolerates "1", "Q1 (Top ...)" etc.)
// (Optional) category == "SOCIOLOGY" (kept ON by default for safety)

import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

// =====================
// CONFIG
// =====================
const ROOT = process.cwd();

// Leave empty to auto-pick latest *_normalized.csv in assets/02_normalize
const INPUT_EXPLICIT = "";

const NORMALIZED_DIR = path.join(
  ROOT,
  ".claude/skills/journal-catalog/assets/02_normalize"
);

const OUT_DIR = path.join(
  ROOT,
  ".claude/skills/journal-catalog/references/sources"
);

const PREFIX = "journals_ssci_sociology_q1";

// Turn off if you are 100% sure the file already contains only SOCIOLOGY
const REQUIRE_CATEGORY_SOCIOLOGY = true;

// =====================
// HELPERS
// =====================
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
  const pattern = new RegExp(
    `^${escapeRegExp(prefix)}_${escapeRegExp(dateTag)}_v(\\d+)\\.yml$`
  );

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

// Crude acronym if abbrev missing
function guessShort(name) {
  const words = norm(name)
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const stop = new Set(["OF", "THE", "AND", "A", "AN", "IN", "ON", "FOR", "TO"]);
  const letters = words
    .map(w => w.toUpperCase())
    .filter(w => !stop.has(w))
    .slice(0, 6)
    .map(w => w[0])
    .join("");

  return letters.length >= 2 ? letters : "";
}

// CSV parser (handles quotes)
function parseCSV(text) {
  // handle UTF-8 BOM
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
  const table = parseCSV(csvText).filter(r => r.some(x => norm(x) !== ""));
  if (table.length < 2) return { header: [], rows: [] };

  const header = table[0].map(h => norm(h));
  const rows = [];
  for (let r = 1; r < table.length; r++) {
    const line = table[r];
    const obj = {};
    for (let c = 0; c < header.length; c++) obj[header[c]] = line[c] ?? "";
    rows.push(obj);
  }
  return { header, rows };
}

function autoPickLatestNormalizedCsv(dir) {
  if (!fs.existsSync(dir)) return "";
  const files = fs
    .readdirSync(dir)
    .filter(f => f.toLowerCase().endsWith("_normalized.csv"))
    .map(f => path.join(dir, f));
  if (files.length === 0) return "";
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0];
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

// =====================
// KEY DETECTION (tailored to your header)
// =====================
function detectKeys(header) {
  const lower = header.map(h => h.toLowerCase());
  const get = (k) => {
    const idx = lower.indexOf(k.toLowerCase());
    return idx >= 0 ? header[idx] : "";
  };

  // exact matches for your schema
  const nameKey = get("journal_name") || get("Journal name") || get("Journal");
  const abbrevKey = get("jcr_abbrev") || get("abbrev") || get("short");
  const publisherKey = get("publisher");
  const issnKey = get("issn_print") || get("issn") || get("print_issn");
  const eissnKey = get("issn_e") || get("eissn") || get("issn_online") || get("online_issn");
  const quartileKey = get("quartile") || get("jif_quartile") || get("jcr_quartile");
  const editionKey = get("edition");
  const categoryKey = get("category");
  const yearKey = get("jcr_year");

  return { nameKey, abbrevKey, publisherKey, issnKey, eissnKey, quartileKey, editionKey, categoryKey, yearKey };
}

function isQ1(v) {
  const t = norm(v).toUpperCase();
  return t === "Q1" || t === "1" || t.startsWith("Q1");
}

function isSSCI(v) {
  return norm(v).toUpperCase() === "SSCI";
}

function isSociology(v) {
  return norm(v).toUpperCase() === "SOCIOLOGY";
}

// =====================
// MAIN
// =====================
const inputPath = INPUT_EXPLICIT
  ? path.join(ROOT, INPUT_EXPLICIT)
  : autoPickLatestNormalizedCsv(NORMALIZED_DIR);

if (!inputPath || !fs.existsSync(inputPath)) {
  console.error("[sync_ssci_sociology_q1] INPUT not found.");
  console.error("  - Set INPUT_EXPLICIT in the script, OR");
  console.error("  - Ensure there is a *_normalized.csv in:", NORMALIZED_DIR);
  process.exit(1);
}

ensureDir(OUT_DIR);

const DATE_TAG = getTodayYYYYMMDD();
const VERSION = getNextVersion(OUT_DIR, PREFIX, DATE_TAG);
const outputPath = path.join(OUT_DIR, `${PREFIX}_${DATE_TAG}_v${VERSION}.yml`);

const csvText = fs.readFileSync(inputPath, "utf-8");
const { header, rows } = toRowObjects(csvText);

if (rows.length === 0) {
  console.error("[sync_ssci_sociology_q1] No data rows parsed from:", inputPath);
  process.exit(1);
}

const keys = detectKeys(header);

for (const need of ["nameKey", "quartileKey", "editionKey"]) {
  if (!keys[need]) {
    console.error(`[sync_ssci_sociology_q1] Missing required column: ${need}`);
    console.error("[sync_ssci_sociology_q1] Detected keys:", keys);
    console.error("[sync_ssci_sociology_q1] CSV headers:", header);
    process.exit(1);
  }
}

// Filter rows: SSCI + Q1 (+ optionally SOCIOLOGY)
const filtered = rows.filter(r => {
  const okEdition = isSSCI(r[keys.editionKey]);
  const okQuartile = isQ1(r[keys.quartileKey]);
  const okCategory = REQUIRE_CATEGORY_SOCIOLOGY && keys.categoryKey
    ? isSociology(r[keys.categoryKey])
    : true;
  return okEdition && okQuartile && okCategory;
});

let journals = filtered
  .map(r => {
    const name = norm(r[keys.nameKey]);
    if (!name) return null;

    const issnRaw = keys.issnKey ? r[keys.issnKey] : "";
    const eissnRaw = keys.eissnKey ? r[keys.eissnKey] : "";
    const publisherRaw = keys.publisherKey ? r[keys.publisherKey] : "";
    const abbrevRaw = keys.abbrevKey ? r[keys.abbrevKey] : "";

    const issn = normIssn(issnRaw) || norm(issnRaw);
    const eissn = normIssn(eissnRaw) || norm(eissnRaw);
    const short = norm(abbrevRaw) || guessShort(name);

    // 你当前表头没有 site；先留空，后续可用 resolve_sources 或手工补
    return {
      name,
      short,
      issn,
      eissn,
      site: "",
      notes: norm(publisherRaw) ? `WOS/JCR; ${norm(publisherRaw)}` : "WOS/JCR"
    };
  })
  .filter(Boolean);

// De-dup
journals = uniqByKey(journals, j => {
  const i = normIssn(j.issn);
  const e = normIssn(j.eissn);
  if (i) return `issn:${i}`;
  if (e) return `eissn:${e}`;
  return `name:${norm(j.name).toLowerCase()}`;
});

// Stable sort
journals.sort((a, b) => a.name.localeCompare(b.name));

const payload = {
  meta: {
    source: "WOS/JCR",
    dataset: "SSCI Sociology",
    filter: {
      edition: "SSCI",
      quartile: "Q1",
      ...(REQUIRE_CATEGORY_SOCIOLOGY ? { category: "SOCIOLOGY" } : {})
    },
    input: path.relative(ROOT, inputPath).replaceAll("\\", "/"),
    generated_at: new Date().toISOString(),
    date_tag: DATE_TAG,
    version: VERSION,
    count_filtered_rows: filtered.length,
    count_unique_journals: journals.length,
    detected_columns: keys
  },
  journals
};

fs.writeFileSync(outputPath, YAML.stringify(payload), "utf-8");

console.log("[sync_ssci_sociology_q1] input =", path.relative(ROOT, inputPath));
console.log("[sync_ssci_sociology_q1] filter edition=SSCI quartile=Q1",
  REQUIRE_CATEGORY_SOCIOLOGY ? "category=SOCIOLOGY" : "");
console.log("[sync_ssci_sociology_q1] filtered rows =", filtered.length);
console.log("[sync_ssci_sociology_q1] unique journals =", journals.length);
console.log("[sync_ssci_sociology_q1] wrote =", path.relative(ROOT, outputPath));
