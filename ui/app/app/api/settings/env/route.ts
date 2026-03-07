import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";

/** 各 skill 用到的环境变量（与 ui/app/.env.example 保持一致） */
const ENV_KEYS = [
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "OPENAI_MODELS",
  "ZHIPU_API_KEY",
  "ZHIPU_BASE_URL",
  "ZHIPU_MODEL",
  "ZHIPU_MODELS",
  "FIRECRAWL_API_KEY",
  "OPENALEX_API_KEY",
  "OPENALEX_EMAIL",
] as const;

/** 项目根目录 .env / .env.local 路径（Next 运行目录 = ui/app） */
function getEnvPath(): string {
  return path.join(process.cwd(), ".env");
}

function getEnvLocalPath(): string {
  return path.join(process.cwd(), ".env.local");
}

function getEnvExamplePath(): string {
  return path.join(process.cwd(), ".env.example");
}

/** 解析 .env 内容为 key-value，只保留 ENV_KEYS */
function parseEnvContent(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    const key = m[1];
    if (!ENV_KEYS.includes(key)) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    out[key] = val;
  }
  return out;
}

/** 读取 .env.local / .env / .env.example，返回 ENV_KEYS 的键值对 */
function readEnvFromFile(): Record<string, string> {
  const envPath = getEnvPath();
  const envLocalPath = getEnvLocalPath();
  const examplePath = getEnvExamplePath();
  const pathToRead = fs.existsSync(envLocalPath)
    ? envLocalPath
    : fs.existsSync(envPath)
    ? envPath
    : examplePath;
  if (!fs.existsSync(pathToRead)) {
    return Object.fromEntries(ENV_KEYS.map((k) => [k, ""]));
  }
  const content = fs.readFileSync(pathToRead, "utf-8");
  const parsed = parseEnvContent(content);
  const result: Record<string, string> = {};
  for (const k of ENV_KEYS) result[k] = parsed[k] ?? "";
  return result;
}

/** 将 ENV_KEYS 的更新写回 .env.local（若存在）或 .env，保留其它行与格式 */
function writeEnvToFile(updates: Record<string, string>): void {
  const envPath = getEnvPath();
  const envLocalPath = getEnvLocalPath();
  const examplePath = getEnvExamplePath();
  let content: string;
  let targetPath: string;

  if (fs.existsSync(envLocalPath)) {
    targetPath = envLocalPath;
    content = fs.readFileSync(envLocalPath, "utf-8");
  } else if (fs.existsSync(envPath)) {
    targetPath = envPath;
    content = fs.readFileSync(envPath, "utf-8");
  } else if (fs.existsSync(examplePath)) {
    // 从示例初始化，优先写入 .env.local，避免误提交到 Git
    targetPath = envLocalPath;
    content = fs.readFileSync(examplePath, "utf-8");
  } else {
    targetPath = envLocalPath;
    content = "";
  }

  const lines = content.split(/\r?\n/);
  const updatedKeys = new Set<string>();
  const newLines: string[] = [];

  for (const line of lines) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && ENV_KEYS.includes(m[1])) {
      const key = m[1];
      const val = String(updates[key] ?? "").trim();
      newLines.push(`${key}=${val}`);
      updatedKeys.add(key);
    } else {
      newLines.push(line);
    }
  }

  for (const key of ENV_KEYS) {
    if (updatedKeys.has(key)) continue;
    const val = String(updates[key] ?? "").trim();
    newLines.push(`${key}=${val}`);
  }
  fs.writeFileSync(targetPath, newLines.join("\n") + (newLines.length && !content.endsWith("\n") ? "\n" : ""), "utf-8");
}

/** GET /api/settings/env — 从 .env（或 .env.example）读取键值供 UI 填充；并返回 gitSavePinRequired */
export async function GET() {
  try {
    const env = readEnvFromFile();
    const gitSavePinRequired = Boolean(process.env.GIT_SAVE_PIN?.trim());
    return NextResponse.json({ env, gitSavePinRequired });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "读取 .env 失败" },
      { status: 500 }
    );
  }
}

/** POST /api/settings/env — 将 UI 提交的键值写回 .env */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const env = body?.env;
    if (!env || typeof env !== "object") {
      return NextResponse.json({ error: "缺少 env 对象" }, { status: 400 });
    }
    const updates: Record<string, string> = {};
    for (const key of ENV_KEYS) {
      updates[key] = env[key] != null ? String(env[key]).trim() : "";
    }
    writeEnvToFile(updates);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "写入 .env 失败" },
      { status: 500 }
    );
  }
}
