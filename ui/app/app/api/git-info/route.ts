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
    child.on("error", () => {
      resolve({ code: 1, stdout, stderr });
    });
  });
}

/** GET /api/git-info — 返回最近一次 commit 的时间（ISO 8601），用于底部显示北京时间 */
export async function GET() {
  const log = await runGit(["log", "-1", "--format=%cI"]);
  if (log.code !== 0 || !log.stdout.trim()) {
    return NextResponse.json({ ok: false, lastCommitIso: null });
  }
  const lastCommitIso = log.stdout.trim();
  return NextResponse.json({ ok: true, lastCommitIso });
}
