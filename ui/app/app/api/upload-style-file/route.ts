import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { getRepoRoot } from "@/lib/pathSafety";

const REPO_ROOT = getRepoRoot();
/** 用户从 UI 上传的写作样本保存到 paper-writing 的 assets 下，按风格分目录：academic | colloquial */
const ASSETS_BASE = path.join(
  REPO_ROOT,
  ".claude/skills/paper-writing/assets"
);

const ALLOWED_EXT = [".pdf", ".docx"];

/** POST /api/upload-style-file — multipart: file, style (academic|colloquial)。保存到 .claude/skills/paper-writing/assets/<style>/，返回 { savedFileName, style } */
export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  const styleRaw = formData.get("style");
  const style =
    styleRaw === "colloquial"
      ? "colloquial"
      : "academic";

  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "请上传文件（file）" },
      { status: 400 }
    );
  }

  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) {
    return NextResponse.json(
      { error: "仅支持 .pdf 与 .docx" },
      { status: 400 }
    );
  }

  const nameRaw = formData.get("name");
  let baseName: string;
  if (typeof nameRaw === "string" && nameRaw.trim()) {
    baseName = nameRaw.trim().replace(/[^a-zA-Z0-9_.-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").slice(0, 100) || "unnamed";
  } else {
    baseName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
  const safeName = baseName.endsWith(ext) ? baseName : baseName + ext;
  const dir = path.join(ASSETS_BASE, style);
  fs.mkdirSync(dir, { recursive: true });
  const destPath = path.join(dir, safeName);
  if (fs.existsSync(destPath)) {
    return NextResponse.json(
      { error: "该名称已存在，请换一个名称或留空使用自动命名" },
      { status: 409 }
    );
  }

  const bytes = await file.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(bytes));

  return NextResponse.json({
    savedFileName: safeName,
    style,
  });
}
