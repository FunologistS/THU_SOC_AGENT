import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { getRepoRoot } from "@/lib/pathSafety";

const REPO_ROOT = getRepoRoot();
const SCRIPT = path.join(
  REPO_ROOT,
  ".claude/skills/paper-writing/scripts/input_to_md.mjs"
);
const ASSETS_BASE = path.join(
  REPO_ROOT,
  ".claude/skills/paper-writing/assets"
);

const SAFE_FILE_NAME = /^[a-z0-9_.-]+\.(pdf|docx)$/i;

/**
 * POST /api/transcribe-style-file — body: { style: "academic"|"colloquial", fileName: "xxx.pdf" }
 * 将 assets/<style>/<fileName> 转为 Markdown，写入 references/submit/<style>/<base>.md
 */
export async function POST(request: Request) {
  let body: { style?: string; fileName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const style =
    body?.style === "colloquial" ? "colloquial" : "academic";
  const fileName =
    typeof body?.fileName === "string" ? body.fileName.trim() : "";

  if (!fileName || !SAFE_FILE_NAME.test(fileName)) {
    return NextResponse.json(
      { error: "fileName 需为 .pdf 或 .docx 且仅含安全字符" },
      { status: 400 }
    );
  }

  const inputPath = path.join(ASSETS_BASE, style, fileName);
  if (!fs.existsSync(inputPath) || !fs.statSync(inputPath).isFile()) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }

  const baseName = fileName.replace(/\.(pdf|docx)$/i, "");
  const outputRel = `submit/${style}/${baseName}.md`;

  return new Promise<NextResponse>((resolve) => {
    const child = spawn(
      "node",
      [SCRIPT, `${style}/${fileName}`, outputRel],
      {
        cwd: REPO_ROOT,
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
      }
    );

    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    child.stdout?.on("data", (c: Buffer) => chunks.push(c));
    child.stderr?.on("data", (c: Buffer) => errChunks.push(c));

    child.on("close", (code) => {
      if (code === 0) {
        resolve(
          NextResponse.json({
            ok: true,
            outputPath: outputRel,
            message: "已转为 Markdown，一键综述将自动使用该样例",
          })
        );
      } else {
        const stderr = Buffer.concat(errChunks).toString("utf-8");
        resolve(
          NextResponse.json(
            {
              error: stderr || "转录失败",
            },
            { status: 500 }
          )
        );
      }
    });

    child.on("error", (err) => {
      resolve(
        NextResponse.json(
          { error: (err as Error).message || "执行失败" },
          { status: 500 }
        )
      );
    });
  });
}
