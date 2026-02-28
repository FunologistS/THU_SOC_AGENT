import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { getJobsDir } from "@/lib/jobsDir";

/** GET /api/logs?jobId=... — 读取日志内容与完成状态 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");

  if (!jobId || !/^job_[a-z0-9_]+$/.test(jobId)) {
    return NextResponse.json({ error: "Invalid jobId" }, { status: 400 });
  }

  const jobsDir = getJobsDir();
  let logPath = path.join(jobsDir, `${jobId}.log`);
  let metaPath = path.join(jobsDir, `${jobId}.meta.json`);

  if (!fs.existsSync(logPath)) {
    const archiveDir = path.join(jobsDir, "archive");
    if (fs.existsSync(archiveDir)) {
      const subdirs = fs.readdirSync(archiveDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => path.join(archiveDir, d.name));
      for (const dir of subdirs) {
        const p = path.join(dir, `${jobId}.log`);
        if (fs.existsSync(p)) {
          logPath = p;
          metaPath = path.join(dir, `${jobId}.meta.json`);
          break;
        }
      }
    }
  }

  let content = "";
  let done = false;
  let exitCode: number | undefined;

  if (fs.existsSync(logPath)) {
    try {
      content = fs.readFileSync(logPath, "utf-8");
    } catch {
      // empty
    }
  }

  if (fs.existsSync(metaPath)) {
    done = true;
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      exitCode = meta.exitCode;
    } catch {
      // ignore
    }
  }

  return NextResponse.json({
    jobId,
    content,
    done,
    exitCode,
  });
}
