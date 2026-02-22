import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

// =====================
// CONFIG
// =====================
const ROOT = process.cwd();
const REF_DIR = path.join(ROOT, ".claude/skills/journal-catalog/references");

const DIR_BASE = path.join(REF_DIR, "base");
const DIR_MANUAL = path.join(REF_DIR, "manual");
const DIR_SOURCES = path.join(REF_DIR, "sources");

// ✅ 输出到 system/
const DIR_SYSTEM = path.join(REF_DIR, "system");

const OUT_CANON = path.join(DIR_SYSTEM, "journals.yml");
const OUT_DIR = DIR_SYSTEM; // snapshots stored in system/

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

function getNextVersion(dir, dateTag) {
  ensureDir(dir);
  const files = fs.readdirSync(dir);
  const pattern = new RegExp(`^journals_merged_${escapeRegExp(dateTag)}_v(\\d+)\\.yml$`);
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

function readYamlFile(fp) {
  const txt = fs.readFileSync(fp, "utf8");
  const data = YAML.parse(txt);
  return data;
}

function listYamlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(f => f.toLowerCase().endsWith(".yml") || f.toLowerCase().endsWith(".yaml"))
    .map(f => path.join(dir, f));
}

// Normalize ISSN to 8-char (digits/X) without hyphen for matching
function normIssn(s) {
  const t = norm(s).toUpperCase().replace(/[^0-9X]/g, "");
  return t;
}

// Prefer a stable key: issn > eissn > name
function journalKey(j) {
  const i = normIssn(j.issn);
  const e = normIssn(j.eissn);
  const n = norm(j.name).toLowerCase();
  if (i) return `issn:${i}`;
  if (e) return `eissn:${e}`;
  return `name:${n}`;
}

function cleanJournal(j) {
  // keep only expected fields; preserve extra if you want later
  return {
    name: norm(j.name),
    short: norm(j.short),
    issn: normIssn(j.issn) || "",
    eissn: normIssn(j.eissn) || "",
    site: norm(j.site),
    notes: norm(j.notes),
    openalex_source_id: norm(j.openalex_source_id),
    openalex_source_display_name: norm(j.openalex_source_display_name),
  };
}

// Merge rule: later overrides earlier ONLY when later has non-empty value
function mergeOne(base, incoming) {
  const out = { ...base };
  for (const [k, v] of Object.entries(incoming)) {
    const vv = typeof v === "string" ? norm(v) : v;
    if (vv === "" || vv == null) continue;
    out[k] = vv;
  }
  return out;
}

// =====================
// SOURCES: pick latest per prefix
// e.g. journals_ssci_sociology_q1_20260219_v2.yml
// prefix: journals_ssci_sociology_q1
// =====================
function parseVersionedFilename(fp) {
  const f = path.basename(fp);
  const m = f.match(/^(.*)_(\d{8})_v(\d+)\.ya?ml$/i);
  if (!m) return null;
  return {
    prefix: m[1],
    dateTag: m[2],
    version: parseInt(m[3], 10),
    file: fp,
  };
}

function pickLatestPerPrefix(files) {
  const map = new Map(); // prefix -> best {dateTag, version, file}
  for (const fp of files) {
    const meta = parseVersionedFilename(fp);
    if (!meta) continue;
    const cur = map.get(meta.prefix);
    if (!cur) {
      map.set(meta.prefix, meta);
      continue;
    }
    // compare dateTag then version
    if (meta.dateTag > cur.dateTag) map.set(meta.prefix, meta);
    else if (meta.dateTag === cur.dateTag && meta.version > cur.version) map.set(meta.prefix, meta);
  }
  return Array.from(map.values()).sort((a, b) => a.prefix.localeCompare(b.prefix));
}

function extractJournals(yamlObj) {
  if (!yamlObj) return [];
  if (Array.isArray(yamlObj.journals)) return yamlObj.journals;
  if (Array.isArray(yamlObj)) return yamlObj;
  return [];
}

// =====================
// MAIN
// =====================
async function main() {
  ensureDir(OUT_DIR);

  // 1) load base/manual all yml
  const baseFiles = listYamlFiles(DIR_BASE);
  const manualFiles = listYamlFiles(DIR_MANUAL);

  // 2) sources: only pick latest per prefix
  const sourceFilesAll = listYamlFiles(DIR_SOURCES);
  const sourcePicked = pickLatestPerPrefix(sourceFilesAll);
  const sourceFiles = sourcePicked.map(x => x.file);

  // read and collect journals
  const inputs = [];

  function loadFiles(label, files) {
    const out = [];
    for (const fp of files) {
      const obj = readYamlFile(fp);
      const js = extractJournals(obj).map(cleanJournal).filter(x => x.name);
      out.push(...js);
      inputs.push({ label, file: path.relative(ROOT, fp).replaceAll("\\", "/"), count: js.length });
    }
    return out;
  }

  // precedence: base < sources < manual
  const baseJ = loadFiles("base", baseFiles);
  const sourceJ = loadFiles("sources(latest-per-prefix)", sourceFiles);
  const manualJ = loadFiles("manual", manualFiles);

  // merge
  const merged = new Map(); // key -> journal
  const seenNameToKey = new Map(); // helps align name-only with later ISSN

  function upsert(list, tier) {
    for (const j of list) {
      const k = journalKey(j);

      // If a name-only entry existed earlier and now we have ISSN, migrate it
      if (k.startsWith("issn:") || k.startsWith("eissn:")) {
        const nk = `name:${norm(j.name).toLowerCase()}`;
        const oldKey = seenNameToKey.get(nk);
        if (oldKey && oldKey !== k && merged.has(oldKey) && !merged.has(k)) {
          merged.set(k, merged.get(oldKey));
          merged.delete(oldKey);
          seenNameToKey.set(nk, k);
        }
      }

      const prev = merged.get(k);
      if (!prev) {
        merged.set(k, j);
        seenNameToKey.set(`name:${norm(j.name).toLowerCase()}`, k);
      } else {
        merged.set(k, mergeOne(prev, j));
      }
    }
  }

  upsert(baseJ, "base");
  upsert(sourceJ, "sources");
  upsert(manualJ, "manual");

  // finalize array, sort
  const journals = Array.from(merged.values())
    .map(j => {
      // ensure minimal fields
      if (!j.short) j.short = "";
      if (!j.site) j.site = "";
      if (!j.notes) j.notes = "";
      return j;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // write outputs
  const dateTag = getTodayYYYYMMDD();
  const v = getNextVersion(OUT_DIR, dateTag);
  const versionedPath = path.join(
    OUT_DIR,
    `journals_merged_${dateTag}_v${v}.yml`
  );

  const payload = {
    meta: {
      generated_at: new Date().toISOString(),
      date_tag: dateTag,
      version: v,
      counts: {
        base_rows: baseJ.length,
        sources_rows: sourceJ.length,
        manual_rows: manualJ.length,
        merged_unique: journals.length,
      },
      inputs,
      notes: "Merge precedence: base < sources < manual. Non-empty fields override.",
    },
    journals,
  };

  fs.writeFileSync(OUT_CANON, YAML.stringify(payload), "utf8");
  fs.writeFileSync(versionedPath, YAML.stringify(payload), "utf8");

  console.log("[merge_journals] base files =", baseFiles.length);
  console.log("[merge_journals] source files picked =", sourceFiles.length);
  console.log("[merge_journals] manual files =", manualFiles.length);
  console.log("[merge_journals] merged unique journals =", journals.length);
  console.log("[merge_journals] wrote canonical =", path.relative(ROOT, OUT_CANON));
  console.log("[merge_journals] wrote snapshot  =", path.relative(ROOT, versionedPath));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
