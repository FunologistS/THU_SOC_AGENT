import path from "node:path";
import fs from "node:fs";

/** Jobs directory: ui/app/.tmp/jobs. Logs and meta for each run live here. */
export function getJobsDir(): string {
  const appDir = process.cwd();
  const uiDir = path.dirname(appDir);
  return path.join(uiDir, ".tmp", "jobs");
}

export function ensureJobsDir(): string {
  const jobsDir = getJobsDir();
  fs.mkdirSync(jobsDir, { recursive: true });
  return jobsDir;
}
