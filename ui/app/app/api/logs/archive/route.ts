import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { getJobsDir } from "@/lib/jobsDir";

const JOB_ID_REGEX = /^job_[a-z0-9_]+$/;
const DEFAULT_OLDER_THAN_DAYS = 3;

/** POST /api/logs/archive — 将超过 N 天的任务日志移动到 archive/YYYY-MM/，便于主目录只保留近期日志 */
export async function POST(request: Request) {
  let body: { olderThanDays?: number } = {};
  try {
    if (request.headers.get("content-type")?.includes("application/json")) {
      body = await request.json();
    }
  } catch {
    // empty body ok
  }
  const olderThanDays = Math.max(1, Math.min(365, body.olderThanDays ?? DEFAULT_OLDER_THAN_DAYS));
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;

  const jobsDir = getJobsDir();
  if (!fs.existsSync(jobsDir)) {
    return NextResponse.json({ archived: 0, message: "No jobs dir" });
  }

  const names = fs.readdirSync(jobsDir);
  const jobIds = new Set<string>();
  for (const name of names) {
    const m = name.match(/^(job_[a-z0-9_]+)\.(log|meta\.json)$/);
    if (m && JOB_ID_REGEX.test(m[1])) jobIds.add(m[1]);
  }

  let archived = 0;
  const archiveBase = path.join(jobsDir, "archive");

  for (const jobId of jobIds) {
    const logPath = path.join(jobsDir, `${jobId}.log`);
    const metaPath = path.join(jobsDir, `${jobId}.meta.json`);
    let mtime = 0;
    if (fs.existsSync(logPath)) mtime = Math.max(mtime, fs.statSync(logPath).mtimeMs);
    if (fs.existsSync(metaPath)) mtime = Math.max(mtime, fs.statSync(metaPath).mtimeMs);
    if (mtime === 0 || mtime > cutoff) continue;

    const yyyyMm = new Date(mtime).toISOString().slice(0, 7);
    const destDir = path.join(archiveBase, yyyyMm);
    fs.mkdirSync(destDir, { recursive: true });

    for (const ext of [".log", ".meta.json"]) {
      const src = path.join(jobsDir, `${jobId}${ext}`);
      const dest = path.join(destDir, `${jobId}${ext}`);
      if (fs.existsSync(src)) {
        try {
          fs.renameSync(src, dest);
          archived++;
        } catch (e) {
          return NextResponse.json(
            { error: e instanceof Error ? e.message : "Archive failed" },
            { status: 500 }
          );
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    archived,
    olderThanDays,
    message: archived > 0 ? `已归档 ${archived} 个文件到 archive/` : "没有需要归档的日志",
  });
}
