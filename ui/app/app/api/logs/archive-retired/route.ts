import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { getJobsDir } from "@/lib/jobsDir";

const JOB_ID_REGEX = /^job_[a-z0-9_]+$/;

/**
 * POST /api/logs/archive-retired — 将 archive/retired/ 中的任务按日期移入 archive/YYYY-MM/，
 * 便于与「归档 3 天前」一致，后续可按天数清理 archive 目录。
 */
export async function POST() {
  const jobsDir = getJobsDir();
  const retiredDir = path.join(jobsDir, "archive", "retired");
  if (!fs.existsSync(retiredDir)) {
    return NextResponse.json({ moved: 0, message: "archive/retired/ 为空或不存在" });
  }

  const names = fs.readdirSync(retiredDir);
  const jobIds = new Set<string>();
  for (const name of names) {
    const m = name.match(/^(job_[a-z0-9_]+)\.(log|meta\.json)$/);
    if (m && JOB_ID_REGEX.test(m[1])) jobIds.add(m[1]);
  }

  const archiveBase = path.join(jobsDir, "archive");
  let moved = 0;

  for (const jobId of Array.from(jobIds)) {
    let mtime = 0;
    for (const ext of [".log", ".meta.json"]) {
      const p = path.join(retiredDir, `${jobId}${ext}`);
      if (fs.existsSync(p)) mtime = Math.max(mtime, fs.statSync(p).mtimeMs);
    }
    if (mtime === 0) continue;

    const yyyyMm = new Date(mtime).toISOString().slice(0, 7);
    const destDir = path.join(archiveBase, yyyyMm);
    fs.mkdirSync(destDir, { recursive: true });

    for (const ext of [".log", ".meta.json"]) {
      const src = path.join(retiredDir, `${jobId}${ext}`);
      const dest = path.join(destDir, `${jobId}${ext}`);
      if (fs.existsSync(src)) {
        try {
          fs.renameSync(src, dest);
          moved++;
        } catch (e) {
          return NextResponse.json(
            { error: e instanceof Error ? e.message : "Archive retired failed" },
            { status: 500 }
          );
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    moved,
    message:
      moved > 0
        ? `已将 archive/retired/ 中 ${moved} 个文件按日期移入 archive/YYYY-MM/`
        : "archive/retired/ 中无任务日志",
  });
}
