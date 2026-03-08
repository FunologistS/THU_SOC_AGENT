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

/** POST /api/git-push — 将当前分支推送到远程。若尚未设置 upstream，会先执行 git push -u origin <当前分支>。 */
export async function POST() {
  const branchResult = await runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branchResult.code !== 0 || !branchResult.stdout.trim()) {
    return NextResponse.json(
      { ok: false, error: "无法获取当前分支", detail: branchResult.stderr || branchResult.stdout },
      { status: 500 }
    );
  }
  const branch = branchResult.stdout.trim();

  const remoteResult = await runGit(["remote"]);
  if (remoteResult.code !== 0 || !remoteResult.stdout.trim()) {
    return NextResponse.json(
      {
        ok: false,
        error: "未配置远程仓库",
        detail: "请先在终端执行：git remote add origin <你的 GitHub 仓库 URL>",
      },
      { status: 400 }
    );
  }

  let pushResult = await runGit(["push"]);

  if (pushResult.code !== 0 && /has no upstream branch|no upstream|set-upstream|set_upstream/i.test(pushResult.stderr)) {
    pushResult = await runGit(["push", "-u", "origin", branch]);
  }

  if (pushResult.code !== 0) {
    const detail = (pushResult.stderr + "\n" + pushResult.stdout).trim();
    const hint = /Authentication failed|Permission denied|Could not read from remote|invalid credentials/i.test(detail)
      ? "请检查远程地址与认证（HTTPS 需使用 Personal Access Token 作为密码）。"
      : undefined;
    return NextResponse.json(
      {
        ok: false,
        error: "推送失败",
        detail: detail || "未知错误",
        hint,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    pushed: true,
    message: "已推送到远程。",
    branch,
  });
}
