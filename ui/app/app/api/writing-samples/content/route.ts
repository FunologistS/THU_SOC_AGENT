import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { getRepoRoot } from "@/lib/pathSafety";

const REPO_ROOT = getRepoRoot();
const ASSETS_BASE = path.join(REPO_ROOT, ".claude/skills/paper-writing/assets");
const SUBMIT_BASE = path.join(REPO_ROOT, ".claude/skills/paper-writing/references/submit");
const REFERENCES_BASE = path.join(REPO_ROOT, ".claude/skills/paper-writing/references");

const SAFE_MD_NAME = /^[a-z0-9_.-]+\.md$/i;

/**
 * GET /api/writing-samples/content?style=academic|colloquial&fileName=xxx&source=submit|assets|reference
 * 返回写作样例正文，供 UI 内查看。仅支持 .md 文件。
 * - source=submit: references/submit/<style>/
 * - source=assets: 不支持（assets 仅 pdf/docx），返回 400
 * - source=reference: references/<style>/（内置默认样例）
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const style = searchParams.get("style") === "colloquial" ? "colloquial" : "academic";
  const source = searchParams.get("source")?.toLowerCase() ?? "submit";
  const fileName = searchParams.get("fileName")?.trim() ?? "";

  if (!fileName || !SAFE_MD_NAME.test(fileName)) {
    return NextResponse.json({ error: "Invalid or missing fileName (only .md allowed)" }, { status: 400 });
  }

  let filePath: string;
  if (source === "reference") {
    filePath = path.join(REFERENCES_BASE, style, fileName);
  } else if (source === "submit") {
    filePath = path.join(SUBMIT_BASE, style, fileName);
  } else if (source === "assets") {
    return NextResponse.json({ error: "assets 仅包含 pdf/docx，请使用 source=submit 或 reference 查看 .md" }, { status: 400 });
  } else {
    return NextResponse.json({ error: "Invalid source (submit | reference)" }, { status: 400 });
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  try {
    const content = fs.readFileSync(filePath, "utf8");
    return NextResponse.json({ content });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
