import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { getJobsDir } from "@/lib/jobsDir";

const JOB_ID_REGEX = /^job_[a-z0-9_]+$/;

export interface JobLogEntry {
  jobId: string;
  mtime: number;
  mtimeIso: string;
  sizeLog: number;
  sizeMeta: number;
  done: boolean;
}

/** GET /api/logs/jobs — 列出所有任务日志（仅当前目录，不含 archive） */
export async function GET() {
  const jobsDir = getJobsDir();
  if (!fs.existsSync(jobsDir)) {
    return NextResponse.json({ jobs: [] });
  }

  const names = fs.readdirSync(jobsDir);
  const jobIds = new Set<string>();
  for (const name of names) {
    const m = name.match(/^(job_[a-z0-9_]+)\.(log|meta\.json)$/);
    if (m && JOB_ID_REGEX.test(m[1])) jobIds.add(m[1]);
  }

  const jobs: JobLogEntry[] = [];
  for (const jobId of jobIds) {
    const logPath = path.join(jobsDir, `${jobId}.log`);
    const metaPath = path.join(jobsDir, `${jobId}.meta.json`);
    let mtime = 0;
    let sizeLog = 0;
    let sizeMeta = 0;
    let done = false;
    if (fs.existsSync(logPath)) {
      const s = fs.statSync(logPath);
      mtime = Math.max(mtime, s.mtimeMs);
      sizeLog = s.size;
    }
    if (fs.existsSync(metaPath)) {
      const s = fs.statSync(metaPath);
      mtime = Math.max(mtime, s.mtimeMs);
      sizeMeta = s.size;
      done = true;
    }
    if (mtime > 0) {
      jobs.push({
        jobId,
        mtime,
        mtimeIso: new Date(mtime).toISOString(),
        sizeLog,
        sizeMeta,
        done,
      });
    }
  }

  jobs.sort((a, b) => b.mtime - a.mtime);
  return NextResponse.json({ jobs });
}
