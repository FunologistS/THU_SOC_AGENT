#!/usr/bin/env node
/**
 * 自检：Node 版本、3001 端口占用、.env、next 依赖
 * 输出中文，失败时给出下一步建议。端口检查在 macOS/Linux 下使用 lsof，Windows 下跳过。
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(__dirname, "..");
const DEFAULT_PORT = 3001;

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}
function fail(msg, hint) {
  console.log(`  ✗ ${msg}`);
  if (hint) console.log(`    → ${hint}`);
}

let hasError = false;

console.log("\n[THU_SOC_AGENT UI] 自检\n");

// Node 版本
const v = process.version;
const major = parseInt(process.versions.node.split(".")[0], 10);
if (major >= 18) {
  ok(`Node 版本 ${v}（满足 Next.js 14 要求）`);
} else {
  fail(`Node 版本 ${v} 过低`, "请安装 Node 18 或以上：https://nodejs.org");
  hasError = true;
}

// 端口占用（macOS/Linux：lsof；Windows 无 lsof 则跳过）
let pids = [];
try {
  const out = execSync(`lsof -i :${DEFAULT_PORT} -t 2>/dev/null || true`, {
    encoding: "utf8",
    maxBuffer: 1024,
  });
  pids = out.trim().split(/\s+/).filter(Boolean);
} catch {
  ok(`端口 ${DEFAULT_PORT} 占用检查已跳过（当前环境无 lsof，如为 Windows 可忽略）`);
  pids = [];
}

if (pids.length > 0) {
  fail(
    `端口 ${DEFAULT_PORT} 已被占用（PID: ${pids.join(", ")}）`,
    `释放端口：lsof -i :${DEFAULT_PORT} 查看进程，再执行 kill -9 <PID>；或改用临时端口：PORT=3005 npm run dev`
  );
  hasError = true;
} else if (pids.length === 0 && (process.platform === "darwin" || process.platform === "linux")) {
  ok(`端口 ${DEFAULT_PORT} 未被占用，可直接启动`);
}

// .env（可选）
const envPath = path.join(appDir, ".env");
const envLocal = path.join(appDir, ".env.local");
if (fs.existsSync(envPath) || fs.existsSync(envLocal)) {
  ok(".env 或 .env.local 已存在（按需配置 API 等）");
} else {
  ok(".env 未发现（非必须；运行技能需在环境或 .env 中配置 API Key）");
}

// next 依赖
const nextPkg = path.join(appDir, "node_modules", "next", "package.json");
if (fs.existsSync(nextPkg)) {
  ok("next 已安装");
} else {
  fail("next 未安装", "在 ui/app 目录执行：npm install");
  hasError = true;
}

console.log("");
if (hasError) {
  console.log("部分检查未通过，请按上方提示处理后再启动。\n");
  process.exit(1);
}
console.log("自检通过，可执行 npm run dev 启动。\n");
