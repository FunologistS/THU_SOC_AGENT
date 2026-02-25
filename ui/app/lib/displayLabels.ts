/**
 * 用户友好的展示名称：阶段、文件名、数据源等
 * 避免直接显示下划线和文件扩展名
 */

import type { StageId } from "@/app/types";

const STAGE_LABELS: Record<StageId, string> = {
  "01_raw": "原始论文",
  "02_clean": "清洗后论文",
  "03_summaries": "摘要",
  "04_meta": "元分析",
  "05_report": "概念报告",
  "06_review": "综述",
};

/** 常见文件名（不含 .md）→ 展示名 */
const FILE_LABELS: Record<string, string> = {
  papers_latest: "论文列表（最新）",
  summaries_latest: "摘要（最新）",
  briefing_latest: "研究简报（最新）",
  meta_clusters_latest: "聚类结果（最新）",
  meta_table_latest: "元数据表（最新）",
  qa_report_latest: "质量报告（最新）",
  report_latest: "概念报告（最新）",
  review_latest: "综述（最新）",
  concept_appendix_latest: "概念附录（最新）",
  concept_briefing_latest: "概念简报（最新）",
  k_scan_latest: "聚类扫描（最新）",
};

export function stageDisplayLabel(stageId: string): string {
  return STAGE_LABELS[stageId as StageId] ?? stageId;
}

/**
 * 将文件名转为用户友好展示名（去掉 .md，_latest → （最新），已知名称用预设中文）
 */
export function fileDisplayName(fileName: string): string {
  const base = fileName.replace(/\.md$/i, "").trim();
  if (FILE_LABELS[base]) return FILE_LABELS[base];
  if (base.endsWith("_latest")) {
    const prefix = base.slice(0, -7).replace(/_/g, " ");
    return prefix ? `${prefix}（最新）` : "（最新）";
  }
  return base.replace(/_/g, " ");
}

export function sourceDisplayLabel(source: string): string {
  return source === "outputs" ? "我的产出" : "示例数据";
}
