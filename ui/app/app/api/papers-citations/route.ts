import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { getRepoRoot } from "@/lib/pathSafety";

const TOPIC_REGEX = /^[a-z0-9_/-]+$/;

/** 将作者串转为文内引用格式，与 literature-synthesis 中 toInTextCitation 一致 */
function toInTextCitation(authorsStr: string | null, year: number | null): string {
  const y =
    year != null && Number.isFinite(Number(year)) && String(year).trim() !== ""
      ? String(Number(year))
      : "?";
  const raw = authorsStr != null ? String(authorsStr).trim() : "";
  if (!raw) return `(Unknown, ${y})`;
  const parts = raw
    .split(/[,，、;；]/)
    .map((s) => s.replace(/\s*&\s*|\s+et\s+al\.?/gi, " ").trim())
    .filter(Boolean);
  if (parts.length === 0) return `(Unknown, ${y})`;
  if (parts.length === 1) return `(${parts[0]}, ${y})`;
  if (parts.length === 2) return `(${parts[0]} & ${parts[1]}, ${y})`;
  return `(${parts[0]} et al., ${y})`;
}

/**
 * GET /api/papers-citations?topic=xxx
 * 返回该 topic 下所有论文的 { id, inTextCitation }，用于前端将正文中的纯文字引用转为可点击链接。
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const topic = searchParams.get("topic");

  if (!topic || !TOPIC_REGEX.test(topic)) {
    return NextResponse.json({ error: "Missing or invalid topic" }, { status: 400 });
  }

  const repoRoot = getRepoRoot();
  const summariesPath = path.join(repoRoot, "outputs", topic, "03_summaries", "summaries_latest.md");
  if (!fs.existsSync(summariesPath)) {
    return NextResponse.json({ error: "Summaries file not found" }, { status: 404 });
  }

  let raw: string;
  try {
    raw = fs.readFileSync(summariesPath, "utf-8");
  } catch {
    return NextResponse.json({ error: "Could not read summaries" }, { status: 500 });
  }
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);

  const blocks = raw.split(/\n---\n/).map((s) => s.trim()).filter(Boolean);
  const list: { id: number; inTextCitation: string }[] = [];

  for (const b of blocks) {
    const h = b.match(/^##\s+(\d+)\.\s+(.*)\s+\((\d{4})\)\s*$/m);
    if (!h) continue;
    const paperId = parseInt(h[1], 10);
    if (!Number.isFinite(paperId) || paperId < 1) continue;
    const year = parseInt(h[3], 10);
    const authors = (
      b.match(/^- Author\(s\):\s*(.+)$/m)?.[1] ??
      b.match(/^- Authors?:\s*(.+)$/m)?.[1] ??
      ""
    ).trim() || null;
    const inTextCitation = toInTextCitation(authors, year);
    list.push({ id: paperId, inTextCitation });
  }

  return NextResponse.json(list);
}
