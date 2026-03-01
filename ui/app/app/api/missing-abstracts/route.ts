import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { getRepoRoot, isSafeTopic } from "@/lib/pathSafety";

/** 判断摘要是否视为“缺失”（需手填） */
function isEmptyOrNoAbstract(text: string): boolean {
  const t = String(text ?? "").trim();
  if (!t) return true;
  if (/^(no usable abstract|n\/a|none|unknown)\.?$/i.test(t)) return true;
  if (t.length < 20) return true;
  return false;
}

/** 从 summaries 全文解析出各条块，并标记缺摘要的条目 */
function parseSummariesBlocks(md: string): {
  idx: number;
  title: string;
  year: string | null;
  authors: string;
  doi: string;
  openalex: string;
  keyFindings: string;
  isManual: boolean;
  missing: boolean;
}[] {
  const blocks = md.split(/\n---\s*\n/).filter((b) => /^\s*##\s+\d+\./.test(b));
  const result: {
    idx: number;
    title: string;
    year: string | null;
    authors: string;
    doi: string;
    openalex: string;
    keyFindings: string;
    isManual: boolean;
    missing: boolean;
  }[] = [];

  for (const block of blocks) {
    const idxMatch = block.match(/^##\s+(\d+)\.\s+(.+?)\s*\((\d{4}|NA)\)/m);
    const idx = idxMatch ? parseInt(idxMatch[1], 10) : 0;
    const title = idxMatch ? idxMatch[2].trim() : "";
    const year = idxMatch ? idxMatch[3] : null;

    const authors =
      block.match(/^-\s*Author\(s\):\s*(.+)$/m)?.[1]?.trim() ??
      block.match(/^-\s*Authors?:\s*(.+)$/m)?.[1]?.trim() ??
      "";
    const doi =
      block.match(/^-\s*DOI:\s*(.+)$/m)?.[1]?.trim() ?? "";
    const openalex =
      block.match(/^-\s*OpenAlex:\s*(.+)$/m)?.[1]?.trim() ?? "";

    const kfMatch = block.match(
      /\*\*Key findings \(from abstract\)\*\*:\s*([\s\S]*?)(?=\n\*\*|\n---|$)/i
    );
    const keyFindings = (kfMatch ? kfMatch[1].trim() : "").replace(/\s*\[MANUAL\]\s*$/i, "").trim();
    const isManual = /\[MANUAL\]/i.test(block);

    result.push({
      idx,
      title,
      year: year === "NA" ? null : year,
      authors,
      doi,
      openalex,
      keyFindings,
      isManual,
      missing: isEmptyOrNoAbstract(keyFindings),
    });
  }
  return result;
}

/** 允许的摘要文件名：当前使用或版本号格式 */
function isAllowedSummariesFile(name: string): boolean {
  return (
    name === "summaries_latest.md" || /^summaries_\d{8}_v\d+\.md$/.test(name)
  );
}

/** GET /api/missing-abstracts?topic=...&file=... — 返回 03_summaries 中缺摘要的条目列表；file 可选，指定则读该版本文件 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const topic = searchParams.get("topic");
  const fileParam = searchParams.get("file");

  if (!topic || !isSafeTopic(topic)) {
    return NextResponse.json({ error: "Invalid or missing topic" }, { status: 400 });
  }

  const repoRoot = getRepoRoot();
  const summariesDir = path.join(repoRoot, "outputs", topic, "03_summaries");
  const fileName =
    fileParam && isAllowedSummariesFile(fileParam) ? fileParam : "summaries_latest.md";
  const summariesPath = path.join(summariesDir, fileName);

  if (!fs.existsSync(summariesPath)) {
    return NextResponse.json(
      { error: "No summaries file found. Run 清洗规整 first." },
      { status: 404 }
    );
  }

  const latestStat = fs.statSync(summariesPath);
  const lastModified = latestStat.mtime.toISOString();

  let latestVersionFile: string | null = null;
  if (fileName === "summaries_latest.md") {
    try {
      const names = fs.readdirSync(summariesDir);
      const versioned = names
        .filter((n) => /^summaries_\d{8}_v\d+\.md$/.test(n))
        .map((n) => ({
          name: n,
          mtime: fs.statSync(path.join(summariesDir, n)).mtime.getTime(),
        }))
        .sort((a, b) => b.mtime - a.mtime);
      const latestTime = latestStat.mtime.getTime();
      const match = versioned.find((v) => Math.abs(v.mtime - latestTime) < 2000);
      if (match) latestVersionFile = match.name;
    } catch {
      // ignore
    }
  }

  let md: string;
  try {
    md = fs.readFileSync(summariesPath, "utf-8");
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to read summaries file" },
      { status: 500 }
    );
  }

  const blocks = parseSummariesBlocks(md);
  const missing = blocks.filter((b) => b.missing);
  const filled = blocks.filter((b) => !b.missing);

  return NextResponse.json({
    topic,
    total: blocks.length,
    sourceFile: fileName,
    lastModified,
    latestVersionFile: latestVersionFile ?? undefined,
    missing: missing.map((b) => ({
      idx: b.idx,
      title: b.title,
      year: b.year,
      authors: b.authors,
      doi: b.doi,
      openalex: b.openalex,
      keyFindings: b.keyFindings,
      isManual: b.isManual,
    })),
    filled: filled.map((b) => ({
      idx: b.idx,
      title: b.title,
      year: b.year,
      authors: b.authors,
      keyFindings: b.keyFindings,
      isManual: b.isManual,
    })),
  });
}
