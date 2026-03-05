import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { getJobsDir } from "@/lib/jobsDir";

const JOB_ID_REGEX = /^job_[a-z0-9_]+$/;

/** 收集 archive/ 及 archive/retired/ 下已归档的任务 ID */
function getArchivedJobIds(jobsDir: string): Set<string> {
  const archiveBase = path.join(jobsDir, "archive");
  const ids = new Set<string>();
  if (!fs.existsSync(archiveBase)) return ids;
  const subdirs = fs.readdirSync(archiveBase, { withFileTypes: true }).filter((d) => d.isDirectory());
  for (const d of subdirs) {
    const dirPath = path.join(archiveBase, d.name);
    for (const name of fs.readdirSync(dirPath)) {
      const m = name.match(/^(job_[a-z0-9_]+)\.(log|meta\.json)$/);
      if (m && JOB_ID_REGEX.test(m[1])) ids.add(m[1]);
    }
  }
  return ids;
}

/** 常驻日志里每个任务块的正则：从 "====== job_xxx started ======" 到 "====== job_xxx finished ... ======" */
const SESSION_BLOCK_REGEX = /\n====== (job_[a-z0-9_]+) started ======\n[\s\S]*?====== \1 finished [^\n]*\n/g;

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

/** POST /api/logs/session — 仅清除已归档任务对应的运行日志，未归档的近期日志保留 */
export async function POST(_request: Request) {
  try {
    const jobsDir = getJobsDir();
    fs.mkdirSync(jobsDir, { recursive: true });
    const sessionPath = path.join(jobsDir, "session.log");
    const archivedIds = getArchivedJobIds(jobsDir);
    let content = "";
    if (fs.existsSync(sessionPath)) {
      content = fs.readFileSync(sessionPath, "utf-8");
    }
    if (archivedIds.size > 0) {
      content = content.replace(SESSION_BLOCK_REGEX, (match, jobId: string) =>
        archivedIds.has(jobId) ? "" : match
      );
      content = content.replace(/\n{3,}/g, "\n\n").trimStart();
    }
    fs.writeFileSync(sessionPath, content, "utf-8");
    return NextResponse.json({ ok: true, cleared: archivedIds.size > 0 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Clear failed" },
      { status: 500 }
    );
  }
}
