import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

// =====================
// CONFIG
// =====================
const ROOT = process.cwd();
const REF_DIR = path.join(ROOT, ".claude/skills/journal-catalog/references");

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
  return {
    name: norm(j.name),
    short: norm(j.short),
    issn: normIssn(j.issn) || "",
    eissn: normIssn(j.eissn) || "",
    site: norm(j.site),
    notes: norm(j.notes),
    openalex_source_id: norm(j.openalex_source_id),
    openalex_source_display_name: norm(j.openalex_source_display_name),
    quartile: norm(j.quartile),
    jif: norm(j.jif),
    jci: norm(j.jci),
    oa_citable_pct: norm(j.oa_citable_pct),
    total_citations: norm(j.total_citations),
  };
}

// Merge rule: later overrides earlier ONLY when later has non-empty value
// source_categories: merge arrays and dedupe (incoming may have source_category single string)
function mergeOne(base, incoming) {
  const out = { ...base };
  for (const [k, v] of Object.entries(incoming)) {
    if (k === "source_category" || k === "source_categories") continue;
    const vv = typeof v === "string" ? norm(v) : v;
    if (vv === "" || vv == null) continue;
    out[k] = vv;
  }
  const prevCats = base.source_categories || [];
  const incCat = incoming.source_category;
  if (incCat) {
    out.source_categories = [...new Set([...prevCats, incCat])];
  } else if (prevCats.length) {
    out.source_categories = prevCats;
  }
  return out;
}

/** 从已有 journals.yml 按 ISSN/eissn 建索引，用于合并时保留 OpenAlex 与 site（避免重跑 merge 后丢失 4_resolve 结果） */
function loadExistingOpenalexIndex(canonPath) {
  const index = new Map(); // normIssn(issn) -> { openalex_source_id, openalex_source_display_name, site }
  if (!fs.existsSync(canonPath)) return index;
  try {
    const data = readYamlFile(canonPath);
    const list = extractJournals(data);
    for (const j of list) {
      const id = norm(j.openalex_source_id);
      const dn = norm(j.openalex_source_display_name);
      const site = norm(j.site);
      if (!id && !dn && !site) continue;
      const rec = { openalex_source_id: id, openalex_source_display_name: dn, site };
      const ni = normIssn(j.issn);
      const ne = normIssn(j.eissn);
      if (ni) index.set(`issn:${ni}`, rec);
      if (ne) index.set(`eissn:${ne}`, rec);
    }
  } catch (e) {
    console.warn("[merge_journals] Could not load existing journals.yml for OpenAlex preserve:", e?.message || e);
  }
  return index;
}

// =====================
// SOURCES: pick latest per prefix (canonical prefix = 同学科只保留一份，避免 area_and_asian_studies 与 area_asian_studies 重复)
// e.g. journals_ssci_sociology_q1_20260219_v2.yml
// prefix: journals_ssci_sociology_q1
// =====================
/** 旧/重复 prefix 归一化为实际使用的 prefix，避免 meta.inputs 出现 count:0 的废弃条目 */
const PREFIX_TO_CANONICAL = {
  journals_ssci_area_and_asian_studies_q1: "journals_ssci_area_asian_studies_q1",
  journals_ssci_industrial_relations_and_labor_q1: "journals_ssci_industrial_relations_labor_q1",
};

function parseVersionedFilename(fp) {
  const f = path.basename(fp);
  const m = f.match(/^(.*)_(\d{8})_v(\d+)\.ya?ml$/i);
  if (!m) return null;
  const rawPrefix = m[1];
  const prefix = PREFIX_TO_CANONICAL[rawPrefix] || rawPrefix;
  return {
    prefix,
    rawPrefix,
    dateTag: m[2],
    version: parseInt(m[3], 10),
    file: fp,
  };
}

function pickLatestPerPrefix(files) {
  const map = new Map(); // canonical prefix -> best {dateTag, version, file}
  for (const fp of files) {
    const meta = parseVersionedFilename(fp);
    if (!meta) continue;
    const cur = map.get(meta.prefix);
    if (!cur) {
      map.set(meta.prefix, meta);
      continue;
    }
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

/** 六学科 prefix 中段 → 规范展示名（与 API/UI 一致，避免 0 条与显示不一致） */
const PREFIX_SLUG_TO_CANONICAL_LABEL = {
  industrial_relations_labor: "Industrial Relations and Labor",
  area_asian_studies: "Area and Asian Studies",
  women_studies: "Women's Studies",
  environmental_studies: "Environmental Studies",
  public_administration: "Public Administration",
  urban_studies: "Urban Studies",
};

/** 学科名（不含分区），e.g. journals_ssci_sociology_q1 -> Sociology */
function prefixToDisciplinePart(prefix) {
  const raw = (prefix || "").replace(/^journals_ssci_/i, "").replace(/_q[1-4]$/i, "").trim();
  const canonical = PREFIX_SLUG_TO_CANONICAL_LABEL[raw];
  return canonical
    ? canonical
    : raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** e.g. journals_ssci_sociology_q1 -> Sociology Q1；六学科用规范名。合并时应用每行的 j.quartile，不用文件名里的 Q1 */
function prefixToLabel(prefix) {
  return prefixToDisciplinePart(prefix) + " Q1";
}

// =====================
// MAIN
// =====================
async function main() {
  ensureDir(OUT_DIR);

  // 1) manual: optional overrides (all yml in references/manual)
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

  // precedence: sources < manual（manual 有则优先覆盖）；仅合并有期刊的 source，不写入 count:0 的 meta
  const sourceJ = [];
  for (const meta of sourcePicked) {
    const disciplinePart = prefixToDisciplinePart(meta.prefix);
    const obj = readYamlFile(meta.file);
    const js = extractJournals(obj)
      .map(cleanJournal)
      .filter((x) => x.name)
      .map((j) => {
        const q = (j.quartile || "").trim().toUpperCase();
        const quartile = /^Q[1-4]$/.test(q) ? q : "Q1";
        const source_category = `${disciplinePart} ${quartile}`;
        return { ...j, source_category };
      });
    if (js.length === 0) continue;
    sourceJ.push(...js);
    inputs.push({
      label: "sources(latest-per-prefix)",
      file: path.relative(ROOT, meta.file).replaceAll("\\", "/"),
      count: js.length,
    });
  }
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
        const entry = { ...j, source_categories: j.source_category ? [j.source_category] : [] };
        delete entry.source_category;
        merged.set(k, entry);
        seenNameToKey.set(`name:${norm(j.name).toLowerCase()}`, k);
      } else {
        merged.set(k, mergeOne(prev, j));
      }
    }
  }

  upsert(sourceJ, "sources");
  upsert(manualJ, "manual");

  // 保留已有 journals.yml 中的 OpenAlex/site，避免重跑 merge 覆盖掉 4_resolve 的结果
  const existingIndex = loadExistingOpenalexIndex(OUT_CANON);
  for (const j of merged.values()) {
    if (norm(j.openalex_source_id)) continue;
    const ni = normIssn(j.issn);
    const ne = normIssn(j.eissn);
    const rec = (ni && existingIndex.get(`issn:${ni}`)) || (ne && existingIndex.get(`eissn:${ne}`));
    if (!rec) continue;
    if (!norm(j.openalex_source_id) && rec.openalex_source_id) j.openalex_source_id = rec.openalex_source_id;
    if (!norm(j.openalex_source_display_name) && rec.openalex_source_display_name) j.openalex_source_display_name = rec.openalex_source_display_name;
    if (!norm(j.site) && rec.site) j.site = rec.site;
  }

  // finalize array, sort: drop temp source_category, keep source_categories, optionally note multi-category
  const journals = Array.from(merged.values())
    .map((j) => {
      const { source_category: _drop, ...rest } = j;
      const out = { ...rest };
      if (!out.short) out.short = "";
      if (!out.site) out.site = "";
      if (!out.notes) out.notes = "";
      if (Array.isArray(out.source_categories) && out.source_categories.length > 1) {
        out.notes = (out.notes ? out.notes + " " : "") + "[多学科: " + out.source_categories.join(", ") + "]";
      }
      return out;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // write outputs
  const dateTag = getTodayYYYYMMDD();
  const v = getNextVersion(OUT_DIR, dateTag);
  const versionedPath = path.join(
    OUT_DIR,
    `journals_merged_${dateTag}_v${v}.yml`
  );

  const multiCategoryCount = journals.filter((j) => Array.isArray(j.source_categories) && j.source_categories.length > 1).length;
  const payload = {
    meta: {
      generated_at: new Date().toISOString(),
      date_tag: dateTag,
      version: v,
      counts: {
        sources_rows: sourceJ.length,
        manual_rows: manualJ.length,
        merged_unique: journals.length,
        multi_category_journals: multiCategoryCount,
      },
      inputs,
      notes: "Merge precedence: sources < manual. Manual overrides when present. source_categories lists WOS categories when a journal appears in multiple.",
    },
    journals,
  };

  fs.writeFileSync(OUT_CANON, YAML.stringify(payload), "utf8");
  fs.writeFileSync(versionedPath, YAML.stringify(payload), "utf8");

  console.log("[merge_journals] source files picked =", sourceFiles.length, "(one per prefix)");
  console.log("[merge_journals] manual files =", manualFiles.length, "(optional overrides)");
  console.log("[merge_journals] merged unique journals =", journals.length);
  console.log("[merge_journals] multi-category journals =", multiCategoryCount);
  console.log("[merge_journals] wrote canonical =", path.relative(ROOT, OUT_CANON));
  console.log("[merge_journals] wrote snapshot  =", path.relative(ROOT, versionedPath));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
