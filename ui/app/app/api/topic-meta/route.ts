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

  // outputs 无 index.json 时：扫描 topic 目录下的 stage 文件夹与 *_latest.md；目录不存在则返回空 stages（避免 404，方便新用户/错误 URL）
  if (source !== "outputs") {
    return NextResponse.json(
      { error: "Topic index not found (no index.json)" },
      { status: 404 }
    );
  }
  if (!fs.existsSync(topicDir)) {
    return NextResponse.json({ topic, label: topic, stages: [] });
  }

  const stages: { id: StageId; label: string; files: { name: string; path: string }[] }[] = [];
  for (const stageId of STAGE_IDS) {
    const stageDir = path.join(topicDir, stageId);
    if (!fs.existsSync(stageDir) || !fs.statSync(stageDir).isDirectory()) continue;
    const entries = fs.readdirSync(stageDir, { withFileTypes: true });
    const mdFiles: { name: string; path: string; sortKey: string }[] = [];
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith(".md")) continue;
      const pathRel = `${stageId}/${e.name}`;
      const isLatest = e.name.includes("_latest.");
      const versioned = e.name.match(/^(.+?)_(\d{8})_v(\d+)\.md$/);
      const sortKey = isLatest
        ? "9_latest"   // 9 使 _latest 排在最前（desc 时 9 > 1）
        : versioned
          ? `1_${versioned[2]}_${versioned[3].padStart(4, "0")}` // 日期+版本
          : `2_${e.name}`;
      mdFiles.push({ name: e.name, path: pathRel, sortKey });
    }
    mdFiles.sort((a, b) => b.sortKey.localeCompare(a.sortKey)); // _latest 第一，再按日期版本新→旧
    const files = mdFiles.map(({ name, path: p }) => ({ name, path: p }));
    if (files.length > 0) {
      stages.push({ id: stageId, label: stageId, files });
    }
  }

  return NextResponse.json({
    topic,
    label: topic,
    stages,
  });
}
