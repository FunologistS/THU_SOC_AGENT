import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import YAML from "yaml";
import { getRepoRoot } from "@/lib/pathSafety";

const ROOT = getRepoRoot();
const SOURCES_DIR = path.join(ROOT, ".claude/skills/journal-catalog/references/sources");
const SYSTEM_JOURNALS_PATH = path.join(ROOT, ".claude/skills/journal-catalog/references/system/journals.yml");

const DISCIPLINE_PREFIX: Record<string, string> = {
  Sociology: "journals_ssci_sociology_q1",
  Anthropology: "journals_ssci_anthropology_q1",
  Economics: "journals_ssci_economics_q1",
};

function parseVersionedFilename(f: string) {
  const m = f.match(/^(.*)_(\d{8})_v(\d+)\.ya?ml$/i);
  if (!m) return null;
  return { prefix: m[1], dateTag: m[2], version: parseInt(m[3], 10), file: m[0] };
}

/** 仅考虑 meta.filter.quartile === "Q1" 的源文件，再按 dateTag、version 取最新（避免选到 Q1–Q4 全分区的版本） */
function pickLatestQ1PerPrefix(sourcesDir: string, files: string[]) {
  const map = new Map<string, { dateTag: string; version: number; file: string }>();
  for (const f of files) {
    const meta = parseVersionedFilename(f);
    if (!meta) continue;
    const fp = path.join(sourcesDir, meta.file);
    if (!fs.existsSync(fp)) continue;
    let parsed: { meta?: { filter?: { quartile?: string } } };
    try {
      parsed = YAML.parse(fs.readFileSync(fp, "utf-8"));
    } catch {
      continue;
    }
    const quartile = parsed?.meta?.filter?.quartile;
    if (quartile !== "Q1") continue;
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

/** 从 system journals.yml 构建 ISSN/EISSN/名称 -> 带 openalex_source_id 的期刊记录 */
function loadSystemIndex(): Map<string, Record<string, unknown>> {
  const byKey = new Map<string, Record<string, unknown>>();
  if (!fs.existsSync(SYSTEM_JOURNALS_PATH)) return byKey;
  const parsed = YAML.parse(fs.readFileSync(SYSTEM_JOURNALS_PATH, "utf-8"));
  const list = extractJournals(parsed);
  for (const j of list) {
    const id = String(j.openalex_source_id ?? "").trim();
    if (!id) continue;
    const record = {
      name: j.name,
      short: j.short,
      issn: j.issn,
      eissn: j.eissn,
      openalex_source_id: j.openalex_source_id,
      openalex_source_display_name: j.openalex_source_display_name ?? j.name,
      notes: j.notes,
    };
    const issn = normIssn(j.issn);
    const eissn = normIssn(j.eissn);
    const nameKey = normName(j.name);
    if (issn) byKey.set(`issn:${issn}`, record);
    if (eissn) byKey.set(`eissn:${eissn}`, record);
    if (nameKey) byKey.set(`name:${nameKey}`, record);
  }
  return byKey;
}

/** GET /api/journals-by-discipline?disciplines=Sociology,Anthropology,Economics — 返回指定学科的 OpenAlex 解析期刊（用于文献检索） */
export async function GET(request: Request) {
  if (!fs.existsSync(SOURCES_DIR)) {
    return NextResponse.json({ journals: [], disciplines: [] });
  }

  const systemIndex = loadSystemIndex();

  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("disciplines")?.trim() || "Sociology,Anthropology,Economics";
  const requested = raw
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const valid = requested.filter((d) => DISCIPLINE_PREFIX[d]);
  const disciplines = valid.length > 0 ? valid : ["Sociology", "Anthropology", "Economics"];

  const allFiles = fs.readdirSync(SOURCES_DIR).filter((f) => /\.ya?ml$/i.test(f));
  const latest = pickLatestQ1PerPrefix(SOURCES_DIR, allFiles);

  const byOpenAlexId = new Map<string, Record<string, unknown>>();

  for (const disc of disciplines) {
    const prefix = DISCIPLINE_PREFIX[disc];
    const meta = latest.get(prefix);
    if (!meta) continue;
    const fp = path.join(SOURCES_DIR, meta.file);
    if (!fs.existsSync(fp)) continue;
    const parsed = YAML.parse(fs.readFileSync(fp, "utf-8"));
    const list = extractJournals(parsed);
    for (const j of list) {
      const issn = normIssn(j.issn);
      const eissn = normIssn(j.eissn);
      const nameKey = normName(j.name);
      const resolved =
        (issn && systemIndex.get(`issn:${issn}`)) ||
        (eissn && systemIndex.get(`eissn:${eissn}`)) ||
        (nameKey && systemIndex.get(`name:${nameKey}`));
      if (!resolved) continue;
      const id = String(resolved.openalex_source_id ?? "").trim();
      if (!id || byOpenAlexId.has(id)) continue;
      byOpenAlexId.set(id, {
        name: resolved.name,
        short: resolved.short,
        issn: resolved.issn,
        eissn: resolved.eissn,
        openalex_source_id: resolved.openalex_source_id,
        openalex_source_display_name: resolved.openalex_source_display_name ?? resolved.name,
        notes: resolved.notes,
      });
    }
  }

  const journals = Array.from(byOpenAlexId.values()).sort((a, b) =>
    String(a.name ?? "").localeCompare(String(b.name ?? ""), "en", { sensitivity: "base" })
  );

  return NextResponse.json({
    journals,
    disciplines,
  });
}
