#!/usr/bin/env node
/**
 * THU_SOC_AGENT 专用端口 9301，避免与其它智能体/项目（常见 3000/3001）冲突，防止误开错应用。
 * 支持通过环境变量 PORT 覆盖（跨平台）。用法：node scripts/with-port.mjs dev | start
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = process.env.PORT || "9301";
const cmd = process.argv[2] || "dev";

if (cmd !== "dev" && cmd !== "start") {
  console.error("用法: node scripts/with-port.mjs dev|start");
  process.exit(1);
}

process.env.PORT = port;

const appDir = path.join(__dirname, "..");
const child = spawn(
  "npx",
  ["next", cmd, "-p", port],
  { stdio: "inherit", env: { ...process.env, PORT: port }, cwd: appDir }
);

child.on("exit", (code) => process.exit(code ?? 0));
