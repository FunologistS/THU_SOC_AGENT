#!/usr/bin/env node
/**
 * export-to-md.mjs
 *
 * Subcommands:
 *   1) journals : references/journals.yml -> outputs/system/journal-catalog/journals_YYYY-MM-DD_vN.md + journals_latest.md
 *   2) jcr      : normalized JCR CSV -> outputs/system/journal-catalog/*_report_vN.md (Markdown)
 *
 * Usage:
 *   node .claude/skills/journal-catalog/scripts/export-to-md.mjs journals
 *
 *   node .claude/skills/journal-catalog/scripts/export-to-md.mjs jcr [normalized_csv] [out_md]
 *     [--edition SSCI|ESCI] [--only-q Q1,Q2] [--group quartile] [--sort jif] [--desc|--asc] [--limit N]
 *
 * Notes:
 *   - If normalized_csv is omitted, will auto-pick the latest *.csv under assets/02_normalize/
 *   - Default output dir: outputs/system/journal-catalog/
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

function die(msg, code = 1) {
  console.error(`[export-to-md] ERROR: ${msg}`);
  process.exit(code);
}

// --- dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- project root & default outputs
const projectRoot = process.cwd();
const outputDir = path.join(projectRoot, "outputs", "system", "journal-catalog");

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function getToday() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function escapeCell(s) {
  return String(s ?? "").replace(/\|/g, "\\|");
}

// ---------- Versioning helpers ----------
function nextVersionFor(baseName, ext, dir) {
  ensureDir(dir);
  const files = fs.readdirSync(dir);
  const re = new RegExp(`^${escapeRegExp(baseName)}_v(\\d+)\\.${escapeRegExp(ext)}$`);
  let maxV = 0;
  for (const f of files) {
    const m = f.match(re);
    if (m) maxV = Math.max(maxV, parseInt(m[1], 10));
  }
  return maxV + 1;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------- CSV helpers ----------
function stripBOM(s) {
  return s?.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

// Minimal CSV splitter that respects quotes and escaped quotes ("")
function splitCSVLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (inQ && next === '"') {
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
  return t;
}

function toNumOrNaN(x) {
  const t = String(x ?? "").trim();
  if (!t) return NaN;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

function readNormalizedCSV(infile) {
  const raw = stripBOM(fs.readFileSync(infile, "utf-8"));
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) die("CSV has no data rows.");

  const header = splitCSVLine(lines[0]).map(stripQuotes);
  const rows = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = splitCSVLine(lines[r]);
    const obj = {};
    for (let i = 0; i < header.length; i++) obj[header[i]] = stripQuotes(cols[i] ?? "");
    rows.push(obj);
  }
  return rows;
}

function mdTable(rows, cols) {
  const head = `| ${cols.join(" | ")} |`;
  const sep = `| ${cols.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => {
    const line = cols.map((c) => escapeCell(r[c] ?? ""));
    return `| ${line.join(" | ")} |`;
  });
  return [head, sep, ...body].join("\n");
}

function groupBy(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const k = (r[key] || "UNSPECIFIED").toUpperCase();
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

// ---------- Auto-pick latest normalized csv ----------
function findLatestNormalizedCSV() {
  const dir = path.join(__dirname, "../assets/02_normalize");
  if (!fs.existsSync(dir)) die(`Normalize dir not found: ${dir}`);
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".csv"))
    .map((f) => path.join(dir, f));

  if (!files.length) die(`No normalized CSV found under: ${dir}`);

  // pick newest by mtime
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0];
}

// ---------- Arg parsing (jcr) ----------
function parseJcrArgs(argv) {
  // argv excludes: node, script, "jcr"
  // Strategy:
  //   - First collect flags
  //   - Then remaining positional args => [infile, out?]
  const flags = {
    group: "quartile",
    sort: "jif",
    desc: true,
    limit: null,
    edition: null,     // SSCI / ESCI
    onlyQ: null,       // Set(["Q1","Q2"])
  };

  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];

    const take = () => {
      if (next == null) die(`Missing value after ${a}`);
      i++;
      return next;
    };

    if (a === "--group") flags.group = take();
    else if (a === "--sort") flags.sort = take();
    else if (a === "--desc") flags.desc = true;
    else if (a === "--asc") flags.desc = false;
    else if (a === "--limit") {
      const v = parseInt(take(), 10);
      if (!Number.isFinite(v) || v <= 0) die(`--limit must be a positive integer, got: ${v}`);
      flags.limit = v;
    } else if (a === "--edition") {
      const v = String(take()).toUpperCase();
      if (!["SSCI", "ESCI"].includes(v)) die(`--edition must be SSCI or ESCI, got: ${v}`);
      flags.edition = v;
    } else if (a === "--only-q") {
      const raw = String(take())
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      const ok = new Set(["Q1", "Q2", "Q3", "Q4"]);
      for (const q of raw) if (!ok.has(q)) die(`--only-q invalid quartile: ${q}`);
      flags.onlyQ = new Set(raw);
    } else if (a.startsWith("--")) {
      die(`Unknown flag: ${a}`);
    } else {
      positionals.push(a);
    }
  }

  // If infile omitted, we auto-pick latest later
  const infile = positionals[0] || null;
  const out = positionals[1] || null;

  return { infile, out, ...flags };
}

// ---------- Subcommand: journals ----------
function exportJournals() {
  const inputPath = path.join(__dirname, "../references/journals.yml");
  if (!fs.existsSync(inputPath)) die(`journals.yml not found: ${inputPath}`);

  const data = yaml.load(fs.readFileSync(inputPath, "utf8"));
  const journals = data?.journals || [];

  const header = "| short | name | issn | eissn | site | notes |";
  const sep = "|-------|------|------|--------|------|-------|";
  const rows = journals.map(
    (j) =>
      `| ${escapeCell(j.short)} | ${escapeCell(j.name)} | ${escapeCell(j.issn)} | ${escapeCell(
        j.eissn
      )} | ${escapeCell(j.site)} | ${escapeCell(j.notes)} |`
  );

  const table = [header, sep, ...rows].join("\n") + "\n";

  const today = getToday();
  const base = `journals_${today}`;
  const v = nextVersionFor(base, "md", outputDir);

  ensureDir(outputDir);

  const versionedFilename = `${base}_v${v}.md`;
  const latestFilename = `journals_latest.md`;

  fs.writeFileSync(path.join(outputDir, versionedFilename), table, "utf8");
  fs.writeFileSync(path.join(outputDir, latestFilename), table, "utf8");

  console.log(`✅ Written: ${path.join("outputs/system/journal-catalog", versionedFilename)}`);
  console.log(`🔁 Updated: ${path.join("outputs/system/journal-catalog", latestFilename)}`);
}

// ---------- Subcommand: jcr ----------
function exportJcrReport(argv) {
  const args = parseJcrArgs(argv);

  const infile = args.infile || findLatestNormalizedCSV();
  if (!fs.existsSync(infile)) die(`Input not found: ${infile}`);

  let rows = readNormalizedCSV(infile);
  if (!rows.length) die("No rows.");

  // filters
  if (args.edition) {
    rows = rows.filter((r) => String(r.edition || "").toUpperCase() === args.edition);
  }
  if (args.onlyQ) {
    rows = rows.filter((r) => args.onlyQ.has(String(r.quartile || "").toUpperCase()));
  }

  const meta = {
    jcr_year: rows[0]?.jcr_year || "",
    schema: rows[0]?.schema || "",
    category: rows[0]?.category || "",
  };

  const g = groupBy(rows, args.group);

  const order = ["Q1", "Q2", "Q3", "Q4", "UNSPECIFIED"];
  const keys = [...g.keys()].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  const cols = [
    "journal_name",
    "edition",
    "quartile",
    "jif",
    "jci",
    "total_citations",
    "oa_citable_pct",
    "publisher",
    "issn_print",
    "issn_e",
  ];

  const out = [];
  out.push(`# JCR Report\n`);
  out.push(`- **Year:** ${meta.jcr_year || "(unknown)"}`);
  out.push(`- **Schema:** ${meta.schema || "(unknown)"}`);
  out.push(`- **Category (row 1):** ${meta.category || "(unknown)"}`);
  out.push(`- **Rows (after filters):** ${rows.length}`);
  out.push(`- **Source:** \`${path.basename(infile)}\``);
  out.push(`- **Group:** \`${args.group}\``);
  out.push(`- **Sort:** \`${args.sort}\` (${args.desc ? "desc" : "asc"})`);
  out.push(`- **Limit per group:** ${args.limit ?? "(none)"}`);
  if (args.edition) out.push(`- **Edition filter:** \`${args.edition}\``);
  if (args.onlyQ) out.push(`- **Quartile filter:** \`${[...args.onlyQ].join(",")}\``);
  out.push("");

  for (const k of keys) {
    let part = g.get(k) || [];

    // sort
    const sortKey = args.sort;
    part.sort((a, b) => {
      const an = toNumOrNaN(a[sortKey]);
      const bn = toNumOrNaN(b[sortKey]);
      const ax = Number.isNaN(an) ? -Infinity : an;
      const bx = Number.isNaN(bn) ? -Infinity : bn;
      return ax - bx;
    });
    if (args.desc) part.reverse();

    // limit
    if (args.limit && args.limit > 0) part = part.slice(0, args.limit);

    out.push(`## ${k} (${part.length})\n`);
    out.push(mdTable(part, cols));
    out.push("");
  }

  // output path: default to outputs/system/journal-catalog/
  ensureDir(outputDir);

  const inBase = path.basename(infile, path.extname(infile));
  const baseReportName = `${inBase}_report`;
  let outPath = args.out
    ? path.resolve(args.out)
    : path.join(outputDir, `${baseReportName}.md`);

  // auto _vN unless user explicitly passes --overwrite style (not implemented) — safest
  if (!args.out) {
    const v = nextVersionFor(baseReportName, "md", outputDir);
    outPath = path.join(outputDir, `${baseReportName}_v${v}.md`);
  } else {
    // if user provided a path that already exists, still add _vN to avoid accidental overwrite
    if (fs.existsSync(outPath)) {
      const dir = path.dirname(outPath);
      const name = path.basename(outPath, ".md");
      const v = nextVersionFor(name, "md", dir);
      outPath = path.join(dir, `${name}_v${v}.md`);
    }
  }

  ensureDir(path.dirname(outPath));
  fs.writeFileSync(outPath, out.join("\n"), "utf-8");
  console.log(`✅ Written: ${outPath}`);
}

// ---------- Entry ----------
const [cmd, ...rest] = process.argv.slice(2);

if (!cmd || cmd === "journals") {
  exportJournals();
} else if (cmd === "jcr") {
  exportJcrReport(rest);
} else {
  die(`Unknown command: ${cmd}\nTry: journals | jcr`);
}
