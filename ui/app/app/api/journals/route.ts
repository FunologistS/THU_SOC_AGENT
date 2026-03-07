import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import YAML from "yaml";
import { getRepoRoot } from "@/lib/pathSafety";

const JOURNALS_PATH = path.join(
  getRepoRoot(),
  ".claude/skills/journal-catalog/references/system/journals.yml"
);

function derivePublisher(notes: string): string {
  if (!notes || typeof notes !== "string") return "";
  const part = notes.split(";").map((s) => s.trim()).filter(Boolean);
  return part[part.length - 1] || "";
}

function hasJcr(notes: string): boolean {
  return typeof notes === "string" && /WOS\/JCR/i.test(notes);
}

/** GET /api/journals?publisher=...&jcr=1 — 期刊列表，可选按出版社、JCR 筛选 */
export async function GET(request: Request) {
  if (!fs.existsSync(JOURNALS_PATH)) {
    return NextResponse.json({ journals: [], publishers: [] });
  }

  const { searchParams } = new URL(request.url);
  const publisher = searchParams.get("publisher")?.trim() || "";
  const jcrOnly = searchParams.get("jcr") === "1" || searchParams.get("jcr") === "true";

  const raw = fs.readFileSync(JOURNALS_PATH, "utf-8");
  const parsed = YAML.parse(raw);
  let list = Array.isArray(parsed?.journals) ? parsed.journals : [];

  const publishersSet = new Set<string>();
  list.forEach((j: { notes?: string }) => {
    const p = derivePublisher(j.notes || "");
    if (p) publishersSet.add(p);
  });
  const publishers = Array.from(publishersSet).sort();

  list = list.map((j: Record<string, unknown>) => ({
    name: j.name,
    short: j.short,
    display_name: j.openalex_source_display_name ?? j.name,
    issn: j.issn,
    openalex_source_id: j.openalex_source_id,
    notes: j.notes,
    publisher: derivePublisher((j.notes as string) || ""),
    has_jcr: hasJcr((j.notes as string) || ""),
    categories: Array.isArray(j.source_categories) ? j.source_categories : undefined,
  }));

  if (jcrOnly) list = list.filter((j: { has_jcr: boolean }) => j.has_jcr);
  if (publisher) list = list.filter((j: { publisher: string }) => j.publisher === publisher);

  return NextResponse.json({ journals: list, publishers });
}
