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

/** 与技能工作台表述完全一致 */
const SKILL_LABELS: Record<string, string> = {
  "journal-catalog": "期刊数据库管理",
  "journal-search": "批量检索",
  "paper-summarize": "清洗规整",
  "literature-synthesis": "主题聚类 · 荟萃分析",
  "paper-writing": "文献简报",
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

  const intro = [
    "本智能体面向**社会科学文献**：从选定期刊批量检索论文，到清洗、摘要、主题聚类与概念合成，最后生成可读的综述与简报。",
    "左侧可切换「示例数据」与「我的产出」；在「文献目录」选主题与文件即可在右侧预览。技能工作台按步骤执行管线任务。",
  ].join("\n\n");

  const toc = [
    { id: "intro", title: "简介" },
    { id: "overview", title: "本页功能一览" },
    { id: "skills", title: "技能说明（可展开）" },
  ];

  const overviewRows = [
    {
      area: "期刊数据库管理",
      description: "选择数据源与期刊，按主题/年份检索，结果写入「我的产出」对应主题下。",
    },
    {
      area: "技能工作台",
      description: "批量检索 → 清洗规整 → 主题聚类 → 荟萃分析 → 上传写作样本（可选）→ 文献简报；运行后可在文献目录查看产出。",
    },
    {
      area: "文献目录",
      description: "切换示例/我的产出，按主题、阶段（01_raw～06_review）浏览文件，点击在右侧预览。",
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
