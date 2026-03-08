import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { getRepoRoot, isSafeTopic, resolveUnder } from "@/lib/pathSafety";

const DEFAULT_PATH = "01_raw/papers_latest.md";

/** 去掉 Markdown 链接 [text](url) 等，只保留可见文字 */
function stripMarkdownLinks(text: string): string {
  let t = String(text ?? "").replace(/\s+/g, " ").trim();
  t = t.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  t = t.replace(/https?:\/\/\S+/gi, " ");
  t = t.replace(/\b10\.\d{4,9}\/\S+/gi, " ");
  return t.replace(/\s+/g, " ").trim();
}

/** 判断原始论文表中的摘要单元格是否视为“空缺” */
function isEmptyAbstract(cell: string): boolean {
  const t = String(cell ?? "").trim();
  if (!t) return true;
  if (/^(no usable abstract|n\/a|none|unknown|no abstract)\.?$/i.test(t)) return true;
  if (/^see (the )?(abstract|link|url|paper)/i.test(t)) return true;
  if (/^(abstract )?see:/i.test(t)) return true;
  const core = stripMarkdownLinks(t);
  if (!core) return true;
  if (core.length < 25) return true;
  return false;
}

/**
 * 解析 01_raw 的 Markdown 表格（期刊 | 年份 | 标题 | 作者 | DOI | OpenAlex | 摘要），
 * 返回总行数及摘要空缺行数。
 */
function parseRawPapersTable(md: string): { total: number; missingAbstract: number } {
  const lines = md.split(/\r?\n/).filter((l) => l.trim().startsWith("|"));
  if (lines.length < 3) return { total: 0, missingAbstract: 0 };
  const header = lines[0].trim().replace(/^\|/, "").replace(/\|$/, "");
  const parts = header.split(" | ").map((p) => p.trim().toLowerCase());
  const hasAuthors = parts.some((p) => p === "authors" || p.includes("author") || p === "作者");
  const abstractColIndex = hasAuthors ? 6 : 5;
  const dataLines = lines.slice(2);
  let total = 0;
  let missing = 0;
  for (const line of dataLines) {
    const core = line.trim().replace(/^\|/, "").replace(/\|$/, "");
    const cells = core.split(" | ");
    if (cells.length <= abstractColIndex) continue;
    total += 1;
    const abstractCell = cells.slice(abstractColIndex).join(" | ").trim();
    if (isEmptyAbstract(abstractCell)) missing += 1;
  }
  return { total, missingAbstract: missing };
}

/**
 * GET /api/raw-papers-stats?topic=xxx&path=01_raw/papers_latest.md
 * 返回该主题下 01_raw 论文表的总条数及摘要空缺条数。path 可选，默认 01_raw/papers_latest.md。
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const topic = searchParams.get("topic");
  const pathParam = searchParams.get("path") || DEFAULT_PATH;

  if (!topic || !isSafeTopic(topic)) {
    return NextResponse.json({ error: "Missing or invalid topic" }, { status: 400 });
  }

  const repoRoot = getRepoRoot();
  const topicDir = path.join(repoRoot, "outputs", topic);
  const resolved = resolveUnder(topicDir, pathParam);
  if (!resolved || !resolved.endsWith(".md")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  if (!fs.existsSync(resolved)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  let raw: string;
  try {
    raw = fs.readFileSync(resolved, "utf-8");
  } catch {
    return NextResponse.json({ error: "Could not read file" }, { status: 500 });
  }
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);

  const { total, missingAbstract } = parseRawPapersTable(raw);
  return NextResponse.json({ total, missingAbstract });
}
