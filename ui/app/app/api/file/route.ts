import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { getRepoRoot, resolveUnder, safeReadFile } from "@/lib/pathSafety";

/** GET /api/file?source=mock|outputs&path=<topic>/stage/file.md&download=1 — 只读，防 path traversal；download=1 时以附件形式返回 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source") || "mock";
  const relativePath = searchParams.get("path");
  const download = searchParams.get("download") === "1";

  if (!relativePath || typeof relativePath !== "string") {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  const repoRoot = getRepoRoot();
  const baseDir =
    source === "outputs"
      ? path.join(repoRoot, "outputs")
      : path.join(repoRoot, "ui", "mock");

  const resolved = resolveUnder(baseDir, relativePath);
  if (!resolved) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const content = safeReadFile(resolved, baseDir);
  if (content === null) {
    return NextResponse.json({ error: "File not found or unreadable" }, { status: 404 });
  }

  const fileName = path.basename(resolved);
  const headers: Record<string, string> = {
    "Content-Type": "text/markdown; charset=utf-8",
  };
  if (download) {
    const encoded = encodeURIComponent(fileName);
    headers["Content-Disposition"] = `attachment; filename*=UTF-8''${encoded}`;
  }

  return new NextResponse(content, { headers });
}
