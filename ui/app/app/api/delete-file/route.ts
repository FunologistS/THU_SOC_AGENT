import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { getRepoRoot, resolveUnder } from "@/lib/pathSafety";

/**
 * POST /api/delete-file
 * Body: { path: "topic/stage/file.md" }
 * 仅允许删除 outputs 下的文件，移至系统废纸篓（可恢复），不永久删除。
 */
export async function POST(request: Request) {
  let body: { path?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const relativePath = body?.path;
  if (!relativePath || typeof relativePath !== "string") {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  const repoRoot = getRepoRoot();
  const outputsBase = path.join(repoRoot, "outputs");
  const resolved = resolveUnder(outputsBase, relativePath);
  if (!resolved) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const stat = fs.statSync(resolved, { throwIfNoEntry: false });
  if (!stat) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
  if (!stat.isFile()) {
    return NextResponse.json({ error: "Not a file" }, { status: 400 });
  }

  try {
    const trash = (await import("trash")).default;
    await trash([resolved]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `移至废纸篓失败: ${msg}` }, { status: 500 });
  }
}
