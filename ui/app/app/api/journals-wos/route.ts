import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import YAML from "yaml";
import { getRepoRoot } from "@/lib/pathSafety";

const WOS_RAW_PATH = path.join(
  getRepoRoot(),
  ".claude/skills/journal-catalog/assets/01_raw/WOS_SSCI_260216.csv"
);
const WOS_NORMALIZED_DIR = path.join(
  getRepoRoot(),
  ".claude/skills/journal-catalog/assets/02_normalize"
);
const SYSTEM_JOURNALS_PATH = path.join(
  getRepoRoot(),
  ".claude/skills/journal-catalog/references/system/journals.yml"
);

/** 学科名 → 归一化文件名后缀（与 JCR 导出 Category 一致，如 Sociology、Economics） */
function normalizedFileSlug(discipline: string): string {
  return discipline
    .trim()
    .replace(/\s*[|,]\s*/g, "_")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "") || "Sociology";
}

/** 14 个已解析学科规范名（仅用于「新增检索」/技能工作台；期刊数据库用完整 SSCI 学科列表） */
const PARSED_CANONICAL_DISCIPLINES_ORDER: string[] = [
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

/** Raw 中 category 名 → 规范展示名（六学科统一，避免检索 0 条与显示不一致） */
const RAW_CATEGORY_TO_CANONICAL: Record<string, string> = {
  "Industrial Relations & Labor": "Industrial Relations and Labor",
  "Industrial Relations Labor": "Industrial Relations and Labor",
  "Area Studies": "Area and Asian Studies",
  "Asian Studies": "Area and Asian Studies",
  "Women Studies": "Women's Studies",
  "Womens Studies": "Women's Studies",
  "Women'S Studies": "Women's Studies",
};

function rawCategoryToCanonical(rawCategory: string): string {
  const t = rawCategory.trim();
  return RAW_CATEGORY_TO_CANONICAL[t] ?? t;
}

/** 文件名/raw 展示名 → 规范名（统一为 Industrial Relations and Labor 等） */
const DISPLAY_TO_CANONICAL_WOS: Record<string, string> = {
  "Women Studies": "Women's Studies",
  "Industrial Relations And Labor": "Industrial Relations and Labor",
  "Industrial Relations Labor": "Industrial Relations and Labor",
  "Area And Asian Studies": "Area and Asian Studies",
  "Area Studies": "Area and Asian Studies",
};

/** 展示名 → 归一化文件名用的 lookup 名（文件名无撇号时用） */
const DISCIPLINE_PATH_LOOKUP: Record<string, string> = {
  "Women's Studies": "Women Studies",
};

/** 学科展示名 → 备用 slug 列表（当主 slug 未匹配到文件时尝试） */
const DISCIPLINE_FALLBACK_SLUGS: Record<string, string[]> = {
  "Area and Asian Studies": ["Area_and_Asian_Studies", "Area_Studies", "Asian_Studies"],
  "Industrial Relations and Labor": ["Industrial_Relations_and_Labor", "Industrial_Relations_Labor"],
  "Environmental Studies": ["Environmental_Studies"],
  "Public Administration": ["Public_Administration"],
  "Urban Studies": ["Urban_Studies"],
  "Women Studies": ["Women_Studies"],
  "Women's Studies": ["Women_Studies"],
};

/** 某学科归一化 CSV 路径：在 02_normalize 下按学科 slug 匹配 WOS_JCR_*_{slug}_*_normalized.csv，取最新一份 */
function normalizedPathForDiscipline(discipline: string): string {
  if (!fs.existsSync(WOS_NORMALIZED_DIR)) return "";
  const lookup = DISCIPLINE_PATH_LOOKUP[discipline] ?? discipline;
  const slugs = [normalizedFileSlug(lookup), ...(DISCIPLINE_FALLBACK_SLUGS[discipline] ?? [])].filter(Boolean);
  const seen = new Set<string>();
  for (const slug of slugs) {
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^WOS_JCR_.*_${escaped}_.*_normalized\\.csv$`, "i");
    const files = fs
      .readdirSync(WOS_NORMALIZED_DIR)
      .filter((f) => re.test(f))
      .map((f) => path.join(WOS_NORMALIZED_DIR, f))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    if (files[0]) return files[0];
  }
  return "";
}

/** 从 02_normalize 下 WOS_JCR_*_*_normalized.csv 文件名解析出学科展示名，用于补充下拉列表 */
function disciplinesFromNormalizedDir(): string[] {
  if (!fs.existsSync(WOS_NORMALIZED_DIR)) return [];
  const re = /^WOS_JCR_\d{6}_(.+)_\d{6}_normalized\.csv$/i;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of fs.readdirSync(WOS_NORMALIZED_DIR)) {
    const m = f.match(re);
    if (!m) continue;
    const display = (m[1] ?? "").replace(/_/g, " ").trim();
    if (display && !seen.has(display)) {
      seen.add(display);
      out.push(display);
    }
  }
  return out.sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

/** 将学科列表统一为 14 个规范名并按规范顺序返回（仅用于已解析学科的 quartileDisciplines 等） */
function toCanonicalDisciplinesOrder(names: string[]): string[] {
  const canonical = new Set(
    names.map((d) => DISPLAY_TO_CANONICAL_WOS[d] ?? d)
  );
  return PARSED_CANONICAL_DISCIPLINES_ORDER.filter((d) => canonical.has(d));
}

/** 返回 02_normalize 下所有学科对应的归一化 CSV 路径（每学科取最新一份），用于未选学科时合并 JCR 数据 */
function allNormalizedPaths(): string[] {
  if (!fs.existsSync(WOS_NORMALIZED_DIR)) return [];
  const re = /^WOS_JCR_(\d{6})_(.+)_(\d{6})_normalized\.csv$/i;
  const bySlug = new Map<string, { path: string; date: string }>();
  for (const f of fs.readdirSync(WOS_NORMALIZED_DIR)) {
    const m = f.match(re);
    if (!m) continue;
    const slug = (m[2] ?? "").trim();
    const date = m[3] ?? "";
    const fullPath = path.join(WOS_NORMALIZED_DIR, f);
    const cur = bySlug.get(slug);
    if (!cur || date > cur.date) bySlug.set(slug, { path: fullPath, date });
  }
  return Array.from(bySlug.values()).map((v) => v.path);
}

/** Parse a single CSV row with quoted fields (handles commas inside quotes) */
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

/** Normalize ISSN for matching (digits only, no hyphen) */
function normalizeIssn(issn: string): string {
  return String(issn || "").replace(/\D/g, "");
}

/** 归一化 CSV 单行详情（用于期刊弹窗） */
export interface WosJournalDetail {
  quartile?: string;
  jif?: string;
  jci?: string;
  oa_citable_pct?: string;
  total_citations?: string;
  jcr_abbrev?: string;
}

const EDITION_CODES = new Set(["SCIE", "SSCI", "ESCI", "AHCI"]);

/** 从归一化 CSV 读出 ISSN → quartile（Q1–Q4）；对 category 含逗号导致整行错位的行使用 offset=1 */
function loadQuartileByIssn(normalizedPath: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(normalizedPath)) return out;
  const raw = fs.readFileSync(normalizedPath, "utf-8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return out;
  const header = parseCsvRow(lines[0]).map((h) => h.trim().replace(/^"|"$/g, ""));
  const qIdx = header.findIndex((h) => /quartile/i.test(h));
  const ipIdx = header.findIndex((h) => /issn_print/i.test(h));
  const ieIdx = header.findIndex((h) => /issn_e/i.test(h));
  const nameIdx = header.findIndex((h) => /journal_name/i.test(h));
  if (qIdx < 0 || (ipIdx < 0 && ieIdx < 0)) return out;
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvRow(lines[i]);
    const offset =
      nameIdx >= 0 && EDITION_CODES.has((row[nameIdx] ?? "").trim()) && nameIdx + 1 < row.length ? 1 : 0;
    const q = (row[qIdx + offset] ?? "").trim().toUpperCase();
    if (!q || !/^Q[1-4]$/.test(q)) continue;
    if (ipIdx >= 0) {
      const ip = normalizeIssn(row[ipIdx + offset] ?? "");
      if (ip) out[ip] = q;
    }
    if (ieIdx >= 0) {
      const ie = normalizeIssn(row[ieIdx + offset] ?? "");
      if (ie) out[ie] = q;
    }
  }
  return out;
}

/** 从归一化 CSV 读出 ISSN → 完整 JCR 行（用于期刊详情弹窗）；对 category 含逗号导致整行错位的行使用 offset=1 */
function loadDetailByIssn(normalizedPath: string): Record<string, WosJournalDetail> {
  const out: Record<string, WosJournalDetail> = {};
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
    const detail: WosJournalDetail = {};
    if (qIdx >= 0) detail.quartile = (row[qIdx + offset] ?? "").trim().toUpperCase() || undefined;
    if (jifIdx >= 0) detail.jif = (row[jifIdx + offset] ?? "").trim() || undefined;
    if (jciIdx >= 0) detail.jci = (row[jciIdx + offset] ?? "").trim() || undefined;
    if (oaIdx >= 0) detail.oa_citable_pct = (row[oaIdx + offset] ?? "").trim() || undefined;
    if (citIdx >= 0) detail.total_citations = (row[citIdx + offset] ?? "").trim() || undefined;
    if (abbrIdx >= 0) detail.jcr_abbrev = (row[abbrIdx + offset] ?? "").trim() || undefined;
    const ip = normalizeIssn(row[ipIdx + offset] ?? "");
    const ie = normalizeIssn(row[ieIdx + offset] ?? "");
    if (ip) out[ip] = detail;
    if (ie) out[ie] = detail;
  }
  return out;
}

/** 从归一化 CSV 读出 ISSN → edition（SCIE/SSCI/ESCI/AHCI），用于仅保留 SSCI；对错位行使用 offset=1 */
function loadEditionByIssn(normalizedPath: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(normalizedPath)) return out;
  const raw = fs.readFileSync(normalizedPath, "utf-8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return out;
  const header = parseCsvRow(lines[0]).map((h) => h.trim().replace(/^"|"$/g, ""));
  const getIdx = (name: string) => header.findIndex((h) => new RegExp(name, "i").test(h));
  const editionIdx = getIdx("edition");
  const ipIdx = getIdx("issn_print");
  const ieIdx = getIdx("issn_e");
  const nameIdx = getIdx("journal_name");
  if (editionIdx < 0 || (ipIdx < 0 && ieIdx < 0)) return out;
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvRow(lines[i]);
    const offset =
      nameIdx >= 0 && EDITION_CODES.has((row[nameIdx] ?? "").trim()) && nameIdx + 1 < row.length ? 1 : 0;
    const edition = (row[editionIdx + offset] ?? "").trim().toUpperCase();
    const ip = normalizeIssn(row[ipIdx + offset] ?? "");
    const ie = normalizeIssn(row[ieIdx + offset] ?? "");
    if (ip) out[ip] = edition;
    if (ie) out[ie] = edition;
  }
  return out;
}

export interface WosJournalRow {
  title: string;
  issn: string;
  eissn: string;
  publisher: string;
  categories: string[];
  quartile?: string;
  jif?: string;
  jci?: string;
  oa_citable_pct?: string;
  total_citations?: string;
  jcr_abbrev?: string;
}

/** 从某学科归一化 CSV 直接加载期刊列表（当 raw SSCI 中无该 category 时使用） */
function loadJournalsFromNormalizedCsv(
  normalizedPath: string,
  discipline: string
): WosJournalRow[] {
  if (!fs.existsSync(normalizedPath)) return [];
  const raw = fs.readFileSync(normalizedPath, "utf-8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = parseCsvRow(lines[0]).map((h) => h.trim().replace(/^"|"$/g, ""));
  const getIdx = (name: string) => header.findIndex((h) => new RegExp(name, "i").test(h));
  const nameIdx = getIdx("journal_name");
  const editionIdx = getIdx("edition");
  const ipIdx = getIdx("issn_print");
  const ieIdx = getIdx("issn_e");
  const pubIdx = getIdx("publisher");
  const qIdx = getIdx("quartile");
  const jifIdx = getIdx("jif");
  const jciIdx = getIdx("jci");
  const oaIdx = getIdx("oa_citable");
  const citIdx = getIdx("total_citations");
  const abbrIdx = getIdx("jcr_abbrev");
  if (nameIdx < 0) return [];
  /** 若 category 含逗号（如 "PSYCHOLOGY, SOCIAL"）且未加引号，CSV 会多出一列，整行错位；该行用 offset=1 取各列。仅保留 edition === SSCI。 */
  const out: WosJournalRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvRow(lines[i]);
    const rawName = (row[nameIdx] ?? "").trim().replace(/^"|"$/g, "");
    const offset = EDITION_CODES.has(rawName) && nameIdx + 1 < row.length ? 1 : 0;
    if (editionIdx >= 0) {
      const edition = (row[editionIdx + offset] ?? "").trim().toUpperCase();
      if (edition !== "SSCI") continue;
    }
    const title = (row[nameIdx + offset] ?? "").trim().replace(/^"|"$/g, "");
    if (!title) continue;
    const issn = (row[ipIdx + offset] ?? "").trim().replace(/\D/g, "");
    const eissn = (row[ieIdx + offset] ?? "").trim().replace(/\D/g, "");
    const publisher = (row[pubIdx + offset] ?? "").trim().replace(/^"|"$/g, "");
    const quartile = (row[qIdx + offset] ?? "").trim().toUpperCase() || undefined;
    out.push({
      title,
      issn: issn ? (issn.length === 8 ? `${issn.slice(0, 4)}-${issn.slice(4)}` : issn) : "",
      eissn: eissn ? (eissn.length === 8 ? `${eissn.slice(0, 4)}-${eissn.slice(4)}` : eissn) : "",
      publisher,
      categories: [discipline],
      quartile: quartile && /^Q[1-4]$/.test(quartile) ? quartile : undefined,
      jif: (row[jifIdx + offset] ?? "").trim() || undefined,
      jci: (row[jciIdx + offset] ?? "").trim() || undefined,
      oa_citable_pct: (row[oaIdx + offset] ?? "").trim() || undefined,
      total_citations: (row[citIdx + offset] ?? "").trim() || undefined,
      jcr_abbrev: (row[abbrIdx + offset] ?? "").trim().replace(/^"|"$/g, "") || undefined,
    });
  }
  return out;
}

/**
 * 数据源关系（确保不与 WOS_SSCI_260216.csv 冲突）：
 * - 当 raw 存在时：期刊主列表仅来自 raw（journalsRaw），不做合并追加。归一化 CSV 仅用于：(1) 按 ISSN 给 raw 行挂 quartile/JIF；(2) 学科下拉补充/去重；(3) 某学科在 raw 中无对应 category 时，用该学科归一化 CSV 作为该学科期刊列表（fallback）。
 * - 当 raw 不存在时：学科与期刊均来自 02_normalize，不读 raw。
 * 因此新增期刊内容（02_normalize、references/sources、journals.yml）只做补充与解析，不会覆盖或重复 raw 中的行。
 */

/** 学科筛选时：展示名与 raw 中 category 的别名（避免同一学科因写法不同被漏掉） */
const DISCIPLINE_MATCH_ALIASES: Record<string, string[]> = {
  "Women's Studies": ["Women Studies", "Womens Studies", "Women'S Studies"],
  "Industrial Relations and Labor": ["Industrial Relations & Labor", "Industrial Relations Labor"],
  "Area and Asian Studies": ["Area Studies", "Asian Studies"],
  /** raw 中为 Social Sciences, Interdisciplinary */
  Interdisciplinary: ["Social Sciences, Interdisciplinary"],
  /** raw 中 Psychology 拆成多子类 */
  Psychology: [
    "Psychology, Applied",
    "Psychology, Biological",
    "Psychology, Clinical",
    "Psychology, Development",
    "Psychology, Educational",
    "Psychology, Experimental",
    "Psychology, Mathematical",
    "Psychology, Multidisciplinary",
    "Psychology, Psychoanalysis",
    "Psychology, Social",
  ],
};

function disciplineMatchesRawCategory(discipline: string, rawCategory: string): boolean {
  const d = discipline.trim().toLowerCase();
  const r = (rawCategory || "").trim().toLowerCase().replace(/\s+q[1-4]$/, "").trim();
  if (d === r) return true;
  const aliases = DISCIPLINE_MATCH_ALIASES[discipline.trim()];
  if (aliases?.some((a) => a.trim().toLowerCase() === r)) return true;
  return false;
}

/** 从 notes 解析出版社（与 /api/journals 一致） */
function derivePublisher(notes: string): string {
  if (!notes || typeof notes !== "string") return "";
  const part = notes.split(";").map((s) => s.trim()).filter(Boolean);
  return part[part.length - 1] || "";
}

/** source_categories 如 "Management Q1" → 提取学科名 "Management" 等，用于按学科筛选 */
function disciplineFromSourceCategory(cat: string): string {
  const t = (cat || "").trim().replace(/\s+Q[1-4]$/i, "").trim();
  if (DISPLAY_TO_CANONICAL_WOS[t]) return DISPLAY_TO_CANONICAL_WOS[t];
  return t;
}

/** 从 journals.yml 构建 ISSN/eISSN → source_categories，供 raw 分支按刊补充「学科+分区」展示 */
function loadSourceCategoriesByIssn(): Map<string, string[]> {
  const index = new Map<string, string[]>();
  if (!fs.existsSync(SYSTEM_JOURNALS_PATH)) return index;
  const raw = fs.readFileSync(SYSTEM_JOURNALS_PATH, "utf-8");
  const parsed = YAML.parse(raw) as { journals?: Array<{ issn?: string; eissn?: string; source_categories?: string[] }> };
  const list = Array.isArray(parsed?.journals) ? parsed.journals : [];
  for (const j of list) {
    const sc = Array.isArray(j.source_categories) ? j.source_categories : [];
    if (sc.length === 0) continue;
    const nip = normalizeIssn(j.issn ?? "");
    const nie = normalizeIssn(j.eissn ?? "");
    if (nip) index.set(nip, sc);
    if (nie) index.set(nie, sc);
  }
  return index;
}

/** 当 raw 不存在时：从 journals.yml 加载完整 SSCI 期刊表，保证「期刊数据库」始终展示全部学科 */
function loadAllJournalsFromYml(): WosJournalRow[] {
  if (!fs.existsSync(SYSTEM_JOURNALS_PATH)) return [];
  const raw = fs.readFileSync(SYSTEM_JOURNALS_PATH, "utf-8");
  const parsed = YAML.parse(raw) as { journals?: Array<{ name?: string; short?: string; issn?: string; eissn?: string; notes?: string; source_categories?: string[] }> };
  const list = Array.isArray(parsed?.journals) ? parsed.journals : [];
  const pathsToLoad = allNormalizedPaths();
  const quartileByIssn: Record<string, string> = {};
  const detailByIssn: Record<string, WosJournalDetail> = {};
  for (const p of pathsToLoad) {
    const q = loadQuartileByIssn(p);
    const d = loadDetailByIssn(p);
    for (const [issn, v] of Object.entries(q)) {
      if (!quartileByIssn[issn]) quartileByIssn[issn] = v;
    }
    for (const [issn, v] of Object.entries(d)) {
      if (!detailByIssn[issn]) detailByIssn[issn] = v;
    }
  }
  return list.map((j) => {
    const nip = normalizeIssn(j.issn ?? "");
    const nie = normalizeIssn(j.eissn ?? "");
    const q = quartileByIssn[nip] ?? quartileByIssn[nie];
    const detail = detailByIssn[nip] ?? detailByIssn[nie];
    const sourceCats = Array.isArray(j.source_categories) ? j.source_categories : [];
    const categories = sourceCats.length ? sourceCats : ["Interdisciplinary"];
    return {
      title: j.name ?? "",
      issn: nip ? (nip.length === 8 ? `${nip.slice(0, 4)}-${nip.slice(4)}` : nip) : "",
      eissn: nie ? (nie.length === 8 ? `${nie.slice(0, 4)}-${nie.slice(4)}` : nie) : "",
      publisher: derivePublisher(j.notes ?? ""),
      categories: categories.length ? categories : ["Interdisciplinary"],
      quartile: q,
      jif: detail?.jif,
      jci: detail?.jci,
      oa_citable_pct: detail?.oa_citable_pct,
      total_citations: detail?.total_citations,
      jcr_abbrev: detail?.jcr_abbrev,
    };
  });
}

/** GET /api/journals-wos?discipline=...&quartile=...&publisher=... — 有 raw 时用完整 SSCI（01_raw/WOS_SSCI_260216.csv）全量列表，并用 journals.yml 按 ISSN 补充已解析学科的详细数据（分区、source_categories）；无 raw 时才用 yml 或单学科 CSV */
export async function GET(request: Request) {
  const disciplinesFromNormalized = disciplinesFromNormalizedDir();
  const { searchParams } = new URL(request.url);
  const discipline = searchParams.get("discipline")?.trim() || "";
  const quartile = searchParams.get("quartile")?.trim().toUpperCase() || "";
  const publisherFilter = searchParams.get("publisher")?.trim() || "";

  if (!fs.existsSync(WOS_RAW_PATH)) {
    let journals: WosJournalRow[] = fs.existsSync(SYSTEM_JOURNALS_PATH) ? loadAllJournalsFromYml() : [];
    if (journals.length === 0) {
      const quartilePath = discipline ? normalizedPathForDiscipline(discipline) : "";
      if (quartilePath) journals = loadJournalsFromNormalizedCsv(quartilePath, discipline);
    }
    if (discipline) {
      journals = journals.filter((j) =>
        j.categories.some((c) => disciplineMatchesRawCategory(discipline, c))
      );
    }
    if (quartile && /^Q[1-4]$/.test(quartile))
      journals = journals.filter((j) => j.quartile === quartile);
    if (publisherFilter) journals = journals.filter((j) => j.publisher === publisherFilter);
    const publishersSet = new Set(journals.map((j) => j.publisher).filter(Boolean));
    const disciplinesList = disciplinesFromNormalized.length > 0
      ? toCanonicalDisciplinesOrder(disciplinesFromNormalized.map((d) => DISPLAY_TO_CANONICAL_WOS[d] ?? d))
      : PARSED_CANONICAL_DISCIPLINES_ORDER;
    return NextResponse.json({
      meta: { edition: "SSCI" },
      journals,
      disciplines: disciplinesList,
      quartiles: ["Q1", "Q2", "Q3", "Q4"],
      publishers: Array.from(publishersSet).sort(),
      quartileDisciplines: disciplinesList,
    });
  }

  const raw = fs.readFileSync(WOS_RAW_PATH, "utf-8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const header = parseCsvRow(lines[0]);
  const titleIdx = header.findIndex((h) => /journal\s*title/i.test(h));
  const issnIdx = header.findIndex((h) => h === "ISSN");
  const eissnIdx = header.findIndex((h) => h === "eISSN");
  const pubIdx = header.findIndex((h) => /publisher\s*name/i.test(h));
  const catIdx = header.findIndex((h) => /web\s*of\s*science\s*categories/i.test(h));

  if (titleIdx < 0 || issnIdx < 0 || catIdx < 0) {
    return NextResponse.json(
      { error: "WOS CSV missing required columns" },
      { status: 500 }
    );
  }

  const disciplinesSet = new Set<string>();
  const journalsRaw: Array<{
    title: string;
    issn: string;
    eissn: string;
    publisher: string;
    categories: string[];
  }> = [];

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvRow(lines[i]);
    const title = (row[titleIdx] || "").trim();
    const issn = (row[issnIdx] ?? "").trim();
    const eissn = (row[eissnIdx] ?? "").trim();
    const publisher = (row[pubIdx] ?? "").trim();
    const catStr = (row[catIdx] ?? "").trim();
    const categories = catStr
      .split(/\|/)
      .map((c) => c.trim())
      .filter(Boolean);
    if (!title) continue;
    categories.forEach((c) => disciplinesSet.add(c));
    journalsRaw.push({ title, issn, eissn, publisher, categories });
  }

  disciplinesFromNormalized.forEach((d) =>
    disciplinesSet.add(DISPLAY_TO_CANONICAL_WOS[d] ?? d)
  );
  // 期刊数据库：完整 SSCI 学科列表（raw 中所有 category），六学科统一为规范名后去重排序
  const disciplinesUnified = Array.from(disciplinesSet)
    .map((d) => rawCategoryToCanonical(DISPLAY_TO_CANONICAL_WOS[d] ?? d))
    .filter(Boolean);
  const disciplines = [...new Set(disciplinesUnified)].sort((a, b) =>
    a.localeCompare(b, "en", { sensitivity: "base" })
  );

  const quartilePath = discipline ? normalizedPathForDiscipline(discipline) : "";
  // 注意：WOS raw 的 categories 可能包含多个学科，而 JCR 的分区/JIF 数据只会出现在某一个学科的归一化 CSV 中。
  // 如果仅加载“当前筛选学科”的归一化 CSV，就会出现：
  // - 期刊在 raw 分类里属于该学科
  // - 但分区/JIF 实际来自另一个学科的 JCR 表
  // 从而导致 UI 里看起来“没有数据”。
  // 因此这里统一从所有归一化 CSV 汇总指标，再按 raw categories 做学科过滤。
  const pathsToLoad = allNormalizedPaths();
  const quartileByIssn: Record<string, string> = {};
  const detailByIssn: Record<string, WosJournalDetail> = {};
  for (const p of pathsToLoad) {
    const q = loadQuartileByIssn(p);
    const d = loadDetailByIssn(p);
    for (const [issn, v] of Object.entries(q)) {
      if (!quartileByIssn[issn]) quartileByIssn[issn] = v;
    }
    for (const [issn, v] of Object.entries(d)) {
      if (!detailByIssn[issn]) detailByIssn[issn] = v;
    }
  }
  const sourceCategoriesByIssn = loadSourceCategoriesByIssn();
  const journals: WosJournalRow[] = journalsRaw.map((j) => {
    const nip = normalizeIssn(j.issn);
    const nie = normalizeIssn(j.eissn);
    const q = quartileByIssn[nip] ?? quartileByIssn[nie];
    const detail = detailByIssn[nip] ?? detailByIssn[nie];
    const ymlCats = sourceCategoriesByIssn.get(nip) ?? sourceCategoriesByIssn.get(nie);
    const categories = ymlCats?.length ? ymlCats : j.categories;
    return {
      ...j,
      categories,
      quartile: q,
      jif: detail?.jif,
      jci: detail?.jci,
      oa_citable_pct: detail?.oa_citable_pct,
      total_citations: detail?.total_citations,
      jcr_abbrev: detail?.jcr_abbrev,
    };
  });

  // raw 文件 WOS_SSCI_260216.csv 本身为 SSCI 导出，不再按归一化 CSV 的 edition 做二次过滤，默认显示全部 raw 期刊（约 3540）
  const publishersSet = new Set(journals.map((j) => j.publisher).filter(Boolean));
  const publishers = Array.from(publishersSet).sort();

  let filtered = journals;
  if (discipline) {
    filtered = filtered.filter((j) =>
      j.categories.some((c) => disciplineMatchesRawCategory(discipline, c))
    );
    if (filtered.length === 0 && quartilePath) {
      filtered = loadJournalsFromNormalizedCsv(quartilePath, discipline);
    }
  }
  if (quartile && /^Q[1-4]$/.test(quartile)) {
    filtered = filtered.filter((j) => j.quartile === quartile);
  }
  if (publisherFilter) {
    filtered = filtered.filter((j) => j.publisher === publisherFilter);
  }

  // 期刊数据库：学科下拉为完整 SSCI 学科（已统一六学科名）
  return NextResponse.json({
    meta: { edition: "SSCI" },
    journals: filtered,
    disciplines,
    quartiles: ["Q1", "Q2", "Q3", "Q4"],
    publishers,
    quartileDisciplines: disciplines,
  });
}
