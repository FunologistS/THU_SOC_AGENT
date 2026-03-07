import path from "node:path";
import fs from "node:fs";

/** Topic slug: only [a-z0-9_/-] */
const TOPIC_REGEX = /^[a-z0-9_/-]+$/;

export function isSafeTopic(topic: string): boolean {
  return TOPIC_REGEX.test(topic) && topic.length > 0 && topic.length <= 120;
}

/**
 * Resolve relative path under a base dir. No "..", no absolute, only [a-z0-9_/. -].
 * Returns null if invalid.
 */
export function resolveUnder(baseDir: string, relativePath: string): string | null {
  const normalized = path.normalize(relativePath);
  if (normalized.startsWith("..") || path.isAbsolute(relativePath)) return null;
  const allowed = /^[a-z0-9_/. \-]+$/i;
  if (!allowed.test(relativePath)) return null;
  const resolved = path.resolve(baseDir, normalized);
  const baseReal = path.resolve(baseDir);
  if (!resolved.startsWith(baseReal)) return null;
  return resolved;
}

/** 向上查找含 .claude 的目录作为 repo 根，保证从 repo 根或 ui/app 启动时都能找到 raw 等资源 */
export function getRepoRoot(): string {
  let dir = path.resolve(process.cwd());
  for (let i = 0; i < 10; i++) {
    try {
      if (fs.existsSync(path.join(dir, ".claude"))) return dir;
    } catch {
      /* ignore */
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const cwd = path.resolve(process.cwd());
  const uiDir = path.dirname(cwd);
  return path.dirname(uiDir);
}

export function getMockBase(): string {
  return path.join(getRepoRoot(), "ui", "mock");
}

export function getOutputsBase(): string {
  return path.join(getRepoRoot(), "outputs");
}

export function safeReadFile(resolvedPath: string, baseDir: string): string | null {
  const baseReal = path.resolve(baseDir);
  const full = path.resolve(resolvedPath);
  if (!full.startsWith(baseReal)) return null;
  try {
    return fs.readFileSync(full, "utf-8");
  } catch {
    return null;
  }
}
