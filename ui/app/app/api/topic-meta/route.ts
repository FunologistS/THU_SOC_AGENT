import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { getRepoRoot, isSafeTopic } from "@/lib/pathSafety";
import type { StageId } from "@/app/types";

const STAGE_IDS: StageId[] = [
  "01_raw",
  "02_clean",
  "03_summaries",
  "04_meta",
  "05_report",
  "06_review",
];

/** GET /api/topic-meta?topic=...&source=mock|outputs — 返回 stages + files（mock 用 index.json，outputs 可扫描目录） */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const topic = searchParams.get("topic");
  const source = searchParams.get("source") || "mock";

  if (!topic || !isSafeTopic(topic)) {
    return NextResponse.json({ error: "Invalid or missing topic" }, { status: 400 });
  }

  const repoRoot = getRepoRoot();
  const baseDir =
    source === "outputs"
      ? path.join(repoRoot, "outputs")
      : path.join(repoRoot, "ui", "mock");
  const topicDir = path.join(baseDir, topic);
  const indexPath = path.join(topicDir, "index.json");

  if (fs.existsSync(indexPath)) {
    try {
      const raw = fs.readFileSync(indexPath, "utf-8");
      const data = JSON.parse(raw);
      return NextResponse.json(data);
    } catch (e) {
      return NextResponse.json(
        { error: "Failed to read topic index" },
        { status: 500 }
      );
    }
  }

  // outputs 无 index.json 时：扫描 topic 目录下的 stage 文件夹与 *_latest.md
  if (source !== "outputs" || !fs.existsSync(topicDir)) {
    return NextResponse.json(
      { error: "Topic index not found (no index.json)" },
      { status: 404 }
    );
  }

  const stages: { id: StageId; label: string; files: { name: string; path: string }[] }[] = [];
  for (const stageId of STAGE_IDS) {
    const stageDir = path.join(topicDir, stageId);
    if (!fs.existsSync(stageDir) || !fs.statSync(stageDir).isDirectory()) continue;
    const entries = fs.readdirSync(stageDir, { withFileTypes: true });
    const files: { name: string; path: string }[] = [];
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith(".md")) continue;
      if (e.name.includes("_latest.")) {
        files.push({ name: e.name, path: `${stageId}/${e.name}` });
      }
    }
    if (files.length > 0) {
      stages.push({
        id: stageId,
        label: stageId,
        files,
      });
    }
  }

  return NextResponse.json({
    topic,
    label: topic,
    stages,
  });
}
