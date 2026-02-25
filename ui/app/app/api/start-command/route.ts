import { NextResponse } from "next/server";
import path from "node:path";
import { getRepoRoot } from "@/lib/pathSafety";

/** GET /api/start-command — 返回带绝对路径的一键启动命令（避免 cd 相对路径报错） */
export async function GET() {
  const root = getRepoRoot();
  const uiAppDir = path.join(root, "ui", "app");
  const scriptPath = path.join(root, "scripts", "start-ui.mjs");
  const dirForShell = uiAppDir.replace(/\\/g, "/");
  const command = `cd "${dirForShell}" && npm install && npm run dev`;
  const oneShot = `node "${scriptPath.replace(/\\/g, "/")}"`;
  return NextResponse.json({
    command,
    oneShot,
    uiAppDir: dirForShell,
  });
}
