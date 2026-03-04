import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { getRepoRoot } from "@/lib/pathSafety";

const SKILL_NAMES = [
  "journal-catalog",
  "journal-search",
  "paper-summarize",
  "literature-synthesis",
  "paper-writing",
];

/** 与技能工作台表述一致 */
const SKILL_LABELS: Record<string, string> = {
  "journal-catalog": "期刊数据库",
  "journal-search": "重新检索",
  "paper-summarize": "清洗规整",
  "literature-synthesis": "荟萃分析 · 文献简报",
  "paper-writing": "一键综述",
};

function readFileSafe(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

/** GET /api/manual - 说明书：简短简介 + 目录 + 各技能详情（可折叠用） */
export async function GET() {
  const root = getRepoRoot();

  const intro =
    "欢迎使用社会科学文献综合处理智能体！本智能体可供社科研究者进行期刊查询、批量检索与整理、荟萃分析与文献简报，并支持一键生成文献综述。";

  const toc: { id: string; title: string }[] = [];

  const overviewRows = [
    {
      area: "期刊数据库",
      description: "查看与搜索Social Sciences Citation Index (SSCI) 收录的期刊，可按学科、分区（暂仅支持 Sociology / Anthropology / Economics）和出版社筛选。",
    },
    {
      area: "新增检索",
      description: "新增检索的数据来源为 OpenAlex 解析的期刊（暂仅包含 Sociology / Anthropology / Economics），选择学科、主题与年份后检索，结果写入「我的产出」对应主题下。",
    },
    {
      area: "技能工作台",
      description: "目前开发了批量检索、清洗规整、荟萃分析、文献简报和一键综述等5大技能，运行后可在文档目录查看产出。",
    },
    {
      area: "手动补录空缺摘要",
      description: "对当前主题下缺摘要的条目进行手填补录，保存后可参与后续步骤。",
    },
    {
      area: "文档目录",
      description: "可按主题和技能运行结果浏览文件，点击后在右侧预览。",
    },
    {
      area: "右侧预览",
      description: "默认显示本说明书；选择文件后显示该文件内容。",
    },
  ];

  const skills: { id: string; label: string; content: string }[] = [];
  for (const name of SKILL_NAMES) {
    const skillPath = path.join(root, ".claude", "skills", name, "SKILL.md");
    const content = readFileSafe(skillPath);
    if (content) {
      skills.push({
        id: name,
        label: SKILL_LABELS[name] ?? name,
        content: content.trim(),
      });
    }
  }

  return NextResponse.json({
    intro,
    toc,
    overviewRows,
    skills,
  });
}
