import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { getRepoRoot } from "@/lib/pathSafety";

const WOS_RAW_PATH = path.join(
  getRepoRoot(),
  ".claude/skills/journal-catalog/assets/01_raw/WOS_SSCI_260216.csv"
);
const WOS_NORMALIZED_DIR = path.join(
  getRepoRoot(),
  ".claude/skills/journal-catalog/assets/02_normalize"
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

/** 某学科归一化 CSV 路径：在 02_normalize 下按学科 slug 匹配 WOS_JCR_*_{slug}_*_normalized.csv，取最新一份 */
function normalizedPathForDiscipline(discipline: string): string {
  const slug = normalizedFileSlug(discipline);
  if (!slug) return "";
  if (!fs.existsSync(WOS_NORMALIZED_DIR)) return "";
  const re = new RegExp(`^WOS_JCR_.*_${slug.replace(/_/g, "_")}_.*_normalized\\.csv$`, "i");
  const files = fs
    .readdirSync(WOS_NORMALIZED_DIR)
    .filter((f) => re.test(f))
    .map((f) => path.join(WOS_NORMALIZED_DIR, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] ?? "";
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

/** 从归一化 CSV 读出 ISSN → quartile（Q1–Q4） */
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
  if (qIdx < 0 || (ipIdx < 0 && ieIdx < 0)) return out;
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvRow(lines[i]);
    const q = (row[qIdx] ?? "").trim().toUpperCase();
    if (!q || !/^Q[1-4]$/.test(q)) continue;
    if (ipIdx >= 0) {
      const ip = normalizeIssn(row[ipIdx] ?? "");
      if (ip) out[ip] = q;
    }
    if (ieIdx >= 0) {
      const ie = normalizeIssn(row[ieIdx] ?? "");
      if (ie) out[ie] = q;
    }
  }
  return out;
}

/** 从归一化 CSV 读出 ISSN → 完整 JCR 行（用于期刊详情弹窗） */
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
  if (ipIdx < 0 && ieIdx < 0) return out;
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvRow(lines[i]);
    const detail: WosJournalDetail = {};
    if (qIdx >= 0) detail.quartile = (row[qIdx] ?? "").trim().toUpperCase() || undefined;
    if (jifIdx >= 0) detail.jif = (row[jifIdx] ?? "").trim() || undefined;
    if (jciIdx >= 0) detail.jci = (row[jciIdx] ?? "").trim() || undefined;
    if (oaIdx >= 0) detail.oa_citable_pct = (row[oaIdx] ?? "").trim() || undefined;
    if (citIdx >= 0) detail.total_citations = (row[citIdx] ?? "").trim() || undefined;
    if (abbrIdx >= 0) detail.jcr_abbrev = (row[abbrIdx] ?? "").trim() || undefined;
    const ip = normalizeIssn(row[ipIdx] ?? "");
    const ie = normalizeIssn(row[ieIdx] ?? "");
    if (ip) out[ip] = detail;
    if (ie) out[ie] = detail;
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

/** GET /api/journals-wos?discipline=...&quartile=...&publisher=... — 3000+ WOS SSCI 期刊，学科 + 分区 */
export async function GET(request: Request) {
  if (!fs.existsSync(WOS_RAW_PATH)) {
    return NextResponse.json({
      journals: [],
      disciplines: [],
      quartiles: ["Q1", "Q2", "Q3", "Q4"],
      publishers: [],
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

  const disciplines = Array.from(disciplinesSet).sort();

  const { searchParams } = new URL(request.url);
  const discipline = searchParams.get("discipline")?.trim() || "";
  const quartile = searchParams.get("quartile")?.trim().toUpperCase() || "";
  const publisherFilter = searchParams.get("publisher")?.trim() || "";

  // 仅当选择了学科时，尝试加载该学科的 JCR 归一化文件并填充分区与详情（JIF、JCI、OA 等）
  const quartilePath = discipline ? normalizedPathForDiscipline(discipline) : "";
  const quartileByIssn = quartilePath ? loadQuartileByIssn(quartilePath) : {};
  const detailByIssn = quartilePath ? loadDetailByIssn(quartilePath) : {};
  const journals: WosJournalRow[] = journalsRaw.map((j) => {
    const nip = normalizeIssn(j.issn);
    const nie = normalizeIssn(j.eissn);
    const q = quartileByIssn[nip] ?? quartileByIssn[nie];
    const detail = detailByIssn[nip] ?? detailByIssn[nie];
    return {
      ...j,
      quartile: q,
      jif: detail?.jif,
      jci: detail?.jci,
      oa_citable_pct: detail?.oa_citable_pct,
      total_citations: detail?.total_citations,
      jcr_abbrev: detail?.jcr_abbrev,
    };
  });

  const publishersSet = new Set(journals.map((j) => j.publisher).filter(Boolean));
  const publishers = Array.from(publishersSet).sort();

  let filtered = journals;
  if (discipline) {
    filtered = filtered.filter((j) =>
      j.categories.some((c) => c.toLowerCase() === discipline.toLowerCase())
    );
  }
  if (quartile && /^Q[1-4]$/.test(quartile)) {
    filtered = filtered.filter((j) => j.quartile === quartile);
  }
  if (publisherFilter) {
    filtered = filtered.filter((j) => j.publisher === publisherFilter);
  }

  return NextResponse.json({
    journals: filtered,
    disciplines,
    quartiles: ["Q1", "Q2", "Q3", "Q4"],
    publishers,
  });
}
