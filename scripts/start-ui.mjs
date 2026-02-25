#!/usr/bin/env node
/**
 * 一键启动 UI：在项目根目录执行 node scripts/start-ui.mjs
 * 自动进入 ui/app、安装依赖并启动 dev 服务（无需手动 cd，路径由脚本解析）
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const uiAppDir = path.join(repoRoot, "ui", "app");

console.log("THU_SOC_AGENT 一键启动");
console.log("工作目录:", uiAppDir);
console.log("");

const install = spawnSync("npm", ["install"], {
  cwd: uiAppDir,
  stdio: "inherit",
  shell: true,
});
if (install.status !== 0) {
  process.exit(install.status ?? 1);
}

console.log("");
console.log("依赖已就绪，启动开发服务…");
const dev = spawnSync("npm", ["run", "dev"], {
  cwd: uiAppDir,
  stdio: "inherit",
  shell: true,
});
process.exit(dev.status ?? 0);
