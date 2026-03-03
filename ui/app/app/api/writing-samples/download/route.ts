import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { getRepoRoot } from "@/lib/pathSafety";

const REPO_ROOT = getRepoRoot();
const ASSETS_BASE = path.join(REPO_ROOT, ".claude/skills/paper-writing/assets");
const SUBMIT_BASE = path.join(REPO_ROOT, ".claude/skills/paper-writing/references/submit");
const SAFE_NAME = /^[a-z0-9_.-]+\.(pdf|docx)$/i;
const SAFE_MD_NAME = /^[a-z0-9_.-]+\.md$/i;

/** GET /api/writing-samples/download?style=academic|colloquial&fileName=xxx&source=assets|submit — 导出下载 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const style = searchParams.get("style") === "colloquial" ? "colloquial" : "academic";
  const source = searchParams.get("source") === "submit" ? "submit" : "assets";
  const fileName = searchParams.get("fileName")?.trim() ?? "";
  const isMd = fileName.endsWith(".md");
  if (!fileName) {
    return NextResponse.json({ error: "Invalid fileName" }, { status: 400 });
  }
  if (source === "submit") {
    if (!SAFE_MD_NAME.test(fileName)) {
      return NextResponse.json({ error: "Invalid fileName for submit (only .md)" }, { status: 400 });
    }
  } else if (!SAFE_NAME.test(fileName)) {
    return NextResponse.json({ error: "Invalid fileName" }, { status: 400 });
  }
  const baseDir = source === "submit" ? SUBMIT_BASE : ASSETS_BASE;
  const filePath = path.join(baseDir, style, fileName);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
  const buf = fs.readFileSync(filePath);
  const contentType =
    isMd ? "text/markdown" : fileName.endsWith(".pdf") ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return new NextResponse(buf, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
    },
  });
}
