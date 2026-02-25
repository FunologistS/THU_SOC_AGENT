import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { getRepoRoot } from "@/lib/pathSafety";

const WOS_RAW_PATH = path.join(
  getRepoRoot(),
  ".claude/skills/journal-catalog/assets/01_raw/WOS_SSCI_260216.csv"
);
const WOS_NORMALIZED_PATH = path.join(
  getRepoRoot(),
  ".claude/skills/journal-catalog/assets/02_normalize/WOS_JCR_260218_Sociology_260218_normalized.csv"
);

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

export interface WosJournalRow {
  title: string;
  issn: string;
  eissn: string;
  publisher: string;
  categories: string[];
  quartile?: string;
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

  let quartileByIssn: Record<string, string> = {};
  if (fs.existsSync(WOS_NORMALIZED_PATH)) {
    const norm = fs.readFileSync(WOS_NORMALIZED_PATH, "utf-8");
    const normLines = norm.split(/\r?\n/).filter((l) => l.trim());
    const normHeader = parseCsvRow(normLines[0]).map((h) => h.trim().replace(/^"|"$/g, ""));
    const nameIdx = normHeader.findIndex((h) => /journal_name/i.test(h));
    const qIdx = normHeader.findIndex((h) => /quartile/i.test(h));
    const ipIdx = normHeader.findIndex((h) => /issn_print/i.test(h));
    const ieIdx = normHeader.findIndex((h) => /issn_e/i.test(h));
    if (qIdx >= 0 && (ipIdx >= 0 || ieIdx >= 0)) {
      for (let i = 1; i < normLines.length; i++) {
        const row = parseCsvRow(normLines[i]);
        const q = (row[qIdx] ?? "").trim().toUpperCase();
        if (!q || !/^Q[1-4]$/.test(q)) continue;
        const ip = normalizeIssn(row[ipIdx] ?? "");
        const ie = normalizeIssn(row[ieIdx] ?? "");
        if (ip) quartileByIssn[ip] = q;
        if (ie) quartileByIssn[ie] = q;
      }
    }
  }

  const journals: WosJournalRow[] = journalsRaw.map((j) => {
    const q =
      quartileByIssn[normalizeIssn(j.issn)] ?? quartileByIssn[normalizeIssn(j.eissn)];
    return { ...j, quartile: q };
  });

  const publishersSet = new Set(journals.map((j) => j.publisher).filter(Boolean));
  const publishers = Array.from(publishersSet).sort();

  const { searchParams } = new URL(request.url);
  const discipline = searchParams.get("discipline")?.trim() || "";
  const quartile = searchParams.get("quartile")?.trim().toUpperCase() || "";
  const publisherFilter = searchParams.get("publisher")?.trim() || "";

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
