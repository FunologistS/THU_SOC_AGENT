import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { getRepoRoot } from "@/lib/pathSafety";

const DOC_FILENAME = "常见错误与处理.md";

/**
 * GET /api/docs/troubleshooting
 * 返回 docs/常见错误与处理.md 的正文，供 UI 帮助弹窗展示。
 */
export async function GET() {
  try {
    const repoRoot = getRepoRoot();
    const docPath = path.join(repoRoot, "docs", DOC_FILENAME);
    if (!fs.existsSync(docPath)) {
      return NextResponse.json(
        { error: "Document not found", path: "docs/" + DOC_FILENAME },
        { status: 404 }
      );
    }
    const content = fs.readFileSync(docPath, "utf-8");
    return NextResponse.json({ content });
  } catch (e) {
    console.error("[docs/troubleshooting]", e);
    return NextResponse.json(
      { error: "Failed to read document" },
      { status: 500 }
    );
  }
}
