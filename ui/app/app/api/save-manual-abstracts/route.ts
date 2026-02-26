import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { getRepoRoot, isSafeTopic } from "@/lib/pathSafety";

function todayYYYYMMDD(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${dd}`;
}

/** 在 03_summaries 目录下生成下一个版本文件名 summaries_YYYYMMDD_vN.md */
function nextVersionedSummariesPath(dir: string): string {
  const prefix = `summaries_${todayYYYYMMDD()}_v`;
  const existing = fs.readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith(".md"));
  let maxN = 0;
  for (const f of existing) {
    const m = f.match(/_v(\d+)\.md$/);
    if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
  }
  return path.join(dir, `${prefix}${maxN + 1}.md`);
}

/**
 * 替换单个 block 中的 Key findings 为给定内容并追加 [MANUAL]
 * block 以 ## N. 开始，到下一个 --- 或文件结尾
 */
function replaceKeyFindingsInBlock(
  block: string,
  newAbstract: string
): string {
  const manualSuffix = " [MANUAL]";
  const newContent = newAbstract.trim() + manualSuffix;
  const re = /(\*\*Key findings \(from abstract\)\*\*:\s*)([\s\S]*?)(?=\n\*\*|\n---|$)/i;
  return block.replace(re, (_, prefix) => `${prefix}${newContent}\n\n`);
}

/**
 * 将全文按 --- 拆成块，只替换指定 idx 的块中的 Key findings，再拼回
 */
function patchSummariesContent(
  md: string,
  entries: { idx: number; abstract: string }[]
): string {
  const byIdx = new Map(entries.map((e) => [e.idx, e.abstract]));
  const blocks = md.split(/\n---\s*\n/);
  const out: string[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const idxMatch = block.match(/^##\s+(\d+)\./m);
    const idx = idxMatch ? parseInt(idxMatch[1], 10) : 0;
    const abstract = byIdx.get(idx);
    if (abstract !== undefined) {
      out.push(replaceKeyFindingsInBlock(block, abstract));
    } else {
      out.push(block);
    }
  }
  return out.join("\n---\n\n");
}

/** POST /api/save-manual-abstracts — body: { topic, entries: [ { idx, abstract } ] }，写回新版本并更新 summaries_latest.md */
export async function POST(request: Request) {
  let body: { topic?: string; entries?: { idx: number; abstract: string }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { topic, entries } = body;
  if (!topic || !isSafeTopic(topic)) {
    return NextResponse.json({ error: "Invalid or missing topic" }, { status: 400 });
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json(
      { error: "entries must be a non-empty array of { idx, abstract }" },
      { status: 400 }
    );
  }

  const repoRoot = getRepoRoot();
  const dir = path.join(repoRoot, "outputs", topic, "03_summaries");
  const latestPath = path.join(dir, "summaries_latest.md");

  if (!fs.existsSync(latestPath)) {
    return NextResponse.json(
      { error: "No summaries_latest.md found. Run 清洗规整 first." },
      { status: 404 }
    );
  }

  let md: string;
  try {
    md = fs.readFileSync(latestPath, "utf-8");
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to read summaries file" },
      { status: 500 }
    );
  }

  const patched = patchSummariesContent(md, entries);
  const versionedPath = nextVersionedSummariesPath(dir);

  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(versionedPath, patched, "utf-8");
    fs.writeFileSync(latestPath, patched, "utf-8");
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to write file: " + (e instanceof Error ? e.message : String(e)) },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    topic,
    versionedFile: path.basename(versionedPath),
    message: "已保存为新版本（手动补录），已更新 summaries_latest.md。",
  });
}
