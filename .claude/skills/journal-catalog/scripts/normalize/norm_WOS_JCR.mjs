/**
 * WOS_JCR_normalize.mjs
 *
 * Purpose:
 *   Normalize a JCR "Categories -> <Category>" export CSV (e.g., Sociology)
 *   into a clean, stable schema for long-term Q1/Q2 filtering and enrichment.
 *
 * Key features (not "dead" / hard-coded):
 *   - Auto-detects Selected JCR Year / Category / Schema from metadata (if present)
 *   - Auto-finds the real header row (works even if Clarivate adds preface rows)
 *   - Auto-detects the "<YEAR> JIF" and "<YEAR> JCI" column names via regex
 *   - Cleans messy numeric fields (thousands separators, %, N/A)
 *   - Drops trailing copyright / terms lines
 *
 * Usage:
 *   node jcr_normalize.mjs <input_raw_csv> [output_normalized_csv]
 *
 * Examples:
 *   node .claude/skills/journal-catalog/scripts/jcr_normalize.mjs \
 *     .claude/skills/journal-catalog/assets/jcr/raw/JCR_Categories_260217_Sociology.csv \
 *     .claude/skills/journal-catalog/assets/jcr/normalized/jcr_wos_sociology.csv
 *
 * Output schema (columns):
 *   jcr_year, schema, category, edition,
 *   journal_name, jcr_abbrev, publisher,
 *   issn_print, issn_e,
 *   total_citations, jif, quartile, jci, oa_citable_pct
 */

import fs from "node:fs";
import path from "node:path";

function die(msg, code = 1) {
  console.error(`[WOS_JCR_normalize.mjs] ERROR: ${msg}`);
  process.exit(code);
}

// Minimal CSV line splitter that respects quotes and escaped quotes ("")
function splitCSVLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      const next = line[i + 1];
      if (inQ && next === '"') {
        // Escaped quote
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function stripQuotes(s) {
  if (s == null) return "";
  let t = String(s).trim();
  if (t.startsWith('"') && t.endsWith('"')) t = t.slice(1, -1);
  return t.trim();
}

function normalizeNA(s) {
  const t = stripQuotes(s);
  if (!t) return "";
  if (t.toUpperCase() === "N/A") return "";
  return t;
}

function toIntOrEmpty(s) {
  const t = normalizeNA(s).replace(/,/g, "").trim();
  if (!t) return "";
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? String(n) : "";
}

function toFloatOrEmpty(s) {
  const t = normalizeNA(s).replace(/,/g, "").trim();
  if (!t) return "";
  const n = parseFloat(t);
  return Number.isFinite(n) ? String(n) : "";
}

function toPctOrEmpty(s) {
  // Handles:  "62.65"%   or 62.65% or "62.65"%,
  let t = stripQuotes(s).trim();
  if (!t) return "";
  if (t.toUpperCase() === "N/A") return "";
  t = t.replace(/%/g, "").replace(/,/g, "").trim();
  const n = parseFloat(t);
  return Number.isFinite(n) ? String(n) : "";
}

function csvEscape(s) {
  const t = s ?? "";
  // Quote if contains comma, quote, or newline
  if (/[",\n\r]/.test(t)) return `"${String(t).replace(/"/g, '""')}"`;
  return String(t);
}

function isJunkLine(line) {
  const t = (line || "").trim();
  if (!t) return true;
  // JCR exports often include these footer lines
  if (/^Copyright\s*\(c\)/i.test(t)) return true;
  if (/^By exporting/i.test(t)) return true;
  return false;
}

function preprocessJcrRaw(text) {
    let t = String(text ?? "");
  
    // 统一换行
    t = t.replace(/\r\n/g, "\n");
  
    // 修复： "62.65"%  -> "62.65%"
    // 兼容整数/小数
    t = t.replace(/"(\d+(?:\.\d+)?)"%/g, '"$1%"');
  
    // 去掉行尾多余逗号： ...,"62.65%",   -> ...,"62.65%"
    // 仅删除“行尾最后一个字段为空”的那种尾逗号
    t = t.replace(/,\s*$/gm, "");
  
    return t;
}  

function parseMetaFromHead(lines) {
  // Search in first ~40 lines for metadata-style strings
  const head = lines.slice(0, 40).join(" ");

  const yearStr =
    head.match(/Selected\s+JCR\s+Year:\s*(\d{4})/i)?.[1] ||
    head.match(/\b(\d{4})\s+JCR\b/i)?.[1] ||
    null;

  const schema =
    head.match(/Selected\s+Category\s+Schema:\s*([A-Za-z0-9_-]+)/i)?.[1] || null;

  // "Selected Categories: SOCIOLOGY" OR could include multiple separated by ; , etc.
  const catRaw =
    head.match(/Selected\s+Categories:\s*([A-Za-z0-9&\-; ,]+)/i)?.[1] || null;

  const category = catRaw ? catRaw.split(/[;,]/)[0].trim() : null;

  return {
    year: yearStr ? parseInt(yearStr, 10) : null,
    schema: schema ? schema.trim() : null,
    category: category ? category.trim() : null,
  };
}

function findHeaderRowIndex(lines) {
  // Find the first row that looks like the actual CSV header
  // It should contain "Journal name" and something about JIF/Quartile.
  const maxScan = Math.min(lines.length, 300);
  for (let i = 0; i < maxScan; i++) {
    const t = lines[i] || "";
    if (t.includes("Journal name") && (t.includes("JIF") || t.includes("Quartile"))) {
      return i;
    }
  }
  // Fallback: assume first line is header
  return 0;
}

function buildIndexMap(headerArr) {
  const idx = new Map();
  headerArr.forEach((h, i) => idx.set(h, i));
  return idx;
}

function findYearlyMetricColumn(headerArr, metricSuffix /* "JIF"|"JCI" */) {
  // Matches "2024 JIF", "2025 JIF", ...
  const re = new RegExp(`^\\s*(\\d{4})\\s+${metricSuffix}\\s*$`, "i");
  for (let i = 0; i < headerArr.length; i++) {
    if (re.test(headerArr[i])) return i;
  }
  return -1;
}

function inferYearFromHeader(headerArr, jifIdx) {
  if (jifIdx < 0) return null;
  const m = headerArr[jifIdx].match(/(\d{4})\s+JIF/i);
  return m ? parseInt(m[1], 10) : null;
}

function main() {
 const infile = process.argv[2];
 const debugClean = process.argv.includes("--debug-clean");
  
 // 第 3 个位置以后：找第一个不是 flag 的参数当作 outfile
 const outfileArg = process.argv
      .slice(3)
      .find((arg) => arg && !arg.startsWith("--"));
  
  if (!infile) {
      die("Usage: node jcr_normalize.mjs <input_raw_csv> [output_normalized_csv] [--debug-clean]");
    }
    if (!fs.existsSync(infile)) {
      die(`Input file not found: ${infile}`);
    }

  const rawText = fs.readFileSync(infile, "utf-8");
  const text = preprocessJcrRaw(rawText);
  const rawLines = text.split("\n");

  if (debugClean) {
    const debugPath = path.join(
      path.dirname(infile),
      path.basename(infile, path.extname(infile)) + "_cleaned_debug.csv"
    );
    fs.writeFileSync(debugPath, text, "utf-8");
    console.log(`[debug] Cleaned raw written to: ${debugPath}`);
  }


  // Keep metadata lines for parsing meta, but we will find header row robustly.
  // Also remove hard footer junk lines early (copyright / terms) to avoid false parsing.
  const lines = rawLines.filter((l) => !isJunkLine(l));

  // Auto metadata
  const meta = parseMetaFromHead(lines);

  // Header row
  const headerRow = findHeaderRowIndex(lines);
  const header = splitCSVLine(lines[headerRow]).map(stripQuotes);

  const idx = buildIndexMap(header);

  // Core columns that should exist
  const requiredBase = [
    "Journal name",
    "JCR Abbreviation",
    "Publisher",
    "ISSN",
    "eISSN",
    "Category",
    "Edition",
    "Total Citations",
    "JIF Quartile",
    "% of Citable OA",
  ];

  for (const col of requiredBase) {
    if (!idx.has(col)) {
      die(
        `Missing required column "${col}". ` +
          `You may have exported a different JCR view than Categories->Category.`
      );
    }
  }

  // Dynamically resolve the year-specific metrics
  const jifIdx = findYearlyMetricColumn(header, "JIF");
  const jciIdx = findYearlyMetricColumn(header, "JCI");
  if (jifIdx < 0) die(`Cannot find "<YEAR> JIF" column in header.`);
  if (jciIdx < 0) die(`Cannot find "<YEAR> JCI" column in header.`);

  // Determine year/schema/category
  let jcrYear = meta.year ?? inferYearFromHeader(header, jifIdx);
  if (!jcrYear) {
    // As a last resort, parse from the actual column name "2024 JIF"
    jcrYear = inferYearFromHeader(header, jifIdx);
  }
  if (!jcrYear) die("Cannot determine JCR year from metadata or header.");

  const schema = meta.schema ?? "WOS";
  const defaultCategory = meta.category ?? "";

  const outHeader = [
    "jcr_year",
    "schema",
    "category",
    "edition",
    "journal_name",
    "jcr_abbrev",
    "publisher",
    "issn_print",
    "issn_e",
    "total_citations",
    "jif",
    "quartile",
    "jci",
    "oa_citable_pct",
  ];

  const outRows = [outHeader.join(",")];

  // Data rows start after headerRow
  for (let r = headerRow + 1; r < lines.length; r++) {
    const line = lines[r];
    if (!line || !line.trim()) continue;

    // Some exports can include blank spacer lines; skip
    // If the line doesn't contain commas, it's not a data row
    if (!line.includes(",")) continue;

    const cols = splitCSVLine(line);

    // Minimal guard: require Journal name cell exists
    const journalName = normalizeNA(cols[idx.get("Journal name")] ?? "");
    if (!journalName) continue;

    const category = normalizeNA(cols[idx.get("Category")] ?? "") || defaultCategory;
    const edition = normalizeNA(cols[idx.get("Edition")] ?? "");
    const quartile = normalizeNA(cols[idx.get("JIF Quartile")] ?? "");

    const rec = {
      jcr_year: String(jcrYear),
      schema,
      category,
      edition,
      journal_name: journalName,
      jcr_abbrev: normalizeNA(cols[idx.get("JCR Abbreviation")] ?? ""),
      publisher: normalizeNA(cols[idx.get("Publisher")] ?? ""),
      issn_print: normalizeNA(cols[idx.get("ISSN")] ?? ""),
      issn_e: normalizeNA(cols[idx.get("eISSN")] ?? ""),
      total_citations: toIntOrEmpty(cols[idx.get("Total Citations")] ?? ""),
      jif: toFloatOrEmpty(cols[jifIdx] ?? ""),
      quartile: quartile,
      jci: toFloatOrEmpty(cols[jciIdx] ?? ""),
      oa_citable_pct: toPctOrEmpty(cols[idx.get("% of Citable OA")] ?? ""),
    };

    // Normalize "N/A" ISSN/eISSN to empty
    if (rec.issn_print.toUpperCase() === "N/A") rec.issn_print = "";
    if (rec.issn_e.toUpperCase() === "N/A") rec.issn_e = "";

    const out = [
      rec.jcr_year,
      rec.schema,
      rec.category,
      rec.edition,
      csvEscape(rec.journal_name),
      csvEscape(rec.jcr_abbrev),
      csvEscape(rec.publisher),
      rec.issn_print,
      rec.issn_e,
      rec.total_citations,
      rec.jif,
      rec.quartile,
      rec.jci,
      rec.oa_citable_pct,
    ].join(",");

    outRows.push(out);
  }

  if (outRows.length <= 1) {
    die("No data rows parsed. Please verify the exported file contains journal rows.");
  }

  // Default output if not provided
  function todayYYMMDD() {
    const d = new Date();
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yy}${mm}${dd}`;
  }
  
  const infileBase = path.basename(infile, path.extname(infile));
  const autoName = `${infileBase}_${todayYYMMDD()}_normalized.csv`;
  
  const normalizeDir = path.resolve(
    path.dirname(infile), // .../assets/01_raw
    "..",                 // .../assets
    "02_normalize"
  );
  
  const outfile =
    outfileArg ||
    path.join(normalizeDir, autoName);  
  
  fs.mkdirSync(path.dirname(outfile), { recursive: true });
  fs.writeFileSync(outfile, outRows.join("\n"), "utf-8");

  console.log(
    `[jcr_normalize] OK: Parsed ${outRows.length - 1} rows | ` +
      `Detected year=${jcrYear} schema=${schema} category=${defaultCategory || "(varies by row)"}`
  );
  console.log(`[jcr_normalize] Wrote: ${path.resolve(outfile)}`);
}

main();