import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { getRepoRoot } from "@/lib/pathSafety";

const TOPIC_REGEX = /^[a-z0-9_/-]+$/;

/** 从作者串中提取仅姓氏（与 literature-synthesis 一致）；如 "Lauren Alfrey France Winddance Twine"（无逗号）按 2+3 词 -> ["Alfrey","Twine"]。 */
function authorsStrToSurnames(authorsStr: string | null): string[] {
  const raw = authorsStr != null ? String(authorsStr).trim() : "";
  if (!raw) return [];
  const segments = raw
    .split(/[,，、;；]|\s+and\s+|\s*&\s*/gi)
    .map((s) => s.replace(/\s+et\s+al\.?/gi, " ").trim())
    .filter(Boolean);
  if (segments.length > 1) {
    return segments.map((seg) => {
      const words = seg.split(/\s+/).filter(Boolean);
      return words.length ? words[words.length - 1]! : seg;
    });
  }
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length <= 2) return words.length ? [words[words.length - 1]!] : [];
  if (words.length === 3) return [words[2]!]; // 单作者 "First Middle Last"
  if (words.length % 2 === 0) {
    const surnames: string[] = [];
    for (let i = 1; i < words.length; i += 2) surnames.push(words[i]!);
    return surnames;
  }
  const n = words.length;
  const surnames: string[] = [];
  for (let i = 0; i < (n - 3) / 2; i++) surnames.push(words[1 + 2 * i]!);
  surnames.push(words[n - 1]!);
  return surnames;
}

/** 将作者串转为文内引用格式（仅姓氏）：2人 (A & B, Year)，3人及以上 (First et al., Year) */
function toInTextCitation(authorsStr: string | null, year: number | null): string {
  const y =
    year != null && Number.isFinite(Number(year)) && String(year).trim() !== ""
      ? String(Number(year))
      : "?";
  const surnames = authorsStrToSurnames(authorsStr);
  if (surnames.length === 0) return `(Unknown, ${y})`;
  if (surnames.length === 1) return `(${surnames[0]}, ${y})`;
  if (surnames.length === 2) return `(${surnames[0]} & ${surnames[1]}, ${y})`;
  return `(${surnames[0]} et al., ${y})`;
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
