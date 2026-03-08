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

/** POST /api/topic-create — 在 outputs 下新建主题目录及 01_raw～06_review 子目录。body: { topic: string } */
export async function POST(req: Request) {
  let body: { topic?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体需为 JSON" }, { status: 400 });
  }
  const topic = typeof body.topic === "string" ? body.topic.trim() : "";
  if (!topic || !isSafeTopic(topic)) {
    return NextResponse.json(
      { ok: false, error: "topic 无效或缺失（仅允许小写字母、数字、下划线、连字符）" },
      { status: 400 }
    );
  }

  const repoRoot = getRepoRoot();
  const topicDir = path.join(repoRoot, "outputs", topic);

  if (fs.existsSync(topicDir)) {
    return NextResponse.json(
      { ok: false, error: "该主题目录已存在" },
      { status: 409 }
    );
  }

  try {
    fs.mkdirSync(topicDir, { recursive: true });
    for (const stageId of STAGE_IDS) {
      fs.mkdirSync(path.join(topicDir, stageId), { recursive: true });
    }
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: "创建目录失败",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    topic,
    message: `已创建 outputs/${topic}/ 及 01_raw～06_review 子目录。`,
  });
}
