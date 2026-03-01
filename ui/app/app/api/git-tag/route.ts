import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { getRepoRoot } from "@/lib/pathSafety";

type GitResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

function runGit(args: string[]): Promise<GitResult> {
  const cwd = getRepoRoot();
  return new Promise((resolve) => {
    const child = spawn("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.on("error", () => resolve({ code: 1, stdout, stderr }));
  });
}

/** 合法的 tag 名：字母数字、点、横线、下划线，不含空格 */
const TAG_NAME_REGEX = /^[a-zA-Z0-9._\u4e00-\u9fa5-]+$/;

/** POST /api/git-tag — 打 tag（版本命名）。body: { tag: string, hash?: string, replaceTag?: string }；hash 不传则对 HEAD 打 tag；replaceTag 为已有 tag 名时先删除再打新 tag（重命名） */
export async function POST(req: Request) {
  let body: { tag?: string; hash?: string; replaceTag?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体无效" }, { status: 400 });
  }
  const tag = typeof body.tag === "string" ? body.tag.trim() : "";
  const hash = typeof body.hash === "string" ? body.hash.trim() : undefined;
  const replaceTag = typeof body.replaceTag === "string" ? body.replaceTag.trim() : undefined;
  if (!tag) {
    return NextResponse.json({ ok: false, error: "请填写版本名称" }, { status: 400 });
  }
  if (!TAG_NAME_REGEX.test(tag) || tag.length > 80) {
    return NextResponse.json(
      { ok: false, error: "版本名仅允许字母、数字、点、横线、下划线，且不超过 80 字" },
      { status: 400 }
    );
  }

  if (replaceTag) {
    const deleted = await runGit(["tag", "-d", replaceTag]);
    if (deleted.code !== 0 && !/not found/i.test((deleted.stderr + deleted.stdout).trim())) {
      return NextResponse.json(
        { ok: false, error: "删除旧版本名失败", detail: (deleted.stderr + "\n" + deleted.stdout).trim() },
        { status: 500 }
      );
    }
  }

  const ref = hash || "HEAD";
  const created = await runGit(["tag", "-a", tag, ref, "-m", `版本: ${tag}`]);
  if (created.code !== 0) {
    const msg = (created.stderr + "\n" + created.stdout).trim();
    if (/already exists/i.test(msg)) {
      return NextResponse.json({ ok: false, error: "该版本名已存在，请换一个" }, { status: 400 });
    }
    return NextResponse.json(
      { ok: false, error: "打 tag 失败", detail: msg },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, tag });
}
