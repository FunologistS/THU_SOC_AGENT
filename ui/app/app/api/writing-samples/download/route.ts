import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { getRepoRoot } from "@/lib/pathSafety";

const REPO_ROOT = getRepoRoot();
const ASSETS_BASE = path.join(REPO_ROOT, ".claude/skills/paper-writing/assets");
const SAFE_NAME = /^[a-z0-9_.-]+\.(pdf|docx)$/i;

/** GET /api/writing-samples/download?style=academic|colloquial&fileName=xxx — 导出下载 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const style = searchParams.get("style") === "colloquial" ? "colloquial" : "academic";
  const fileName = searchParams.get("fileName")?.trim() ?? "";
  if (!fileName || !SAFE_NAME.test(fileName)) {
    return NextResponse.json({ error: "Invalid fileName" }, { status: 400 });
  }
  const filePath = path.join(ASSETS_BASE, style, fileName);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
  const buf = fs.readFileSync(filePath);
  return new NextResponse(buf, {
    headers: {
      "Content-Type": fileName.endsWith(".pdf") ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
    },
  });
}
