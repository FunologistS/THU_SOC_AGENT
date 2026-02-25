import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { getRepoRoot, getMockBase, resolveUnder } from "@/lib/pathSafety";

/** GET /api/topics — 列出 topic（v1 先读 mock 目录，v2 可读 outputs） */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source") || "mock"; // mock | outputs

  const repoRoot = getRepoRoot();
  const baseDir = source === "outputs"
    ? path.join(repoRoot, "outputs")
    : path.join(repoRoot, "ui", "mock");

  if (!fs.existsSync(baseDir)) {
    return NextResponse.json({ topics: [] });
  }

  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  const topics: { topic: string; label: string }[] = [];

  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const topic = e.name;
    if (!/^[a-z0-9_/-]+$/.test(topic)) continue;
    const indexPath = path.join(baseDir, topic, "index.json");
    let label = topic;
    if (fs.existsSync(indexPath)) {
      try {
        const raw = fs.readFileSync(indexPath, "utf-8");
        const data = JSON.parse(raw);
        if (data.label) label = data.label;
      } catch {
        // keep slug as label
      }
    }
    topics.push({ topic, label });
  }

  topics.sort((a, b) => a.topic.localeCompare(b.topic));
  return NextResponse.json({ topics, source });
}
