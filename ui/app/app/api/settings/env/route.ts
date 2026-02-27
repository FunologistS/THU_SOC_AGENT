import { NextResponse } from "next/server";

/** 各 skill 用到的环境变量（与 ui/app/.env.example 保持一致，仅用于展示是否已配置，不返回明文） */
const ENV_SPEC: { key: string; label: string; hint?: string }[] = [
  { key: "OPENAI_API_KEY", label: "OpenAI API Key", hint: "荟萃分析(GPT)、一键综述(GPT)、RAG 索引" },
  { key: "OPENAI_BASE_URL", label: "OpenAI Base URL", hint: "可选，默认代理" },
  { key: "OPENAI_MODEL", label: "OpenAI 模型", hint: "可选，如 gpt-5.2" },
  { key: "ZHIPU_API_KEY", label: "智谱 API Key", hint: "荟萃分析(GLM)、一键综述(GLM)" },
  { key: "ZHIPU_BASE_URL", label: "智谱 Base URL", hint: "可选" },
  { key: "ZHIPU_MODEL", label: "智谱模型", hint: "可选，如 glm-4.7-flash" },
  { key: "FIRECRAWL_API_KEY", label: "Firecrawl API Key", hint: "缺摘要时兜底抓取，可选" },
  { key: "OPENALEX_EMAIL", label: "OpenAlex 联系邮箱", hint: "批量检索时建议填写，可选" },
];

function mask(value: string): string {
  const s = String(value ?? "").trim();
  if (!s) return "—";
  if (s.length <= 8) return "***";
  return s.slice(0, 3) + "···" + s.slice(-4);
}

/** GET /api/settings/env — 返回各 key 是否已配置及脱敏展示，不返回明文 */
export async function GET() {
  const vars = ENV_SPEC.map(({ key, label, hint }) => {
    const raw = process.env[key];
    const set = Boolean(raw && String(raw).trim());
    return {
      key,
      label,
      hint,
      set,
      masked: set ? mask(String(process.env[key])) : "未设置",
    };
  });
  return NextResponse.json({ vars });
}
