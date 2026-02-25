export type StageId =
  | "01_raw"
  | "02_clean"
  | "03_summaries"
  | "04_meta"
  | "05_report"
  | "06_review";

export interface StageInfo {
  id: StageId;
  label: string;
  files: { name: string; path: string }[];
}

export interface TopicMeta {
  topic: string;
  label: string;
  stages: StageInfo[];
}

export type JobType =
  | "journal_search"
  | "filter"
  | "paper_summarize"
  | "synthesize"
  | "concept_synthesize"
  | "upload_and_writing"
  | "writing_under_style";

export interface RunJobRequest {
  jobType: JobType;
  topic: string;
  args?: string[];
}

export interface RunJobResponse {
  jobId: string;
  error?: string;
}

export interface LogsResponse {
  jobId: string;
  content: string;
  done: boolean;
  exitCode?: number;
}
