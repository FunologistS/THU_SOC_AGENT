import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { getRepoRoot, isSafeTopic } from "@/lib/pathSafety";

/** 仅允许 .md 且无 path traversal */
function safeFileName(name: string): boolean {
  if (!name || name.length > 200) return false;
  if (!/\.md$/i.test(name)) return false;
  if (name.includes("..") || /[<>:"|?*]/.test(name)) return false;
  return true;
}

/**
 * POST /api/rename-file
 * Body: { path: "topic/stage/file.md", newName: "file2.md" }
 * 仅允许 outputs 下、同目录内重命名。
 */
export async function POST(request: Request) {
  let body: { path?: string; newName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const relativePath = body?.path;
  const newName = body?.newName?.trim();
  if (!relativePath || typeof relativePath !== "string" || !newName || !safeFileName(newName)) {
    return NextResponse.json(
      { error: "Missing or invalid path/newName (must be *.md in same directory)" },
      { status: 400 }
    );
  }

  const repoRoot = getRepoRoot();
  const outputsBase = path.join(repoRoot, "outputs");
  const resolved = path.resolve(outputsBase, relativePath);
  if (!resolved.startsWith(outputsBase) || resolved === outputsBase) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const dir = path.dirname(resolved);
  const parentRel = path.relative(outputsBase, dir);
  const parts = parentRel.split(path.sep);
  if (parts.length < 2 || !isSafeTopic(parts[0])) {
    return NextResponse.json({ error: "Path must be topic/stage/..." }, { status: 400 });
  }

  if (!fs.existsSync(resolved)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) {
    return NextResponse.json({ error: "Not a file" }, { status: 400 });
  }

  const newPath = path.join(dir, newName);
  if (fs.existsSync(newPath)) {
    return NextResponse.json({ error: "目标文件名已存在" }, { status: 400 });
  }

  try {
    fs.renameSync(resolved, newPath);
    const newRel = path.relative(outputsBase, newPath).replace(/\\/g, "/");
    return NextResponse.json({ ok: true, path: newRel });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `重命名失败: ${msg}` }, { status: 500 });
  }
}
