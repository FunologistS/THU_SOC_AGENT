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

/** 将 ISO 时间格式化为北京时间（到分钟） */
function toBeijingMinute(iso: string): string {
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

const SAVE_MSG_PREFIX = "chore: UI 一键保存";

/** GET /api/git-history — 返回「一键保存」的提交历史（北京时间到分钟 + 版本名 tag） */
export async function GET() {
  const log = await runGit(["log", "-n", "80", "--format=%H %cI %s"]);
  if (log.code !== 0) {
    return NextResponse.json({ ok: false, saves: [] });
  }
  const lines = log.stdout.trim().split("\n").filter(Boolean);
  const saves: { hash: string; dateBeijing: string; tag?: string }[] = [];
  const hashToTag = new Map<string, string>();

  const tagList = await runGit(["tag", "-l"]);
  if (tagList.code === 0 && tagList.stdout.trim()) {
    const tags = tagList.stdout.trim().split("\n").filter(Boolean);
    for (const tag of tags) {
      const rev = await runGit(["rev-parse", "--verify", `${tag}^{commit}`]);
      if (rev.code === 0 && rev.stdout.trim()) hashToTag.set(rev.stdout.trim(), tag);
    }
  }

  for (const line of lines) {
    const firstSpace = line.indexOf(" ");
    const secondSpace = line.indexOf(" ", firstSpace + 1);
    if (firstSpace < 0 || secondSpace < 0) continue;
    const hash = line.slice(0, firstSpace);
    const dateIso = line.slice(firstSpace + 1, secondSpace);
    const subject = line.slice(secondSpace + 1);
    if (!subject.includes(SAVE_MSG_PREFIX)) continue;
    saves.push({
      hash,
      dateBeijing: toBeijingMinute(dateIso),
      tag: hashToTag.get(hash) ?? undefined,
    });
  }

  return NextResponse.json({ ok: true, saves });
}
