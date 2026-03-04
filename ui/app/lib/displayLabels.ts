/**
 * 用户友好的展示名称：阶段、文件名、数据源等
 * 避免直接显示下划线和文件扩展名
 */

import type { StageId, JobType } from "@/app/types";

/** 技能/任务展示名（与 SkillPanel、PipelineRunner 一致，用于完成通知等） */
export const JOB_DISPLAY_LABELS: Record<JobType, string> = {
  journal_search: "重新检索",
  filter: "筛选",
  paper_summarize: "清洗规整",
  synthesize: "荟萃分析",
  concept_synthesize: "文献简报",
  upload_and_writing: "上传写作样本",
  transcribe_submit_and_writing: "转录并综述",
  writing_under_style: "一键综述",
};

export function jobDisplayLabel(jobType: JobType): string {
  return JOB_DISPLAY_LABELS[jobType] ?? jobType;
}

/** 与技能工作台描述一致 */
const STAGE_LABELS: Record<StageId, string> = {
  "01_raw": "原始论文",
  "02_clean": "清洗后论文",
  "03_summaries": "结构化摘要",
  "04_meta": "元数据",
  "05_report": "文献简报",
  "06_review": "一键综述",
};

/** 常见 _latest 文件名（不含 .md）→ 展示名（日期+版本更清晰时由 fileDisplayName 解析版本号） */
const FILE_LABELS: Record<string, string> = {
  papers_latest: "论文列表（最新）",
  summaries_latest: "结构化摘要（最新）",
  briefing_latest: "研究简报（最新）",
  meta_clusters_latest: "聚类结果（最新）",
  meta_table_latest: "元数据表（最新）",
  qa_report_latest: "质量报告（最新）",
  report_latest: "文献简报（最新）",
  review_latest: "一键综述（最新）",
  concept_appendix_latest: "概念附录（最新）",
  concept_briefing_latest: "概念简报（最新）",
  k_scan_latest: "聚类扫描（最新）",
};

export function stageDisplayLabel(stageId: string): string {
  return STAGE_LABELS[stageId as StageId] ?? stageId;
}

/** 版本化文件名匹配：papers_20260221_v2、summaries_20260221_v2 等 */
const VERSIONED_PREFIX_LABELS: Record<string, string> = {
  papers: "论文列表",
  papers_clean: "清洗后论文列表",
  summaries: "结构化摘要",
  briefing: "研究简报",
  meta_clusters: "聚类结果",
  meta_table: "元数据表",
  qa_report: "质量报告",
  report: "文献简报",
  review: "一键综述",
  concept_appendix: "概念附录",
  concept_briefing: "概念简报",
  k_scan: "聚类扫描",
};

/**
 * 将文件名转为用户友好展示名。优先日期+版本号（如 20260221 v2），否则用预设或 _latest（最新）。
 */
export function fileDisplayName(fileName: string): string {
  const base = fileName.replace(/\.md$/i, "").trim();
  const versioned = base.match(/^(.+?)_(\d{8})_v(\d+)$/);
  if (versioned) {
    const [, prefix, date, ver] = versioned;
    const label = VERSIONED_PREFIX_LABELS[prefix ?? ""] ?? (prefix ?? "").replace(/_/g, " ");
    const dateStr = `${(date ?? "").slice(0, 4)}-${(date ?? "").slice(4, 6)}-${(date ?? "").slice(6, 8)}`;
    return `${label} ${dateStr} v${ver ?? ""}`;
  }
  if (FILE_LABELS[base]) return FILE_LABELS[base];
  if (base.endsWith("_latest")) {
    const prefix = base.slice(0, -7);
    const label = VERSIONED_PREFIX_LABELS[prefix] ?? prefix.replace(/_/g, " ");
    return label ? `${label}（最新）` : "（最新）";
  }
  return base.replace(/_/g, " ");
}

export function sourceDisplayLabel(source: string): string {
  return source === "outputs" ? "我的产出" : "示例数据";
}
