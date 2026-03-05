import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { getJobsDir } from "@/lib/jobsDir";

const JOB_ID_REGEX = /^job_[a-z0-9_]+$/;

/**
 * POST /api/logs/cleanup — 清理日志
 * body: { keepLast?: number } 仅保留最近 N 条任务，其余删除；
 *   或 { deleteOlderThanDays?: number } 删除 N 天前的任务日志；
 *   或 { fromArchive?: boolean, deleteOlderThanDays?: number } 只清理 archive 下超过 N 天的目录。
 */
export async function POST(request: Request) {
  let body: {
    keepLast?: number;
    deleteOlderThanDays?: number;
    fromArchive?: boolean;
  } = {};
  try {
    if (request.headers.get("content-type")?.includes("application/json")) {
      body = await request.json();
    }
  } catch {
    // empty body ok
  }

  const jobsDir = getJobsDir();
  if (!fs.existsSync(jobsDir)) {
    return NextResponse.json({ deleted: 0, message: "No jobs dir" });
  }

  let deleted = 0;

  if (body.fromArchive && typeof body.deleteOlderThanDays === "number") {
    const archiveDir = path.join(jobsDir, "archive");
    if (!fs.existsSync(archiveDir)) {
      return NextResponse.json({ deleted: 0, message: "No archive dir" });
    }
    const cutoff = Date.now() - Math.max(1, body.deleteOlderThanDays) * 24 * 60 * 60 * 1000;
    const subdirs = fs.readdirSync(archiveDir, { withFileTypes: true }).filter((d) => d.isDirectory());
    for (const d of subdirs) {
      const dirPath = path.join(archiveDir, d.name);
      const stat = fs.statSync(dirPath);
      if (stat.mtimeMs < cutoff) {
        try {
          fs.rmSync(dirPath, { recursive: true });
          deleted++;
        } catch (e) {
          return NextResponse.json(
            { error: e instanceof Error ? e.message : "Cleanup archive failed" },
            { status: 500 }
          );
        }
      }
    }
    return NextResponse.json({
      ok: true,
      deleted,
      message: deleted > 0 ? `已删除 ${deleted} 个归档目录` : "没有需要删除的归档",
    });
  }

  if (typeof body.keepLast === "number" && body.keepLast >= 0) {
    const names = fs.readdirSync(jobsDir);
    const jobEntries: { jobId: string; mtime: number }[] = [];
    for (const name of names) {
      const m = name.match(/^(job_[a-z0-9_]+)\.(log|meta\.json)$/);
      if (m && JOB_ID_REGEX.test(m[1])) {
        const jobId = m[1];
        const p = path.join(jobsDir, name);
        jobEntries.push({ jobId, mtime: fs.statSync(p).mtimeMs });
      }
    }
    const byJob = new Map<string, number>();
    for (const e of jobEntries) {
      const cur = byJob.get(e.jobId);
      if (cur === undefined || e.mtime > cur) byJob.set(e.jobId, e.mtime);
    }
    const sorted = Array.from(byJob.entries()).sort((a, b) => b[1] - a[1]);
    const toRemove = sorted.slice(body.keepLast).map(([id]) => id);
    const archiveRetired = path.join(jobsDir, "archive", "retired");
    fs.mkdirSync(archiveRetired, { recursive: true });
    let moved = 0;
    for (const jobId of toRemove) {
      for (const ext of [".log", ".meta.json"]) {
        const src = path.join(jobsDir, `${jobId}${ext}`);
        const dest = path.join(archiveRetired, `${jobId}${ext}`);
        if (fs.existsSync(src)) {
          try {
            fs.renameSync(src, dest);
            moved++;
          } catch {
            try {
              fs.unlinkSync(src);
              deleted++;
            } catch {
              // skip
            }
          }
        }
      }
    }
    const parts = [];
    if (moved > 0) parts.push(`已移入 archive/retired/ ${moved} 个文件`);
    if (deleted > 0) parts.push(`删除 ${deleted} 个（移入失败）`);
    const message =
      parts.length > 0
        ? `${parts.join("，")}，主目录保留最近 ${body.keepLast} 条任务`
        : "无需清理";
    return NextResponse.json({
      ok: true,
      deleted: moved + deleted,
      moved,
      keepLast: body.keepLast,
      message,
    });
  }

  if (typeof body.deleteOlderThanDays === "number") {
    const cutoff = Date.now() - Math.max(1, body.deleteOlderThanDays) * 24 * 60 * 60 * 1000;
    const names = fs.readdirSync(jobsDir);
    const jobIds = new Set<string>();
    for (const name of names) {
      const m = name.match(/^(job_[a-z0-9_]+)\.(log|meta\.json)$/);
      if (m && JOB_ID_REGEX.test(m[1])) jobIds.add(m[1]);
    }
    for (const jobId of Array.from(jobIds)) {
      const logPath = path.join(jobsDir, `${jobId}.log`);
      const metaPath = path.join(jobsDir, `${jobId}.meta.json`);
      let mtime = 0;
      if (fs.existsSync(logPath)) mtime = Math.max(mtime, fs.statSync(logPath).mtimeMs);
      if (fs.existsSync(metaPath)) mtime = Math.max(mtime, fs.statSync(metaPath).mtimeMs);
      if (mtime > 0 && mtime < cutoff) {
        for (const p of [logPath, metaPath]) {
          if (fs.existsSync(p)) {
            fs.unlinkSync(p);
            deleted++;
          }
        }
      }
    }
    return NextResponse.json({
      ok: true,
      deleted,
      deleteOlderThanDays: body.deleteOlderThanDays,
      message: deleted > 0 ? `已删除 ${deleted} 个超过 ${body.deleteOlderThanDays} 天的日志文件` : "无需删除",
    });
  }

  return NextResponse.json(
    { error: "请提供 keepLast、deleteOlderThanDays 或 fromArchive+deleteOlderThanDays" },
    { status: 400 }
  );
}
