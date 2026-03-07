import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import YAML from "yaml";
import { getRepoRoot } from "@/lib/pathSafety";

const REL_SYSTEM_JOURNALS = ".claude/skills/journal-catalog/references/system/journals.yml";
const REL_SOURCES_DIR = ".claude/skills/journal-catalog/references/sources";
const REL_NORMALIZED_DIR = ".claude/skills/journal-catalog/assets/02_normalize";

/** 向上查找实际存在的 journals.yml；若从 cwd 未找到则尝试 ui/app 的父目录（Next 从 ui/app 启动时 cwd 可能不同） */
function findRepoRoot(): string {
  let dir = path.resolve(process.cwd());
  for (let i = 0; i < 12; i++) {
    const candidate = path.join(dir, REL_SYSTEM_JOURNALS);
    try {
      if (fs.existsSync(candidate)) return dir;
    } catch {
      /* ignore */
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const cwd = path.resolve(process.cwd());
  const tryDirs = [path.join(cwd, ".."), path.join(cwd, "../.."), getRepoRoot()];
  for (const d of tryDirs) {
    try {
      const candidate = path.join(d, REL_SYSTEM_JOURNALS);
      if (fs.existsSync(candidate)) return d;
    } catch {
      /* ignore */
    }
  }
  return getRepoRoot();
}

function getPaths() {
  const root = findRepoRoot();
  const systemJournalsPath = path.join(root, REL_SYSTEM_JOURNALS);
  if (!fs.existsSync(systemJournalsPath)) {
    const cwd = path.resolve(process.cwd());
    const parentRoot = path.join(cwd, "..");
    const parentPath = path.join(parentRoot, REL_SYSTEM_JOURNALS);
    if (fs.existsSync(parentPath))
      return {
        ROOT: parentRoot,
        SOURCES_DIR: path.join(parentRoot, REL_SOURCES_DIR),
        WOS_NORMALIZED_DIR: path.join(parentRoot, REL_NORMALIZED_DIR),
        SYSTEM_JOURNALS_PATH: parentPath,
      };
  }
  return {
    ROOT: root,
    SOURCES_DIR: path.join(root, REL_SOURCES_DIR),
    WOS_NORMALIZED_DIR: path.join(root, REL_NORMALIZED_DIR),
    SYSTEM_JOURNALS_PATH: systemJournalsPath,
  };
}

/** 从 source 文件 prefix 得到学科展示名，如 journals_ssci_urban_studies_q1 → Urban Studies */
function prefixToDisplay(prefix: string): string {
  return prefix
    .replace(/^journals_ssci_/, "")
    .replace(/_q1$/i, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** 学科名 → 归一化 CSV 文件名 slug（与 journals-wos 一致） */
function normalizedFileSlug(discipline: string): string {
  return discipline
    .trim()
    .replace(/\s*[|,]\s*/g, "_")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "") || "";
}

/** 展示名 → 归一化文件名用的 lookup 名（与 journals-wos 一致） */
/** 14 个学科的规范名（唯一来源，用于排序与过滤） */
const CANONICAL_DISCIPLINES_ORDER: string[] = [
  "Anthropology",
  "Area and Asian Studies",
  "Communication",
  "Demography",
  "Economics",
  "Environmental Studies",
  "Industrial Relations and Labor",
  "Interdisciplinary",
  "Management",
  "Psychology",
  "Public Administration",
  "Sociology",
  "Urban Studies",
  "Women's Studies",
];

const DISCIPLINE_PATH_LOOKUP: Record<string, string> = {
  "Women's Studies": "Women Studies",
};

/** 同一学科多个 prefix 的展示名 → 统一规范名（14 个规范名，如 Industrial Relations and Labor） */
const DISPLAY_TO_CANONICAL: Record<string, string> = {
  "Area And Asian Studies": "Area and Asian Studies",
  "Area Asian Studies": "Area and Asian Studies",
  "Area Studies": "Area and Asian Studies",
  "Industrial Relations And Labor": "Industrial Relations and Labor",
  "Industrial Relations Labor": "Industrial Relations and Labor",
  "Women Studies": "Women's Studies",
};
/** 规范学科名 → 优先使用的 prefix（与 references/sources 文件名一致；用于 lookup 回退，避免 0 本期刊） */
const CANONICAL_TO_PREFIX: Record<string, string> = {
  "Area and Asian Studies": "journals_ssci_area_asian_studies_q1",
  "Environmental Studies": "journals_ssci_environmental_studies_q1",
  "Industrial Relations and Labor": "journals_ssci_industrial_relations_labor_q1",
  "Public Administration": "journals_ssci_public_administration_q1",
  "Urban Studies": "journals_ssci_urban_studies_q1",
  "Women's Studies": "journals_ssci_women_studies_q1",
};

/** 学科展示名 → 备用 slug 列表（与 journals-wos 一致，确保能匹配到归一化 CSV） */
const DISCIPLINE_FALLBACK_SLUGS: Record<string, string[]> = {
  "Area and Asian Studies": ["Area_and_Asian_Studies", "Area_Studies", "Asian_Studies"],
  "Industrial Relations and Labor": ["Industrial_Relations_Labor", "Industrial_Relations_and_Labor"],
  "Women's Studies": ["Women_Studies"],
};

/** 某学科归一化 CSV 路径（传入请求时解析的目录，避免模块加载时 cwd 与运行时不一致） */
function normalizedPathForDiscipline(discipline: string, wosNormalizedDir: string): string {
  if (!fs.existsSync(wosNormalizedDir)) return "";
  const lookup = DISCIPLINE_PATH_LOOKUP[discipline] ?? discipline;
  const slugs = [normalizedFileSlug(lookup), ...(DISCIPLINE_FALLBACK_SLUGS[discipline] ?? [])].filter(Boolean);
  const seen = new Set<string>();
  for (const slug of slugs) {
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^WOS_JCR_.*_${escaped}_.*_normalized\\.csv$`, "i");
    const files = fs
      .readdirSync(wosNormalizedDir)
      .filter((f) => re.test(f))
      .map((f) => path.join(wosNormalizedDir, f))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    if (files[0]) return files[0];
  }
  return "";
}

function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let end = i + 1;
      const parts: string[] = [];
      while (end < line.length) {
        const next = line.indexOf('"', end);
        if (next === -1) {
          parts.push(line.slice(end));
          end = line.length;
          break;
        }
        if (line[next + 1] === '"') {
          parts.push(line.slice(end, next) + '"');
          end = next + 2;
        } else {
          parts.push(line.slice(end, next));
          end = next + 1;
          break;
        }
      }
      out.push(parts.join(""));
      if (line[end] === ",") end += 1;
      i = end;
    } else {
      const comma = line.indexOf(",", i);
      if (comma === -1) {
        out.push(line.slice(i).trim());
        break;
      }
      out.push(line.slice(i, comma).trim());
      i = comma + 1;
    }
  }
  return out;
}

const EDITION_CODES = new Set(["SCIE", "SSCI", "ESCI", "AHCI"]);

/** 从某学科归一化 CSV 读出 ISSN → JCR 详情（quartile、jif、jci 等），用于 enrich=jcr */
function loadJcrByIssnFromCsv(normalizedPath: string): Record<string, { quartile?: string; jif?: string; jci?: string; oa_citable_pct?: string; total_citations?: string; jcr_abbrev?: string }> {
  const out: Record<string, { quartile?: string; jif?: string; jci?: string; oa_citable_pct?: string; total_citations?: string; jcr_abbrev?: string }> = {};
  if (!fs.existsSync(normalizedPath)) return out;
  const raw = fs.readFileSync(normalizedPath, "utf-8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return out;
  const header = parseCsvRow(lines[0]).map((h) => h.trim().replace(/^"|"$/g, ""));
  const getIdx = (name: string) => header.findIndex((h) => new RegExp(name, "i").test(h));
  const ipIdx = getIdx("issn_print");
  const ieIdx = getIdx("issn_e");
  const qIdx = getIdx("quartile");
  const jifIdx = getIdx("jif");
  const jciIdx = getIdx("jci");
  const oaIdx = getIdx("oa_citable");
  const citIdx = getIdx("total_citations");
  const abbrIdx = getIdx("jcr_abbrev");
  const nameIdx = getIdx("journal_name");
  if (ipIdx < 0 && ieIdx < 0) return out;
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvRow(lines[i]);
    const offset =
      nameIdx >= 0 && EDITION_CODES.has((row[nameIdx] ?? "").trim()) && nameIdx + 1 < row.length ? 1 : 0;
    const detail: { quartile?: string; jif?: string; jci?: string; oa_citable_pct?: string; total_citations?: string; jcr_abbrev?: string } = {};
    if (qIdx >= 0) detail.quartile = (row[qIdx + offset] ?? "").trim().toUpperCase() || undefined;
    if (jifIdx >= 0) detail.jif = (row[jifIdx + offset] ?? "").trim() || undefined;
    if (jciIdx >= 0) detail.jci = (row[jciIdx + offset] ?? "").trim() || undefined;
    if (oaIdx >= 0) detail.oa_citable_pct = (row[oaIdx + offset] ?? "").trim() || undefined;
    if (citIdx >= 0) detail.total_citations = (row[citIdx + offset] ?? "").trim() || undefined;
    if (abbrIdx >= 0) detail.jcr_abbrev = (row[abbrIdx + offset] ?? "").trim() || undefined;
    const ip = normIssn(row[ipIdx + offset] ?? "");
    const ie = normIssn(row[ieIdx + offset] ?? "");
    if (ip) out[ip] = detail;
    if (ie) out[ie] = detail;
  }
  return out;
}

/** 从归一化 CSV 按分区筛选，返回 ISSN/eISSN 对应的 openalex 期刊列表（依赖 systemIndex） */
function loadJournalsByDisciplineQuartile(
  normalizedPath: string,
  quartile: string,
  systemIndex: Map<string, Record<string, unknown>>
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  if (!fs.existsSync(normalizedPath) || !/^Q[1-4]$/.test(quartile)) return out;
  const raw = fs.readFileSync(normalizedPath, "utf-8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return out;
  const header = parseCsvRow(lines[0]).map((h) => h.trim().replace(/^"|"$/g, ""));
  const getIdx = (name: string) => header.findIndex((h) => new RegExp(name, "i").test(h));
  const ipIdx = getIdx("issn_print");
  const ieIdx = getIdx("issn_e");
  const qIdx = getIdx("quartile");
  if ((ipIdx < 0 && ieIdx < 0) || qIdx < 0) return out;
  const seen = new Set<string>();
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvRow(lines[i]);
    const q = (row[qIdx] ?? "").trim().toUpperCase();
    if (q !== quartile) continue;
    const nip = normIssn(row[ipIdx] ?? "");
    const nie = normIssn(row[ieIdx] ?? "");
    const resolved =
      (nip && systemIndex.get(`issn:${nip}`)) ||
      (nie && systemIndex.get(`eissn:${nie}`)) ||
      (nip && systemIndex.get(`eissn:${nip}`)) ||
      (nie && systemIndex.get(`issn:${nie}`));
    if (!resolved) continue;
    const id = String(resolved.openalex_source_id ?? "").trim();
    const dedupeKey = id || `issn:${nip}` || `eissn:${nie}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push({
      name: resolved.name,
      short: resolved.short,
      issn: resolved.issn,
      eissn: resolved.eissn,
      openalex_source_id: resolved.openalex_source_id ?? "",
      openalex_source_display_name: resolved.openalex_source_display_name ?? resolved.name,
      notes: resolved.notes,
    });
  }
  return out;
}

function parseVersionedFilename(f: string) {
  const m = f.match(/^(.*)_(\d{8})_v(\d+)\.ya?ml$/i);
  if (!m) return null;
  return { prefix: m[1], dateTag: m[2], version: parseInt(m[3], 10), file: m[0] };
}

/** 按 prefix 取最新源文件（dateTag、version 最大）；接受 Q1 或 Q1-Q4 等任意 meta.filter.quartile，以便 journals.yml 可包含 Q1–Q4 SSCI */
function pickLatestPerPrefix(sourcesDir: string, files: string[]) {
  const map = new Map<string, { dateTag: string; version: number; file: string }>();
  for (const f of files) {
    const meta = parseVersionedFilename(f);
    if (!meta) continue;
    const fp = path.join(sourcesDir, meta.file);
    if (!fs.existsSync(fp)) continue;
    const cur = map.get(meta.prefix);
    if (!cur) {
      map.set(meta.prefix, { dateTag: meta.dateTag, version: meta.version, file: meta.file });
      continue;
    }
    if (meta.dateTag > cur.dateTag || (meta.dateTag === cur.dateTag && meta.version > cur.version))
      map.set(meta.prefix, { dateTag: meta.dateTag, version: meta.version, file: meta.file });
  }
  return map;
}

function extractJournals(obj: unknown): Array<Record<string, unknown>> {
  if (!obj) return [];
  const o = obj as { journals?: unknown[] };
  if (Array.isArray(o.journals)) return o.journals as Array<Record<string, unknown>>;
  if (Array.isArray(obj)) return obj as Array<Record<string, unknown>>;
  return [];
}

function normIssn(s: unknown): string {
  return String(s ?? "")
    .toUpperCase()
    .replace(/\D/g, "");
}

function normName(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** 从 system journals.yml 构建 ISSN/EISSN/名称 -> 期刊记录（path 请求时解析，避免 cwd 不一致） */
function loadSystemIndex(systemJournalsPath: string): Map<string, Record<string, unknown>> {
  const byKey = new Map<string, Record<string, unknown>>();
  if (!fs.existsSync(systemJournalsPath)) return byKey;
  const parsed = YAML.parse(fs.readFileSync(systemJournalsPath, "utf-8"));
  const list = extractJournals(parsed);
  for (const j of list) {
    const record: Record<string, unknown> = {
      name: j.name,
      short: j.short,
      issn: j.issn,
      eissn: j.eissn,
      openalex_source_id: j.openalex_source_id ?? "",
      openalex_source_display_name: j.openalex_source_display_name ?? j.name,
      notes: j.notes,
    };
    if (Array.isArray((j as Record<string, unknown>).source_categories))
      record.source_categories = (j as Record<string, unknown>).source_categories;
    if ((j as Record<string, unknown>).quartile != null) record.quartile = (j as Record<string, unknown>).quartile;
    if ((j as Record<string, unknown>).jif != null) record.jif = (j as Record<string, unknown>).jif;
    if ((j as Record<string, unknown>).jci != null) record.jci = (j as Record<string, unknown>).jci;
    if ((j as Record<string, unknown>).oa_citable_pct != null) record.oa_citable_pct = (j as Record<string, unknown>).oa_citable_pct;
    if ((j as Record<string, unknown>).total_citations != null) record.total_citations = (j as Record<string, unknown>).total_citations;
    const issn = normIssn(j.issn);
    const eissn = normIssn(j.eissn);
    const nameKey = normName(j.name);
    if (issn) byKey.set(`issn:${issn}`, record);
    if (eissn) byKey.set(`eissn:${eissn}`, record);
    if (nameKey) byKey.set(`name:${nameKey}`, record);
  }
  return byKey;
}

/** 从 journals.yml meta.inputs 推导学科列表、prefix 与 source 文件绝对路径；root 必须为已确认的 repo 根（与 SYSTEM_JOURNALS_PATH 一致） */
function buildDisciplinesFromJournalsYml(systemJournalsPath: string, repoRoot: string): {
  disciplines: string[];
  displayToPrefix: Map<string, string>;
  canonicalToSourcePath: Map<string, string>;
} {
  const disciplines: string[] = [];
  const displayToPrefix = new Map<string, string>();
  const canonicalToSourcePath = new Map<string, string>();
  if (!fs.existsSync(systemJournalsPath)) return { disciplines, displayToPrefix, canonicalToSourcePath };
  const parsed = YAML.parse(fs.readFileSync(systemJournalsPath, "utf-8")) as { meta?: { inputs?: Array<{ label?: string; file?: string; count?: number }> } };
  const inputs = parsed?.meta?.inputs;
  if (!Array.isArray(inputs)) return { disciplines, displayToPrefix, canonicalToSourcePath };
  const root = path.resolve(repoRoot);
  for (const entry of inputs) {
    if (entry.count == null || entry.count <= 0) continue;
    if (!String(entry.label ?? "").includes("sources")) continue;
    const filePath = String(entry.file ?? "").trim();
    if (!filePath) continue;
    const basename = path.basename(filePath);
    const m = basename.match(/^(.+)_\d{8}_v\d+\.ya?ml$/i);
    if (!m) continue;
    const prefix = m[1];
    const display = prefixToDisplay(prefix);
    const canonical = DISPLAY_TO_CANONICAL[display] ?? display;
    if (!canonical || displayToPrefix.has(canonical)) continue;
    displayToPrefix.set(canonical, prefix);
    const absPath = path.isAbsolute(filePath) ? filePath : path.join(root, filePath.replace(/^[/\\]/, "").replace(/^\.[/\\]/, ""));
    canonicalToSourcePath.set(canonical, absPath);
    disciplines.push(canonical);
  }
  return { disciplines, displayToPrefix, canonicalToSourcePath };
}

/** GET /api/journals-by-discipline?disciplines=...&quartile=Q1 — 返回指定学科（及可选分区）的 OpenAlex 解析期刊；不传 disciplines 时仅返回可选学科列表。路径在请求时解析，避免服务启动 cwd 与 repo 不一致。 */
export async function GET(request: Request) {
  const paths = getPaths();
  const systemIndex = loadSystemIndex(paths.SYSTEM_JOURNALS_PATH);

  let availableDisciplines: string[] = [];
  let displayToPrefix = new Map<string, string>();
  let canonicalToSourcePath = new Map<string, string>();

  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("disciplines")?.trim() || "";
  const quartileParam = searchParams.get("quartile")?.trim() || "";
  const enrichJcr = searchParams.get("enrich") === "jcr";
  const debug = searchParams.get("debug") === "1" || searchParams.get("debug") === "true";
  const quartiles = quartileParam
    .split(/[,，\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter((q) => /^Q[1-4]$/.test(q));
  /** 只按逗号分多个学科，不按空格分（学科名含空格如 "Area and Asian Studies"） */
  const requested = raw.split(/[,，]/).map((s) => s.trim()).filter(Boolean);

  const fromYml = buildDisciplinesFromJournalsYml(paths.SYSTEM_JOURNALS_PATH, paths.ROOT);
  if (fromYml.disciplines.length > 0) {
    availableDisciplines = fromYml.disciplines;
    displayToPrefix = fromYml.displayToPrefix;
    canonicalToSourcePath = fromYml.canonicalToSourcePath;
    if (raw && fromYml.canonicalToSourcePath.size > 0) console.log("[journals-by-discipline] fromYml ok, ROOT=", paths.ROOT, "pathKeys=", [...fromYml.canonicalToSourcePath.keys()].slice(0, 3));
  } else {
    if (raw) console.warn("[journals-by-discipline] fromYml empty, systemYmlExists=", fs.existsSync(paths.SYSTEM_JOURNALS_PATH), "ROOT=", paths.ROOT);
  }
  if (fromYml.disciplines.length === 0 && fs.existsSync(paths.SOURCES_DIR)) {
    const allFiles = fs.readdirSync(paths.SOURCES_DIR).filter((f) => /\.ya?ml$/i.test(f));
    const latest = pickLatestPerPrefix(paths.SOURCES_DIR, allFiles);
    const canonicalToPrefixes = new Map<string, string[]>();
    for (const prefix of latest.keys()) {
      const display = prefixToDisplay(prefix);
      if (!display) continue;
      const canonical = DISPLAY_TO_CANONICAL[display] ?? display;
      if (!canonicalToPrefixes.has(canonical)) canonicalToPrefixes.set(canonical, []);
      canonicalToPrefixes.get(canonical)!.push(prefix);
    }
    for (const [canonical, prefixes] of canonicalToPrefixes) {
      const preferred = CANONICAL_TO_PREFIX[canonical];
      const chosen = preferred && prefixes.includes(preferred) ? preferred : prefixes[0];
      displayToPrefix.set(canonical, chosen);
      availableDisciplines.push(canonical);
    }
    const haveSet = new Set(availableDisciplines);
    availableDisciplines = CANONICAL_DISCIPLINES_ORDER.filter((d) => haveSet.has(d));
  }

  /** 请求学科名 → 规范化键（与 availableDisciplines 的规范化键比较），避免 WOS 下拉与 journals.yml 命名不一致 */
  function normDisciplineName(s: string): string {
    return s
      .replace(/\s+and\s+/gi, " ")
      .replace(/\s+/g, " ")
      .replace(/women'?s?\s*studies/i, "Women Studies")
      .trim();
  }
  const valid = requested
    .map((r) => {
      if (availableDisciplines.includes(r)) return r;
      const nr = normDisciplineName(r);
      return availableDisciplines.find((d) => normDisciplineName(d) === nr) ?? null;
    })
    .filter((d): d is string => d != null);
  const disciplines = valid.length > 0 ? valid : [];
  let debugInfo: Record<string, unknown> = {};

  if (disciplines.length === 0) {
    return NextResponse.json({
      journals: [],
      disciplines: availableDisciplines,
      quartileOptions: ["Q1", "Q2", "Q3", "Q4"],
    });
  }

  const byOpenAlexId = new Map<string, Record<string, unknown>>();

  if (quartiles.length > 0) {
    for (const disc of disciplines) {
      const np = normalizedPathForDiscipline(disc, paths.WOS_NORMALIZED_DIR);
      if (!np) continue;
      for (const quartile of quartiles) {
        const list = loadJournalsByDisciplineQuartile(np, quartile, systemIndex);
        for (const j of list) {
          const id = String(j.openalex_source_id ?? "").trim();
          const nip = normIssn(j.issn);
          const nie = normIssn(j.eissn);
          const dedupeKey = id || `issn:${nip}` || `eissn:${nie}` || String(j.name ?? "").trim();
          if (byOpenAlexId.has(dedupeKey)) continue;
          byOpenAlexId.set(dedupeKey, j);
        }
      }
    }
  } else {
    if (debug) debugInfo = { cwd: process.cwd(), ROOT: paths.ROOT, systemYmlExists: fs.existsSync(paths.SYSTEM_JOURNALS_PATH), sourcesDirExists: fs.existsSync(paths.SOURCES_DIR), canonicalToSourcePathSize: canonicalToSourcePath.size, disciplineKeys: [...canonicalToSourcePath.keys()], requested: requested, valid: disciplines };
    for (const disc of disciplines) {
      let fp: string | null = canonicalToSourcePath.get(disc) ?? null;
      if (!fp && fs.existsSync(paths.SOURCES_DIR)) {
        let prefix = displayToPrefix.get(disc) ?? CANONICAL_TO_PREFIX[disc];
        if (prefix) {
          const allFiles = fs.readdirSync(paths.SOURCES_DIR).filter((f) => /\.ya?ml$/i.test(f));
          const latest = pickLatestPerPrefix(paths.SOURCES_DIR, allFiles);
          const meta = latest.get(prefix);
          if (meta) fp = path.join(paths.SOURCES_DIR, meta.file);
        }
      }
      if (debug) (debugInfo as Record<string, unknown>)[`path_${disc.replace(/\s/g, "_")}`] = fp;
      if (debug && fp !== null) (debugInfo as Record<string, unknown>)[`exists_${disc.replace(/\s/g, "_")}`] = fs.existsSync(fp);
      if (!fp || !fs.existsSync(fp)) {
        if (debug) (debugInfo as Record<string, unknown>)[`skip_${disc.replace(/\s/g, "_")}`] = !fp ? "no_fp" : "file_not_found";
        console.warn("[journals-by-discipline] skip (no file):", disc, "fp=", fp ?? "null", "exists=", fp ? fs.existsSync(fp) : false);
        continue;
      }
      const parsed = YAML.parse(fs.readFileSync(fp, "utf-8"));
      const list = extractJournals(parsed);
      if (debug) (debugInfo as Record<string, unknown>)[`listLen_${disc.replace(/\s/g, "_")}`] = list.length;
      for (const j of list) {
        const issn = normIssn(j.issn);
        const eissn = normIssn(j.eissn);
        const nameKey = normName(j.name);
        const resolved =
          (issn && systemIndex.get(`issn:${issn}`)) ||
          (eissn && systemIndex.get(`eissn:${eissn}`)) ||
          (nameKey && systemIndex.get(`name:${nameKey}`));
        const dedupeKey =
          (resolved && String((resolved as Record<string, unknown>).openalex_source_id ?? "").trim()) ||
          `issn:${issn}` ||
          `eissn:${eissn}` ||
          `name:${nameKey}`;
        if (byOpenAlexId.has(dedupeKey)) continue;
        if (resolved) {
          const r = resolved as Record<string, unknown>;
          const entry: Record<string, unknown> = {
            name: r.name,
            short: r.short,
            issn: r.issn,
            eissn: r.eissn,
            openalex_source_id: r.openalex_source_id ?? "",
            openalex_source_display_name: r.openalex_source_display_name ?? r.name,
            notes: r.notes,
          };
          if (Array.isArray(r.source_categories)) {
            entry.source_categories = r.source_categories;
            entry.categories = r.source_categories;
          }
          if (r.quartile != null) entry.quartile = r.quartile;
          if (r.jif != null) entry.jif = r.jif;
          if (r.jci != null) entry.jci = r.jci;
          if (r.oa_citable_pct != null) entry.oa_citable_pct = r.oa_citable_pct;
          if (r.total_citations != null) entry.total_citations = r.total_citations;
          byOpenAlexId.set(dedupeKey, entry);
        } else {
          byOpenAlexId.set(dedupeKey, {
            name: j.name,
            short: j.short,
            issn: j.issn ?? "",
            eissn: j.eissn ?? "",
            openalex_source_id: "",
            openalex_source_display_name: String(j.name ?? ""),
            notes: j.notes ?? "",
          });
        }
      }
    }
  }

  let journals = Array.from(byOpenAlexId.values()).sort((a, b) =>
    String(a.name ?? "").localeCompare(String(b.name ?? ""), "en", { sensitivity: "base" })
  );

  for (const j of journals) {
    const r = j as Record<string, unknown>;
    if (Array.isArray(r.source_categories) && (!Array.isArray(r.categories) || r.categories.length === 0))
      r.categories = r.source_categories;
  }

  if (enrichJcr && journals.length > 0) {
    const jcrByIssn: Record<string, { quartile?: string; jif?: string; jci?: string; oa_citable_pct?: string; total_citations?: string; jcr_abbrev?: string }> = {};
    for (const disc of disciplines) {
      const np = normalizedPathForDiscipline(disc, paths.WOS_NORMALIZED_DIR);
      if (!np) continue;
      const map = loadJcrByIssnFromCsv(np);
      for (const [issn, detail] of Object.entries(map)) {
        if (!jcrByIssn[issn]) jcrByIssn[issn] = detail;
      }
    }
    journals = journals.map((j) => {
      const nip = normIssn(j.issn);
      const nie = normIssn(j.eissn);
      const detail = jcrByIssn[nip] ?? jcrByIssn[nie];
      const out = { ...j };
      if (out.name && !(out as Record<string, unknown>).title) (out as Record<string, unknown>).title = out.name;
      if (!Array.isArray((out as Record<string, unknown>).categories) || (out as Record<string, unknown>).categories.length === 0)
        (out as Record<string, unknown>).categories = [...disciplines];
      if (detail) {
        if (detail.quartile) (out as Record<string, unknown>).quartile = detail.quartile;
        if (detail.jif != null) (out as Record<string, unknown>).jif = detail.jif;
        if (detail.jci != null) (out as Record<string, unknown>).jci = detail.jci;
        if (detail.oa_citable_pct != null) (out as Record<string, unknown>).oa_citable_pct = detail.oa_citable_pct;
        if (detail.total_citations != null) (out as Record<string, unknown>).total_citations = detail.total_citations;
        if (detail.jcr_abbrev != null) (out as Record<string, unknown>).jcr_abbrev = detail.jcr_abbrev;
      }
      return out;
    });
  }

  return NextResponse.json({
    journals,
    disciplines,
    quartileOptions: ["Q1", "Q2", "Q3", "Q4"],
    ...(debug && Object.keys(debugInfo).length > 0 ? { _debug: debugInfo } : {}),
  });
}
