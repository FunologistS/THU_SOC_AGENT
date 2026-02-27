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

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
    child.on("error", (err) => {
      resolve({
        code: 1,
        stdout,
        stderr: stderr + `\n${err instanceof Error ? err.message : String(err)}`,
      });
    });
  });
}

/** POST /api/git-save — 一键 git add + commit 当前仓库改动（不执行 push） */
export async function POST() {
  // 1. 查看是否有未提交改动
  const status = await runGit(["status", "--porcelain=v1"]);
  if (status.code !== 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "git status 执行失败",
        detail: status.stderr || status.stdout,
      },
      { status: 500 }
    );
  }

  if (!status.stdout.trim()) {
    return NextResponse.json({
      ok: true,
      committed: false,
      message: "当前没有需要保存的改动。",
    });
  }

  // 2. git add -A
  const added = await runGit(["add", "-A"]);
  if (added.code !== 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "git add 失败",
        detail: added.stderr || added.stdout,
      },
      { status: 500 }
    );
  }

  // 3. git commit -m "<自动信息>"
  const now = new Date();
  const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes()
  ).padStart(2, "0")}`;
  const message = `chore: UI 一键保存 (${ts})`;

  const committed = await runGit(["commit", "-m", message]);

  if (committed.code !== 0) {
    const combinedOutput = (committed.stderr + "\n" + committed.stdout).trim();
    // 没有可提交改动时，git 也可能返回非 0；这里做一次宽松处理
    if (/nothing to commit/i.test(combinedOutput)) {
      return NextResponse.json({
        ok: true,
        committed: false,
        message: "没有可提交的改动。",
      });
    }

    return NextResponse.json(
      {
        ok: false,
        error: "git commit 失败",
        detail: combinedOutput,
      },
      { status: 500 }
    );
  }

  // 4. 获取最新短 hash（可选）
  const rev = await runGit(["rev-parse", "--short", "HEAD"]);
  const hash =
    rev.code === 0 ? rev.stdout.trim() || undefined : undefined;

  return NextResponse.json({
    ok: true,
    committed: true,
    message: "已完成 git 一键保存（未执行 push）。",
    commitMessage: message,
    commitHash: hash,
  });
}

