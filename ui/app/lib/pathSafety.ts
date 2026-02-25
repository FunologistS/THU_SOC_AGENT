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

export function getRepoRoot(): string {
  // ui/app -> ui -> repo root
  const appDir = path.resolve(process.cwd());
  const uiDir = path.dirname(appDir);
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
