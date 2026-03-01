import { NextResponse } from "next/server";
import { getAndDeleteRunningJob } from "@/lib/runningJobs";

/** POST /api/run/abort — 中止正在运行的任务。body: { jobId: string } */
export async function POST(request: Request) {
  let body: { jobId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const jobId = body?.jobId;
  if (!jobId || !/^job_[a-z0-9_]+$/.test(jobId)) {
    return NextResponse.json({ error: "Invalid or missing jobId" }, { status: 400 });
  }

  const child = getAndDeleteRunningJob(jobId);
  if (!child || !child.kill) {
    return NextResponse.json({ error: "Job not found or already finished" }, { status: 404 });
  }

  child.kill("SIGTERM");
  return NextResponse.json({ ok: true });
}
