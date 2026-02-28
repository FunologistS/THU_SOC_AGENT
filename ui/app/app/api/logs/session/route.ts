import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";

function getJobsDir(): string {
  const appDir = process.cwd();
  const uiDir = path.dirname(appDir);
  return path.join(uiDir, ".tmp", "jobs");
}

/** GET /api/logs/session — 读取常驻运行日志（追加式，不覆盖） */
export async function GET() {
  const jobsDir = getJobsDir();
  const sessionPath = path.join(jobsDir, "session.log");
  let content = "";
  if (fs.existsSync(sessionPath)) {
    try {
      content = fs.readFileSync(sessionPath, "utf-8");
    } catch {
      // empty
    }
  }
  return NextResponse.json({ content });
}

/** POST /api/logs/session — 清空常驻运行日志 */
export async function POST(request: Request) {
  const jobsDir = getJobsDir();
  fs.mkdirSync(jobsDir, { recursive: true });
  const sessionPath = path.join(jobsDir, "session.log");
  try {
    fs.writeFileSync(sessionPath, "", "utf-8");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Clear failed" },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
