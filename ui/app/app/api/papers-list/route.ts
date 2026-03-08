import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { getRepoRoot } from "@/lib/pathSafety";

const TOPIC_REGEX = /^[a-z0-9_/-]+$/;

export type PaperListItem = {
  id: number;
  title: string | null;
  year: number | null;
  journal: string | null;
  doi: string | null;
  openalex: string | null;
  authors: string | null;
  abstract: string | null;
  rq: string | null;
  method: string | null;
  findings: string | null;
  contribution: string | null;
};

function parseBlock(block: string, id: number): PaperListItem | null {
  const titleMatch = block.match(/^##\s+\d+\.\s+(.*)\s+\((\d{4})\)\s*$/m);
  const title = titleMatch ? titleMatch[1].trim() : "";
  const year = titleMatch ? parseInt(titleMatch[2], 10) : null;
  const yearSafe = year != null && Number.isFinite(year) ? year : null;

  const journal = (block.match(/^- Journal:\s*(.*)$/m)?.[1] ?? "").trim();
  const doi = (block.match(/^- DOI:\s*(.*)$/m)?.[1] ?? "").trim();
  const openalex = (block.match(/^- OpenAlex:\s*(.*)$/m)?.[1] ?? "").trim();
  const authors = (
    block.match(/^- Author\(s\):\s*(.+)$/m)?.[1] ??
    block.match(/^- Authors?:\s*(.+)$/m)?.[1] ??
    ""
  ).trim() || null;

  const abstract = (
    block.match(/\*\*Abstract\*\*:\s*([\s\S]*?)(?:\n\n|\n\*\*Research question\*\*|$)/m)?.[1] ?? ""
  ).trim();
  const rq = (
    block.match(/\*\*Research question\*\*:\s*([\s\S]*?)(?:\n\n|\n\*\*Data \/ material\*\*|$)/m)?.[1] ?? ""
  ).trim();
  const method = (
    block.match(/\*\*Method\*\*:\s*([\s\S]*?)(?:\n\n|\n\*\*Key findings|$)/m)?.[1] ?? ""
  ).trim();
  const findings = (
    block.match(/\*\*Key findings.*?\*\*:\s*([\s\S]*?)(?:\n\n|\n\*\*Contribution\*\*|$)/m)?.[1] ?? ""
  ).trim();
  const contribution = (block.match(/\*\*Contribution\*\*:\s*([\s\S]*?)(?:\n\n|$)/m)?.[1] ?? "").trim();

  return {
    id,
    title: title || null,
    year: yearSafe,
    journal: journal || null,
    doi: doi || null,
    openalex: openalex || null,
    authors: authors || null,
    abstract: abstract || null,
    rq: rq || null,
    method: method || null,
    findings: findings || null,
    contribution: contribution || null,
  };
}

/**
 * GET /api/papers-list?topic=xxx
 * 返回该 topic 下所有论文的完整列表（与 paper-by-id 同结构），供参考文献列表等使用。
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
  const list: PaperListItem[] = [];

  for (const b of blocks) {
    const m = b.match(/^##\s+(\d+)\.\s+/m);
    const num = m ? parseInt(m[1], 10) : NaN;
    if (!Number.isFinite(num) || num < 1) continue;
    const item = parseBlock(b, num);
    if (item) list.push(item);
  }

  return NextResponse.json(list);
}
