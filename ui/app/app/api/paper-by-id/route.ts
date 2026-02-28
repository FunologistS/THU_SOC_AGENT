import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { getRepoRoot } from "@/lib/pathSafety";

const TOPIC_REGEX = /^[a-z0-9_/-]+$/;

/**
 * GET /api/paper-by-id?topic=xxx&id=1
 * 从 outputs/<topic>/03_summaries/summaries_latest.md 中解析出第 id 篇论文的块，
 * 返回 { id, title, year, journal, doi, authors, abstract, rq, method, findings, contribution } 等字段，供前端引用弹窗展示。
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const topic = searchParams.get("topic");
  const idParam = searchParams.get("id");

  if (!topic || !TOPIC_REGEX.test(topic)) {
    return NextResponse.json({ error: "Missing or invalid topic" }, { status: 400 });
  }
  const id = idParam ? parseInt(idParam, 10) : NaN;
  if (!Number.isFinite(id) || id < 1) {
    return NextResponse.json({ error: "Missing or invalid id (positive integer)" }, { status: 400 });
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
  const block = blocks.find((b) => {
    const m = b.match(/^##\s+(\d+)\.\s+/m);
    const num = m ? parseInt(m[1], 10) : NaN;
    return Number.isFinite(num) && num === id;
  });

  if (!block) {
    return NextResponse.json({ error: "Paper not found for this id" }, { status: 404 });
  }

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

  return NextResponse.json({
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
  });
}
