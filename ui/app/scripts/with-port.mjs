#!/usr/bin/env node
/**
 * THU_SOC_AGENT 专用端口 9301，避免与其它智能体/项目（常见 3000/3001）冲突，防止误开错应用。
 * 支持通过环境变量 PORT 覆盖（跨平台）。用法：node scripts/with-port.mjs dev | start
 * 启动前检测端口占用；支持 interactive / FORCE_KILL_PORT / STRICT_PORT 三种模式。
 */
import { spawn, execSync } from "node:child_process";
import readline from "node:readline";
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

/**
 * 检测端口是否被占用。使用 lsof -ti :PORT 与 ps -p PID -o command=
 * @param {string} port
 * @returns {Promise<{ pid: number, command: string } | null>}
 */
function detectPortOccupancy(port) {
  return new Promise((resolve) => {
    try {
      const out = execSync(`lsof -ti :${port}`, { encoding: "utf8" });
      const firstLine = out.trim().split(/\s/)[0];
      const pid = parseInt(firstLine, 10);
      if (!pid || Number.isNaN(pid)) {
        resolve(null);
        return;
      }
      try {
        const cmdOut = execSync(`ps -p ${pid} -o command=`, {
          encoding: "utf8",
        });
        resolve({ pid, command: (cmdOut || "").trim() || "unknown" });
      } catch {
        resolve({ pid, command: "unknown" });
      }
    } catch {
      resolve(null);
    }
  });
}

/**
 * 终止进程：先 kill PID，若失败则 kill -9 PID
 * @param {number} pid
 */
function killProcessSync(pid) {
  try {
    execSync(`kill ${pid}`, { stdio: "ignore" });
  } catch (_) {}
  try {
    execSync(`kill -9 ${pid}`, { stdio: "ignore" });
  } catch (_) {}
}

/**
 * 交互式询问并处理占用：STRICT_PORT / FORCE_KILL_PORT / interactive
 * @param {string} port
 * @param {{ pid: number, command: string }} info
 * @returns {Promise<void>}
 */
async function handleOccupiedPort(port, info) {
  console.error(
    `\n⚠ Port ${port} is occupied by PID ${info.pid} (${info.command})`
  );

  if (process.env.STRICT_PORT === "true") {
    console.error("✖ Port " + port + " is occupied.");
    console.error("STRICT_PORT enabled. Exiting.");
    process.exit(1);
  }

  if (process.env.FORCE_KILL_PORT === "true") {
    killProcessSync(info.pid);
    console.error("✓ Auto-killed PID " + info.pid);
    startNextDev();
    return;
  }

  console.error("Mode: interactive");
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  const answer = await new Promise((resolve) => {
    rl.question("Kill this process? (y/N) ", resolve);
  });
  rl.close();

  if (answer && answer.trim().toLowerCase() === "y") {
    killProcessSync(info.pid);
    startNextDev();
  } else {
    console.error("Aborted.");
    process.exit(1);
  }
}

/**
 * 启动 Next.js dev/server
 */
function startNextDev() {
  const isWin = process.platform === "win32";
  const child = spawn("npx", ["next", cmd, "-p", port], {
    stdio: "inherit",
    env: { ...process.env, PORT: port },
    cwd: appDir,
    shell: isWin,
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}

/**
 * 入口：先检测端口，未占用则启动；占用则按模式处理
 */
async function main() {
  const info = await detectPortOccupancy(port);
  if (!info) {
    startNextDev();
    return;
  }
  await handleOccupiedPort(port, info);
}

main();
