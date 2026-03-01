import type { ChildProcess } from "node:child_process";

const runningJobs = new Map<string, ChildProcess>();

export function setRunningJob(jobId: string, child: ChildProcess): void {
  runningJobs.set(jobId, child);
}

export function getAndDeleteRunningJob(jobId: string): ChildProcess | undefined {
  const child = runningJobs.get(jobId);
  runningJobs.delete(jobId);
  return child;
}

export function deleteRunningJob(jobId: string): void {
  runningJobs.delete(jobId);
}
