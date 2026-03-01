import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { getRepoRoot, isSafeTopic } from "@/lib/pathSafety";

/** GET /api/summaries-versions?topic=... — 返回该主题 03_summaries 下所有摘要版本（当前使用 + 历史版本） */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const topic = searchParams.get("topic");

  if (!topic || !isSafeTopic(topic)) {
    return NextResponse.json({ error: "Invalid or missing topic" }, { status: 400 });
  }

  const repoRoot = getRepoRoot();
  const summariesDir = path.join(repoRoot, "outputs", topic, "03_summaries");

  if (!fs.existsSync(summariesDir)) {
    return NextResponse.json({ topic, versions: [] });
  }

  const versions: { file: string; label: string }[] = [];

  if (fs.existsSync(path.join(summariesDir, "summaries_latest.md"))) {
    versions.push({ file: "summaries_latest.md", label: "当前使用 (summaries_latest)" });
  }

  try {
    const names = fs.readdirSync(summariesDir);
    const versioned = names
      .filter((n) => /^summaries_\d{8}_v\d+\.md$/.test(n))
      .map((n) => {
        const m = n.match(/^summaries_(\d{8})_v(\d+)\.md$/);
        const dateStr = m ? m[1] : "";
        const versionNum = m ? parseInt(m[2], 10) : 0;
        return { name: n, dateStr, versionNum };
      })
      .sort((a, b) => {
        if (a.dateStr !== b.dateStr) return b.dateStr.localeCompare(a.dateStr);
        return b.versionNum - a.versionNum;
      });

    for (const v of versioned) {
      const m = v.name.match(/^summaries_(\d{4})(\d{2})(\d{2})_v(\d+)\.md$/);
      const label = m
        ? `${m[1]}-${m[2]}-${m[3]} v${m[4]}`
        : v.name;
      versions.push({ file: v.name, label });
    }
  } catch {
    // ignore
  }

  return NextResponse.json({ topic, versions });
}
