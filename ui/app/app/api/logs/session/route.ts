import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { getJobsDir } from "@/lib/jobsDir";

/** GET /api/logs/session — 读取常驻运行日志（追加式，不覆盖） */
export async function GET() {
  try {
    const jobsDir = getJobsDir();
    const sessionPath = path.join(jobsDir, "session.log");
    let content = "";
    try {
      if (fs.existsSync(sessionPath)) {
        content = fs.readFileSync(sessionPath, "utf-8");
      }
    } catch {
      // existsSync/readFileSync 可能因权限或路径问题抛错
    }
    return NextResponse.json({ content });
  } catch {
    return NextResponse.json({ content: "" });
  }
}

/** POST /api/logs/session — 清空常驻运行日志 */
export async function POST(_request: Request) {
  try {
    const jobsDir = getJobsDir();
    fs.mkdirSync(jobsDir, { recursive: true });
    const sessionPath = path.join(jobsDir, "session.log");
    fs.writeFileSync(sessionPath, "", "utf-8");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Clear failed" },
      { status: 500 }
    );
  }
}
