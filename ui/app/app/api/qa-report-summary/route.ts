import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { getRepoRoot, isSafeTopic } from "@/lib/pathSafety";

/**
 * GET /api/qa-report-summary?topic=...
 * 读取 outputs/<topic>/04_meta/qa_report_latest.md，解析 total 与 out_of_scope_candidates，
 * 返回 { total, outOfScopeCandidates, inScopeCount }，供前端决定是否提示「仅用优质论文」。
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const topic = searchParams.get("topic");

  if (!topic || !isSafeTopic(topic)) {
    return NextResponse.json({ error: "Invalid or missing topic" }, { status: 400 });
  }

  const repoRoot = getRepoRoot();
  const qaPath = path.join(repoRoot, "outputs", topic, "04_meta", "qa_report_latest.md");

  if (!fs.existsSync(qaPath)) {
    return NextResponse.json(null);
  }

  const text = fs.readFileSync(qaPath, "utf-8");
  const totalM = text.match(/^\s*-\s*total:\s*(\d+)\s*$/m);
  const outM = text.match(/^\s*-\s*out_of_scope_candidates:\s*(\d+)\s*$/m);
  const total = totalM ? parseInt(totalM[1], 10) : 0;
  const outOfScopeCandidates = outM ? parseInt(outM[1], 10) : 0;
  const inScopeCount = Math.max(0, total - outOfScopeCandidates);

  return NextResponse.json({
    total,
    outOfScopeCandidates,
    inScopeCount,
  });
}
