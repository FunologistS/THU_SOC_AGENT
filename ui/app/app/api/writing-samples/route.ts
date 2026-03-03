import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { getRepoRoot } from "@/lib/pathSafety";

const REPO_ROOT = getRepoRoot();
const ASSETS_BASE = path.join(REPO_ROOT, ".claude/skills/paper-writing/assets");
const SUBMIT_BASE = path.join(REPO_ROOT, ".claude/skills/paper-writing/references/submit");

const SAFE_NAME = /^[a-z0-9_.-]+\.(pdf|docx)$/i;
const SAFE_MD_NAME = /^[a-z0-9_.-]+\.md$/i;

function listDir(style: "academic" | "colloquial") {
  const dir = path.join(ASSETS_BASE, style);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  return fs.readdirSync(dir)
    .filter((n) => n.endsWith(".pdf") || n.endsWith(".docx"))
    .map((name) => ({
      name,
      size: fs.statSync(path.join(dir, name)).size,
    }));
}

function listSubmitMd(style: "academic" | "colloquial") {
  const dir = path.join(SUBMIT_BASE, style);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  return fs.readdirSync(dir)
    .filter((n) => n.endsWith(".md") && SAFE_MD_NAME.test(n))
    .map((name) => ({
      name,
      size: fs.statSync(path.join(dir, name)).size,
    }));
}

/** GET /api/writing-samples — 返回 { academic, colloquial, submitMd: { academic, colloquial } } */
export async function GET() {
  try {
    const academic = listDir("academic");
    const colloquial = listDir("colloquial");
    const submitMd = {
      academic: listSubmitMd("academic"),
      colloquial: listSubmitMd("colloquial"),
    };
    return NextResponse.json({ academic, colloquial, submitMd });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** DELETE /api/writing-samples — body: { style: "academic"|"colloquial", fileName: string } */
export async function DELETE(request: Request) {
  let body: { style?: string; fileName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const style = body?.style === "colloquial" ? "colloquial" : "academic";
  const fileName = typeof body?.fileName === "string" ? body.fileName.trim() : "";
  if (!fileName || !SAFE_NAME.test(fileName)) {
    return NextResponse.json({ error: "Invalid or missing fileName" }, { status: 400 });
  }
  const filePath = path.join(ASSETS_BASE, style, fileName);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
  try {
    fs.unlinkSync(filePath);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** PATCH /api/writing-samples — body: { style, oldName, newName } 重命名 */
export async function PATCH(request: Request) {
  let body: { style?: string; oldName?: string; newName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const style = body?.style === "colloquial" ? "colloquial" : "academic";
  const oldName = typeof body?.oldName === "string" ? body.oldName.trim() : "";
  const newName = typeof body?.newName === "string" ? body.newName.trim() : "";
  if (!oldName || !SAFE_NAME.test(oldName) || !newName || !SAFE_NAME.test(newName)) {
    return NextResponse.json({ error: "Invalid oldName or newName (e.g. name.pdf / name.docx)" }, { status: 400 });
  }
  const ext = path.extname(oldName).toLowerCase();
  if (path.extname(newName).toLowerCase() !== ext) {
    return NextResponse.json({ error: "newName must keep same extension" }, { status: 400 });
  }
  const oldPath = path.join(ASSETS_BASE, style, oldName);
  const newPath = path.join(ASSETS_BASE, style, newName);
  if (!fs.existsSync(oldPath) || !fs.statSync(oldPath).isFile()) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
  if (fs.existsSync(newPath)) {
    return NextResponse.json({ error: "Target name already exists" }, { status: 409 });
  }
  try {
    fs.renameSync(oldPath, newPath);
    return NextResponse.json({ ok: true, fileName: newName });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
