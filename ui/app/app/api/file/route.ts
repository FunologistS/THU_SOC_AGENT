import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { getRepoRoot, resolveUnder, safeReadFile } from "@/lib/pathSafety";

/** GET /api/file?source=mock|outputs&path=<topic>/stage/file.md — 只读，防 path traversal */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source") || "mock";
  const relativePath = searchParams.get("path");

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

  return new NextResponse(content, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
