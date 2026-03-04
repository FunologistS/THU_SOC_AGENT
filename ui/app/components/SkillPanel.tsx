"use client";

import { useState, useRef, useEffect } from "react";
import { useThUAlertConfirm } from "@/components/ThUAlertConfirm";
import { type JournalSearchParams, DISCIPLINES } from "@/components/LiteratureSearchPanel";
import type { JobType } from "@/app/types";
import type { TopicMeta } from "@/app/types";

/** 与 LiteratureSearchPanel 一致：主题 slug 化 */
function toSlug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "");
}

/** 年份下拉：2026 在上 */
const YEAR_OPTIONS = Array.from({ length: 2026 - 1900 + 1 }, (_, i) => 2026 - i);

/** 重新检索弹窗内「检索类型」说明，与 LiteratureSearchPanel 一致 */
const SEARCH_TYPE_TOOLTIP =
  "严格检索：摘要与关键词都包含检索词才保留。宽松检索：标题、摘要或关键词任一包含即可。";

/** 5 步：层层递进，对应后端 jobType */
export type SkillId = JobType;

const SKILLS: { step: number; id: SkillId; label: string; desc: string }[] = [
  { step: 1, id: "journal_search", label: "重新检索", desc: "在选定主题和数据源下，再次批量抓取论文" },
  { step: 2, id: "paper_summarize", label: "清洗规整", desc: "清洗去噪，并生成结构化论文信息" },
  { step: 3, id: "synthesize", label: "荟萃分析", desc: "基于结构化论文信息进行荟萃分析，生成主题聚类、质检报告等论文元数据" },
  { step: 4, id: "concept_synthesize", label: "文献简报", desc: "基于荟萃分析结果生成文献简报" },
  { step: 5, id: "writing_under_style", label: "一键综述", desc: "若用户未上传则采用默认样本作为参考，若用户上传写作样本则以用户新上传样本为参考，将文献简报改写为成文综述" },
];

/** 未在 SKILLS 中的 job 的展示名（如从一键综述内触发的上传写作样本） */
const EXTRA_RUNNING_LABELS: Record<string, string> = {
  upload_and_writing: "上传写作样本",
  transcribe_submit_and_writing: "转录并综述",
};

/** 各技能预估耗时（秒），仅作进度条参考；实际用时以「已用 X 秒」为准 */
const SKILL_ESTIMATED_SECONDS: Record<SkillId, number> = {
  journal_search: 180,
  filter: 120,
  paper_summarize: 300,
  synthesize: 120,
  concept_synthesize: 210,
  upload_and_writing: 600,
  transcribe_submit_and_writing: 600,
  writing_under_style: 600,
};

function hasStageFiles(meta: TopicMeta | null, stageId: string): boolean {
  if (!meta?.stages) return false;
  const stage = meta.stages.find((s) => s.id === stageId);
  return Boolean(stage?.files?.length);
}

/** 可选：用于切换的 topic 列表（含 artificial_intelligence、digital_labor 等） */
export function SkillPanel({
  topic,
  availableTopics = [],
  onTopicChange,
  onJumpToOutputs,
  onJobComplete,
  onJobFinished,
  highlightedCardIds = [],
  topicMeta = null,
  journalDataSourceLabel = null,
  onFocusLiteratureSearch,
  getJournalSearchDefaults,
  onRunJournalSearch,
  onRunStarted,
  onRunningChange,
  onProgressUpdate,
  journalSearchJobId = null,
  journalSearchLog = "",
  journalSearchDone = false,
  journalSearchExitCode,
  journalSearchProgress = 0,
  onAbortJournalSearch,
  onDismissJournalSearchLog,
}: {
  topic: string;
  availableTopics?: { topic: string; label: string }[];
  onTopicChange?: (newTopic: string) => void;
  onJumpToOutputs?: () => void;
  /** 任务成功结束时调用，传入刚完成的 skillId，用于「查看产出」跳转到对应阶段 */
  onJobComplete?: (skillId: SkillId) => void;
  /** 任务结束（成功或失败）时调用，用于右上角完成通知 */
  onJobFinished?: (skillId: SkillId, success: boolean) => void;
  highlightedCardIds?: string[];
  /** 当前主题的产出 meta，用于依赖检查（未完成前置步骤时提示） */
  topicMeta?: TopicMeta | null;
  /** 当前期刊数据源展示名（来自新增检索 / 期刊数据库），用于灰色提示 */
  journalDataSourceLabel?: string | null;
  /** 点击「重新检索」弹窗内「去侧栏修改」时：聚焦/展开侧栏新增检索区块 */
  onFocusLiteratureSearch?: () => void;
  /** 打开重新检索弹窗时拉取当前设定作为默认值 */
  getJournalSearchDefaults?: () => JournalSearchParams | null;
  /** 在弹窗内确认后，用用户选择/修改后的参数执行检索 */
  onRunJournalSearch?: (params: {
    topicSlug: string;
    journalSourceIds: string[];
    yearFrom?: number;
    yearTo?: number;
    searchMode?: "strict" | "relaxed";
    instruction?: string;
    abstractFallback?: boolean;
  }) => void;
  /** 技能真正开始运行（jobId 已设置）时调用，传入 skillId 用于滚动到该技能下的运行日志 */
  onRunStarted?: (skillId: SkillId) => void;
  /** 运行状态变化时通知父组件（用于返回启动页前确认是否终止） */
  onRunningChange?: (running: boolean) => void;
  /** 进度与完成状态变化时通知父组件（用于右上角圆形进度浮窗与 Done 提示） */
  onProgressUpdate?: (progress: number, done: boolean) => void;
  /** 重新检索运行状态（由页面传入），用于在「重新检索」卡片下展示运行日志 */
  journalSearchJobId?: string | null;
  journalSearchLog?: string;
  journalSearchDone?: boolean;
  journalSearchExitCode?: number;
  journalSearchProgress?: number;
  onAbortJournalSearch?: () => void;
  /** 用户点击「重新检索」运行日志框的关闭按钮时调用，用于收起该框 */
  onDismissJournalSearchLog?: () => void;
}) {
  const highlightSet = new Set(highlightedCardIds);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const first = highlightedCardIds?.[0];
    if (!first || !panelRef.current) return;
    const el = panelRef.current.querySelector(`[data-skill-id="${first}"]`);
    (el as HTMLElement)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlightedCardIds]);
  const [runningSkill, setRunningSkill] = useState<SkillId | null>(null);
  /** 上一轮完成的技能 ID，用于完成后继续展示运行日志框与「查看产出」，直到用户刷新、开启下一技能或点击关闭 */
  const [lastCompletedSkillIdForLog, setLastCompletedSkillIdForLog] = useState<SkillId | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [log, setLog] = useState("");
  const [done, setDone] = useState(false);
  const [exitCode, setExitCode] = useState<number | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadStyle, setUploadStyle] = useState<"academic" | "colloquial" | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [writingReviewModalOpen, setWritingReviewModalOpen] = useState(false);
  /** 一键综述弹窗步骤：先选是否上传 → 是则上传表单，否则选默认风格 */
  const [writingReviewStep, setWritingReviewStep] = useState<"upload_choice" | "upload_style_pick" | "upload_form" | "default_style" | "no_style_options" | "confirm">("upload_choice");
  /** 在「确认」步骤中待运行的风格与提示（选择参考样例后先进入确认，再点确认并运行才真正跑） */
  const [pendingWritingStyle, setPendingWritingStyle] = useState<"zh" | "en" | "colloquial" | "none" | null>(null);
  const [pendingWritingPrompt, setPendingWritingPrompt] = useState<string>("");
  const [writingReviewPrompt, setWritingReviewPrompt] = useState("");
  /** 荟萃分析/一键综述可选：gpt | 智谱 glm-4.7-flash | 智谱 glm-5 */
  const [conceptSynthesizeModel, setConceptSynthesizeModel] = useState<"gpt" | "glm-4.7-flash" | "glm-5">("glm-4.7-flash");
  /** 主题聚类：auto=自动选k，fixed6=常规6类，custom=用户设定(2-20) */
  const [synthesizeKMode, setSynthesizeKMode] = useState<"auto" | "fixed6" | "custom">("auto");
  const [synthesizeKCustom, setSynthesizeKCustom] = useState(6);
  /** 主题聚类：输入文档，如 03_summaries/summaries_latest.md；空则用脚本默认 */
  const [synthesizeInPath, setSynthesizeInPath] = useState("");
  /** 主题聚类：运行前弹窗 */
  const [synthesizeModalOpen, setSynthesizeModalOpen] = useState(false);
  /** 荟萃分析：选具体文档（04_meta / 03_summaries 下文件名） */
  const [conceptMetaClusters, setConceptMetaClusters] = useState("");
  const [conceptBriefing, setConceptBriefing] = useState("");
  const [conceptSummaries, setConceptSummaries] = useState("");
  /** 一键综述：05_report 下输入文件名 */
  const [writingReportFile, setWritingReportFile] = useState("");
  /** 一键综述模型：初始无选中，避免误以为已选；传 API 时未选则用 glm-4.7-flash */
  const [writingModel, setWritingModel] = useState<"gpt" | "glm-4.7-flash" | "glm-5" | "">("");
  /** 荟萃分析：运行前弹窗，在弹窗内选择模型与文档 */
  const [conceptSynthesizeModalOpen, setConceptSynthesizeModalOpen] = useState(false);
  const [conceptSynthesizePendingQualityOnly, setConceptSynthesizePendingQualityOnly] = useState(false);
  const [runStartTime, setRunStartTime] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  /** 已用秒数（每秒更新），保证超过预估后仍持续刷新显示 */
  const [elapsedSec, setElapsedSec] = useState(0);
  const [journalSearchConfirmOpen, setJournalSearchConfirmOpen] = useState(false);
  /** 弹窗打开时拉取的默认值（含 journalSourceIds），用于本次运行的参数 */
  const [journalSearchModalDefaults, setJournalSearchModalDefaults] = useState<JournalSearchParams | null>(null);
  const [modalTopicInput, setModalTopicInput] = useState("");
  const [modalInstructionInput, setModalInstructionInput] = useState("");
  const [modalYearFrom, setModalYearFrom] = useState("");
  const [modalYearTo, setModalYearTo] = useState("");
  const [modalSearchMode, setModalSearchMode] = useState<"strict" | "relaxed">("strict");
  const [abortConfirmOpen, setAbortConfirmOpen] = useState(false);
  /** 一键综述（或上传/转录并综述）失败时，弹窗展示的通俗原因；由日志 [FAILURE_REASON] 解析 */
  const [writingFailureReason, setWritingFailureReason] = useState<string | null>(null);
  /** 用于暂停运行：runOne 收到 jobId 后立即写入，避免 state 未更新时点击取消拿不到 id */
  const latestJobIdRef = useRef<string | null>(null);
  const { confirm: thuConfirm, confirmThree: thuConfirmThree } = useThUAlertConfirm();

  /** 从 run 日志中解析 [FAILURE_REASON] 行，用于弹窗展示 */
  function parseFailureReason(logContent: string): string {
    const line = logContent.split("\n").find((l) => l.includes("[FAILURE_REASON]"));
    if (line) {
      const idx = line.indexOf("[FAILURE_REASON]");
      const after = line.slice(idx + "[FAILURE_REASON]".length).trim();
      if (after) return after;
    }
    return "综述生成未完成，可能因接口超时或服务异常。建议稍后重试，或查看运行日志了解详情。";
  }

  /** 弹窗内选中的管线主题（仅限已有主题），用于产出目录 outputs/<topic> */
  const [modalPipelineTopic, setModalPipelineTopic] = useState("");
  /** 重新检索弹窗内「检索类型」说明 tooltip 是否显示 */
  const [journalSearchTypeTooltipVisible, setJournalSearchTypeTooltipVisible] = useState(false);
  /** 弹窗内选中的检索学科，与侧栏文献检索一致 */
  const [modalSelectedDisciplines, setModalSelectedDisciplines] = useState<string[]>([]);
  /** 弹窗内根据学科拉取的期刊 source id 列表，用于运行检索 */
  const [modalDisciplineJournalIds, setModalDisciplineJournalIds] = useState<string[]>([]);
  const [modalDisciplinesLoading, setModalDisciplinesLoading] = useState(false);
  const modalDisciplinesRequestId = useRef(0);
  /** 重新检索弹窗内是否开启摘要补全（缺摘要时抓取出版商页等，耗时会变长） */
  const [modalAbstractFallback, setModalAbstractFallback] = useState(false);

  /** 打开重新检索弹窗时，用侧栏当前设定填充默认值；主题一律默认当前页主题，避免跑错主题（如 trace_analysis 不在列表时之前会误用第一项） */
  useEffect(() => {
    if (!journalSearchConfirmOpen) return;
    setModalPipelineTopic(topic);
    if (!getJournalSearchDefaults) return;
    const def = getJournalSearchDefaults();
    setJournalSearchModalDefaults(def);
    if (def) {
      setModalTopicInput(def.topicInput);
      setModalInstructionInput(def.instructionInput);
      setModalYearFrom(def.yearFrom != null ? String(def.yearFrom) : "");
      setModalYearTo(def.yearTo != null ? String(def.yearTo) : "");
      setModalSearchMode(def.searchMode);
      setModalAbstractFallback(def.abstractFallback ?? false);
      setModalSelectedDisciplines(def.selectedDisciplines?.length ? [...def.selectedDisciplines] : ["Sociology", "Anthropology", "Economics"]);
      setModalDisciplineJournalIds(def.journalSourceIds?.length ? [...def.journalSourceIds] : []);
    } else {
      setModalAbstractFallback(false);
      setModalSelectedDisciplines(["Sociology", "Anthropology", "Economics"]);
      setModalDisciplineJournalIds([]);
    }
  }, [journalSearchConfirmOpen, topic, availableTopics, getJournalSearchDefaults]);

  /** 打开一键综述弹窗时清除模型与风格的高亮，避免误以为已选 */
  useEffect(() => {
    if (writingReviewModalOpen) {
      setWritingModel("");
    }
  }, [writingReviewModalOpen]);

  /** 弹窗内学科变更时拉取对应期刊列表 */
  useEffect(() => {
    if (!journalSearchConfirmOpen || modalSelectedDisciplines.length === 0) {
      setModalDisciplineJournalIds([]);
      setModalDisciplinesLoading(false);
      return;
    }
    modalDisciplinesRequestId.current += 1;
    const myId = modalDisciplinesRequestId.current;
    setModalDisciplinesLoading(true);
    const params = new URLSearchParams();
    params.set("disciplines", modalSelectedDisciplines.join(","));
    fetch(`/api/journals-by-discipline?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (myId !== modalDisciplinesRequestId.current) return;
        const ids = (d.journals || [])
          .map((j: { openalex_source_id?: string }) => (j.openalex_source_id ?? "").trim())
          .filter(Boolean) as string[];
        setModalDisciplineJournalIds(ids);
      })
      .catch(() => {
        if (myId !== modalDisciplinesRequestId.current) return;
        setModalDisciplineJournalIds([]);
      })
      .finally(() => {
        if (myId !== modalDisciplinesRequestId.current) return;
        setModalDisciplinesLoading(false);
      });
  }, [journalSearchConfirmOpen, modalSelectedDisciplines]);

  // 运行状态变化时通知父组件（用于返回启动页前确认；不在此处 cleanup 以便折叠侧栏后仍能正确提示）
  const running = !!(runningSkill || jobId);
  useEffect(() => {
    onRunningChange?.(running);
  }, [running, onRunningChange]);

  // 进度与完成状态变化时通知父组件（用于右上角圆形进度浮窗与 Done 提示）
  useEffect(() => {
    if (running || done) onProgressUpdate?.(progress, done);
  }, [progress, done, running, onProgressUpdate]);

  // 运行中每秒更新已用秒数与进度条；已用秒数始终递增，保证超过预估后时间仍持续显示
  useEffect(() => {
    if (!jobId || done || runStartTime == null || !runningSkill) return;
    const estimatedSec = SKILL_ESTIMATED_SECONDS[runningSkill] ?? 180;
    const tick = () => {
      const elapsed = (Date.now() - runStartTime) / 1000;
      const sec = Math.floor(elapsed);
      setElapsedSec(sec);
      setProgress(Math.min(95, (elapsed / estimatedSec) * 100));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [jobId, done, runStartTime, runningSkill]);

  const runOne = (
    jobType: JobType,
    extraArgs?: string[],
    options?: {
      conceptSynthesizeModel?: "gpt" | "glm-4.7-flash" | "glm-5";
      writingModel?: "gpt" | "glm-4.7-flash" | "glm-5";
      qualityOnly?: boolean;
      writingStyle?: "zh" | "en" | "colloquial" | "none";
      writingPrompt?: string;
      synthesizeK?: string;
      synthesizeInPath?: string;
      conceptMetaClusters?: string;
      conceptBriefing?: string;
      conceptSummaries?: string;
      writingReportFile?: string;
    }
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      const body: {
        jobType: string;
        topic: string;
        args?: string[];
        conceptSynthesizeModel?: "gpt" | "glm-4.7-flash" | "glm-5";
        writingModel?: "gpt" | "glm-4.7-flash" | "glm-5";
        qualityOnly?: boolean;
        writingStyle?: "zh" | "en" | "colloquial" | "none";
        writingPrompt?: string;
        synthesizeK?: string;
        synthesizeInPath?: string;
        conceptMetaClusters?: string;
        conceptBriefing?: string;
        conceptSummaries?: string;
        writingReportFile?: string;
      } = { jobType, topic };
      if (Array.isArray(extraArgs) && extraArgs.length > 0) body.args = extraArgs;
      if (jobType === "synthesize" && options?.synthesizeK) body.synthesizeK = options.synthesizeK;
      if (jobType === "synthesize" && options?.synthesizeInPath) body.synthesizeInPath = options.synthesizeInPath;
      if (jobType === "concept_synthesize" && options?.conceptSynthesizeModel)
        body.conceptSynthesizeModel = options.conceptSynthesizeModel;
      if (jobType === "concept_synthesize" && options?.qualityOnly === true) body.qualityOnly = true;
      if (jobType === "concept_synthesize" && options?.conceptMetaClusters) body.conceptMetaClusters = options.conceptMetaClusters;
      if (jobType === "concept_synthesize" && options?.conceptBriefing) body.conceptBriefing = options.conceptBriefing;
      if (jobType === "concept_synthesize" && options?.conceptSummaries) body.conceptSummaries = options.conceptSummaries;
      if (
        (jobType === "writing_under_style" || jobType === "upload_and_writing" || jobType === "transcribe_submit_and_writing") &&
        options?.writingModel
      )
        body.writingModel = options.writingModel;
      if (jobType === "writing_under_style" && options?.writingStyle) body.writingStyle = options.writingStyle;
      if (jobType === "writing_under_style" && options?.writingPrompt != null) body.writingPrompt = options.writingPrompt;
      if (jobType === "writing_under_style" && options?.writingReportFile) body.writingReportFile = options.writingReportFile;
      fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
        .then((r) => r.json())
        .then((data) => {
          if (!data.jobId) {
            setError(data.error || "启动失败");
            resolve(false);
            return;
          }
          latestJobIdRef.current = data.jobId;
          setJobId(data.jobId);
          setLog("");
          setRunStartTime(Date.now());
          setProgress(0);
          setElapsedSec(0);
          onRunStarted?.(jobType);
          const poll = () => {
            fetch(`/api/logs?jobId=${data.jobId}`)
              .then((l) => l.json())
              .then((ld) => {
                setLog(ld.content ?? "");
                setDone(ld.done);
                setExitCode(ld.exitCode);
                if (ld.done) {
                  setProgress(100);
                  setRunStartTime(null);
                  setElapsedSec(0);
                  const success = ld.exitCode === 0;
                  onJobFinished?.(jobType, success);
                  if (success) {
                    onJobComplete?.(jobType);
                  } else if (
                    jobType === "writing_under_style" ||
                    jobType === "upload_and_writing" ||
                    jobType === "transcribe_submit_and_writing"
                  ) {
                    setWritingFailureReason(parseFailureReason(ld.content ?? ""));
                  }
                  resolve(ld.exitCode === 0);
                } else {
                  setTimeout(poll, 800);
                }
              });
          };
          poll();
        })
        .catch((e) => {
          setError(e instanceof Error ? e.message : "请求失败");
          resolve(false);
        });
    });
  };

  const run = async (skillId: SkillId) => {
    setError(null);

    const label = SKILLS.find((s) => s.id === skillId)?.label ?? skillId;
    const skipConfirm = skillId === "journal_search" || skillId === "synthesize" || skillId === "concept_synthesize" || skillId === "writing_under_style";
    if (!skipConfirm) {
      const go = await thuConfirm(`确定要执行「${label}」吗？`);
      if (!go) return;
    }

    if (skillId === "journal_search") {
      setJournalSearchConfirmOpen(true);
      return;
    }

    if (skillId === "paper_summarize" && !hasStageFiles(topicMeta, "01_raw")) {
      setError("尚未完成「重新检索」，请先运行该步骤。");
      return;
    }
    if (skillId === "synthesize") {
      if (!hasStageFiles(topicMeta, "03_summaries")) {
        setError("尚未完成「清洗规整」，请先运行该步骤。");
        return;
      }
      try {
        const res = await fetch(`/api/missing-abstracts?topic=${encodeURIComponent(topic)}`);
        const data = await res.json();
        const missing = data?.missing;
        if (Array.isArray(missing) && missing.length > 0) {
          const go = await thuConfirm(
            "当前摘要中存在空缺条目，建议先完成「手动补录空缺摘要」再继续。\n\n是否仍要继续？"
          );
          if (!go) return;
        }
      } catch {
        // 忽略缺失摘要接口失败，允许继续
      }
      setSynthesizeModalOpen(true);
      return;
    }
    if (skillId === "concept_synthesize" && !hasStageFiles(topicMeta, "04_meta")) {
      setError("尚未完成「荟萃分析」，请先运行该步骤。");
      return;
    }
    if (skillId === "writing_under_style" && !hasStageFiles(topicMeta, "05_report")) {
      setError("尚未完成「荟萃分析」，请先运行该步骤。");
      return;
    }

    if (skillId === "writing_under_style") {
      setWritingReviewStep("upload_choice");
      setWritingReviewModalOpen(true);
      return;
    }

    if (skillId === "concept_synthesize") {
      let qualityOnly = false;
      try {
        const qaRes = await fetch(`/api/qa-report-summary?topic=${encodeURIComponent(topic)}`);
        const qa = await qaRes.json();
        if (qa && typeof qa.total === "number" && typeof qa.outOfScopeCandidates === "number" && qa.total >= 100 && qa.outOfScopeCandidates > 0) {
          const inScope = qa.inScopeCount ?? Math.max(0, qa.total - qa.outOfScopeCandidates);
          const choice = await thuConfirmThree(
            `当前 context 量较大（共 ${qa.total} 篇，其中 ${qa.outOfScopeCandidates} 篇为质检疑似跑题）。\n\n请选择：取消运行、仍按全部文章运行、或仅用优质论文（${inScope} 篇）运行。`,
            { confirmLabel: "仅用优质论文运行" }
          );
          if (choice === "cancel") return;
          qualityOnly = choice === "confirm";
        }
      } catch {
        // 忽略 QA 接口失败
      }
      setConceptSynthesizePendingQualityOnly(qualityOnly);
      setConceptSynthesizeModalOpen(true);
      return;
    }

    setLastCompletedSkillIdForLog(null);
    latestJobIdRef.current = null;
    setJobId(null);
    setLog("");
    setDone(false);
    setExitCode(undefined);
    setRunningSkill(skillId);
    setRunStartTime(null);
    setProgress(0);
    setElapsedSec(0);

    try {
      const ok =
        skillId === "concept_synthesize"
          ? await runOne(skillId, undefined, {
              conceptSynthesizeModel,
              qualityOnly,
              conceptMetaClusters: conceptMetaClusters || undefined,
              conceptBriefing: conceptBriefing || undefined,
              conceptSummaries: conceptSummaries || undefined,
            })
          : await runOne(skillId);
      if (ok) onJobComplete?.(skillId);
      setLastCompletedSkillIdForLog(skillId);
      setRunningSkill(null);
    } catch {
      setLastCompletedSkillIdForLog(skillId);
      setRunningSkill(null);
    }
  };

  /** 上传写作样本到 assets/<style>，再执行 transcribe_submit_and_writing（转录到 references/submit/<style> + 综述） */
  const uploadAndTranscribeSubmitWriting = async (file: File): Promise<boolean> => {
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (ext !== ".pdf" && ext !== ".docx") {
      setUploadError("仅支持 .pdf 与 .docx");
      return false;
    }
    const form = new FormData();
    form.set("file", file);
    form.set("style", uploadStyle ?? "academic");
    const uploadRes = await fetch("/api/upload-style-file", { method: "POST", body: form });
    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) {
      setUploadError(uploadData.error || "上传失败");
      return false;
    }
    const savedFileName = uploadData.savedFileName as string;
    const ok = await runOne("transcribe_submit_and_writing", [uploadStyle ?? "academic", savedFileName], { writingModel: writingModel || "glm-4.7-flash" });
    if (ok) onJobComplete?.("transcribe_submit_and_writing");
    return ok;
  };

  const topicDisplay = topic ? topic.replace(/_/g, " ") : "—";

  /** 从「上传表单」确认：先上传再跑 transcribe_submit_and_writing */
  const confirmUploadAndRun = async () => {
    if (!uploadFile) return;
    setUploadError(null);
    setError(null);
    setLastCompletedSkillIdForLog(null);
    latestJobIdRef.current = null;
    setJobId(null);
    setLog("");
    setDone(false);
    setExitCode(undefined);
    setRunStartTime(null);
    setProgress(0);
    setElapsedSec(0);
    setRunningSkill("transcribe_submit_and_writing");
    setWritingReviewModalOpen(false);
    setWritingReviewStep("upload_choice");
    const ok = await uploadAndTranscribeSubmitWriting(uploadFile);
    setUploadFile(null);
    setLastCompletedSkillIdForLog("transcribe_submit_and_writing");
    setRunningSkill(null);
    if (ok) onRunStarted?.();
  };

  /** 从「确认」步骤或直接调用：跑 writing_under_style(styleChoice, prompt) */
  const startWritingReviewWithStyle = (styleChoice: "zh" | "en" | "colloquial" | "none", withPrompt: string | null) => {
    const promptToUse = withPrompt?.trim() || null;
    setWritingReviewModalOpen(false);
    setWritingReviewStep("upload_choice");
    setPendingWritingStyle(null);
    setPendingWritingPrompt("");
    setWritingReviewPrompt("");
    setUploadError(null);
    setError(null);
    setLastCompletedSkillIdForLog(null);
    latestJobIdRef.current = null;
    setJobId(null);
    setLog("");
    setDone(false);
    setExitCode(undefined);
    setRunStartTime(null);
    setProgress(0);
    setElapsedSec(0);
    setRunningSkill("writing_under_style");
    runOne("writing_under_style", undefined, {
      writingModel: writingModel || "glm-4.7-flash",
      writingStyle: styleChoice,
      writingPrompt: promptToUse ?? undefined,
      writingReportFile: writingReportFile || undefined,
    })
      .then(() => {
        setLastCompletedSkillIdForLog("writing_under_style");
        setRunningSkill(null);
      })
      .catch(() => {
        setLastCompletedSkillIdForLog("writing_under_style");
        setRunningSkill(null);
      });
    onRunStarted?.();
  };

  return (
    <div ref={panelRef} className="space-y-3">
      {journalDataSourceLabel && (
        <p className="text-[11px] text-[var(--text-muted)] leading-snug">
          当前数据源：OpenAlex 解析（Sociology, Anthropology, Economics的Q1期刊)。如需更改检索学科，请前往「新增检索」侧栏重新选择。
        </p>
      )}
      <div className="rounded-[var(--radius-md)] border border-[var(--border-soft)] bg-[var(--bg-sidebar)] px-3 py-2">
        <p className="text-xs text-[var(--text-muted)]">
          当前主题：<span className="font-medium text-[var(--text)]">{topicDisplay}</span>
        </p>
        {onTopicChange && availableTopics.length > 0 && (
          <div className="mt-2">
            <label className="mb-1 block text-[11px] text-[var(--text-muted)]">切换主题</label>
            <select
              value={topic}
              onChange={(e) => {
                const v = e.target.value;
                if (v) onTopicChange(v);
              }}
              className="thu-input w-full rounded-lg border border-[var(--border-soft)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text)]"
            >
              {availableTopics.map((t) => (
                <option key={t.topic} value={t.topic}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <p className="text-[11px] text-[var(--text-muted)] leading-snug">
        顺序：① 重新检索 → ② 清洗规整 → ③ 荟萃分析 → ④ 文献简报 → ⑤ 一键综述（可选在弹窗内上传写作样本）
      </p>
      <div className="space-y-1.5">
        {SKILLS.map((s) => (
          <div key={s.id}>
            <div
              data-skill-id={s.id}
              className={`card-modern flex items-center gap-2 rounded-[var(--radius-md)] border p-2.5 transition-all duration-200 ${
                highlightSet.has(s.id)
                  ? "skill-card-highlight border-[var(--thu-purple)]"
                  : "border-[var(--border-soft)] bg-[var(--bg-card)]"
              }`}
            >
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--thu-purple)] text-[10px] font-medium text-white shadow-sm">
                {s.step}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-[var(--text)]">{s.label}</div>
                <div className="text-[11px] text-[var(--text-muted)] leading-tight">{s.desc}</div>
              </div>
              <button
                type="button"
                onClick={() => run(s.id)}
                disabled={s.id === "journal_search" ? (!!journalSearchJobId && !journalSearchDone) || !!runningSkill : !!runningSkill || !topic}
                className="thu-btn-primary flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                {runningSkill === s.id || (s.id === "journal_search" && journalSearchJobId && !journalSearchDone) ? "…" : "运行"}
              </button>
            </div>
            {/* 重新检索：运行日志放在本卡片下方，数据来自页面 */}
            {s.id === "journal_search" && journalSearchJobId && (
              <div className="mt-1.5 rounded-[var(--radius-md)] border border-[var(--border-soft)] bg-[var(--bg-sidebar)] p-2.5" data-run-log-section="skills" data-run-log-skill="journal_search">
                {!journalSearchDone && (
                  <div className="mb-2 space-y-2 rounded-lg border border-[var(--thu-purple)] bg-[var(--thu-purple-subtle)] px-2.5 py-2">
                    <div className="flex items-center gap-2">
                      <div className="run-status-spinner h-6 w-6 flex-shrink-0 rounded-full border-2 border-[var(--thu-purple)] border-t-transparent" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-[var(--text)]">重新检索 · 正在运行</p>
                        <p className="text-[11px] text-[var(--text-muted)]">进度 {Math.round(journalSearchProgress)}%</p>
                      </div>
                      {onAbortJournalSearch && (
                        <button type="button" onClick={onAbortJournalSearch} className="thu-modal-btn-secondary flex-shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium">
                          暂停运行
                        </button>
                      )}
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-card)]">
                      <div className="h-full rounded-full bg-[var(--thu-purple)] transition-[width] duration-500 ease-out" style={{ width: `${Math.round(journalSearchProgress)}%` }} role="progressbar" aria-valuenow={Math.round(journalSearchProgress)} aria-valuemin={0} aria-valuemax={100} />
                    </div>
                  </div>
                )}
                {journalSearchDone && (
                  <div className="mb-2 flex items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--bg-card)] px-2.5 py-1.5">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--bg-sidebar)]">
                      <div className="h-full w-full rounded-full bg-[var(--thu-purple)]" style={{ width: "100%" }} role="progressbar" aria-valuenow={100} aria-valuemin={0} aria-valuemax={100} />
                    </div>
                    <span className="text-[11px] font-medium text-[var(--text-muted)]">100%</span>
                  </div>
                )}
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-[var(--text-muted)]">运行日志</span>
                  {onDismissJournalSearchLog && (
                    <button
                      type="button"
                      onClick={onDismissJournalSearchLog}
                      className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--border-soft)] hover:text-[var(--text)]"
                      aria-label="关闭运行日志"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
                <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-[var(--bg-card)] p-2 text-[11px] text-[var(--text)]">{journalSearchLog || "（等待…）"}</pre>
                {journalSearchDone && (
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <span className={journalSearchExitCode === 0 ? "text-[var(--text)]" : "text-[var(--accent)]"}>{journalSearchExitCode === 0 ? "✓ 完成" : `退出 ${journalSearchExitCode}`}</span>
                    {onJumpToOutputs && (
                      <button type="button" onClick={onJumpToOutputs} className="thu-title hover:underline">查看产出</button>
                    )}
                  </div>
                )}
              </div>
            )}
            {/* 其他技能：运行日志放在对应卡片下方；完成后保留直到用户刷新、开启下一技能或点击关闭 */}
            {s.id !== "journal_search" && (runningSkill === s.id || lastCompletedSkillIdForLog === s.id) && (
              <div className="mt-1.5 rounded-[var(--radius-md)] border border-[var(--border-soft)] bg-[var(--bg-sidebar)] p-2.5" data-run-log-section="skills" data-run-log-skill={s.id}>
                {!done && runningSkill === s.id && (
                  <div className="mb-2 space-y-2 rounded-lg border border-[var(--thu-purple)] bg-[var(--thu-purple-subtle)] px-2.5 py-2">
                    <div className="flex items-center gap-2">
                      <div className="run-status-spinner h-6 w-6 flex-shrink-0 rounded-full border-2 border-[var(--thu-purple)] border-t-transparent" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-[var(--text)]">
                          {jobId ? "正在运行" : "正在启动"} · {SKILLS.find((sk) => sk.id === runningSkill)?.label ?? EXTRA_RUNNING_LABELS[runningSkill] ?? runningSkill}
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          {runStartTime != null && runningSkill
                            ? (() => {
                                const estSec = SKILL_ESTIMATED_SECONDS[runningSkill] ?? 180;
                                const estMin = Math.round(estSec / 60);
                                return `预估约 ${estMin} 分钟（仅供参考）· 已用 ${elapsedSec} 秒 · 进度 ${Math.round(progress)}%`;
                              })()
                            : "正在启动…"}
                        </p>
                      </div>
                      <button type="button" onClick={() => setAbortConfirmOpen(true)} disabled={!jobId} className="thu-modal-btn-secondary flex-shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium disabled:opacity-50">
                        暂停运行
                      </button>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-card)]">
                      <div className="h-full rounded-full bg-[var(--thu-purple)] transition-[width] duration-500 ease-out" style={{ width: `${Math.round(runStartTime == null ? 0 : progress)}%` }} role="progressbar" aria-valuenow={Math.round(runStartTime == null ? 0 : progress)} aria-valuemin={0} aria-valuemax={100} />
                    </div>
                  </div>
                )}
                {((done && runningSkill === s.id) || lastCompletedSkillIdForLog === s.id) && (
                  <div className="mb-2 flex items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--bg-card)] px-2.5 py-1.5">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--bg-sidebar)]">
                      <div className="h-full w-full rounded-full bg-[var(--thu-purple)]" style={{ width: "100%" }} role="progressbar" aria-valuenow={100} aria-valuemin={0} aria-valuemax={100} />
                    </div>
                    <span className="text-[11px] font-medium text-[var(--text-muted)]">100%</span>
                  </div>
                )}
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-[var(--text-muted)]">运行日志</span>
                  {(done || lastCompletedSkillIdForLog === s.id) && (
                    <button
                      type="button"
                      onClick={() => setLastCompletedSkillIdForLog(null)}
                      className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--border-soft)] hover:text-[var(--text)]"
                      aria-label="关闭运行日志"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
                <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-[var(--bg-card)] p-2 text-[11px] text-[var(--text)]">{log || "（等待…）"}</pre>
                {(done || lastCompletedSkillIdForLog === s.id) && (
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <span className={exitCode === 0 ? "text-[var(--text)]" : "text-[var(--accent)]"}>{exitCode === 0 ? "✓ 完成" : `退出 ${exitCode}`}</span>
                    {onJumpToOutputs && <button type="button" onClick={onJumpToOutputs} className="thu-title hover:underline">查看产出</button>}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {abortConfirmOpen && jobId && (
        <div className="thu-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="abort-confirm-title" onClick={() => setAbortConfirmOpen(false)}>
          <div className="thu-modal-card relative mx-4 w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setAbortConfirmOpen(false)} className="thu-modal-close absolute right-4 top-4 p-1" aria-label="关闭">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h3 id="abort-confirm-title" className="thu-modal-title mb-3 text-base pr-8">暂停运行</h3>
            <p className="mb-4 text-sm text-[var(--text)]">是否中止当前技能运行？</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setAbortConfirmOpen(false)}
                className="thu-modal-btn-secondary rounded-lg px-3 py-2 text-sm font-medium"
              >
                继续运行
              </button>
              <button
                type="button"
                onClick={async () => {
                  const idToAbort = latestJobIdRef.current || jobId;
                  setAbortConfirmOpen(false);
                  if (idToAbort) {
                    try {
                      const res = await fetch("/api/run/abort", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ jobId: idToAbort }),
                      });
                      if (res.ok) {
                        setLastCompletedSkillIdForLog(runningSkill ?? null);
                        setJobId(null);
                        setRunningSkill(null);
                        setDone(true);
                        setRunStartTime(null);
                        setProgress(0);
                        setElapsedSec(0);
                      }
                    } catch {
                      setLastCompletedSkillIdForLog(runningSkill ?? null);
                      setJobId(null);
                      setRunningSkill(null);
                      setDone(true);
                    }
                  }
                }}
                className="thu-modal-btn-primary rounded-lg px-3 py-2 text-sm font-medium"
              >
                确认取消
              </button>
            </div>
          </div>
        </div>
      )}
      {synthesizeModalOpen && (
        <div className="thu-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="synthesize-modal-title" onClick={() => setSynthesizeModalOpen(false)}>
          <div className="thu-modal-card relative mx-4 w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setSynthesizeModalOpen(false)} className="thu-modal-close absolute right-4 top-4 p-1" aria-label="关闭">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h3 id="synthesize-modal-title" className="thu-modal-title mb-3 text-base pr-8">荟萃分析</h3>
            <div className="mb-4 space-y-3">
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-[var(--text-muted)]">聚类数</label>
                <div className="flex flex-col gap-1.5">
                  <button type="button" onClick={() => setSynthesizeKMode("auto")} className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-all ${synthesizeKMode === "auto" ? "border-[var(--thu-purple)] bg-[var(--thu-purple-subtle)] text-[var(--text)]" : "border-[var(--border-soft)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:border-[var(--border)]"}`}>
                    自动聚类（AI 测算最优）
                  </button>
                  <button type="button" onClick={() => setSynthesizeKMode("fixed6")} className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-all ${synthesizeKMode === "fixed6" ? "border-[var(--thu-purple)] bg-[var(--thu-purple-subtle)] text-[var(--text)]" : "border-[var(--border-soft)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:border-[var(--border)]"}`}>
                    常规 6 类
                  </button>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setSynthesizeKMode("custom")} className={`flex-1 rounded-lg border px-2.5 py-2 text-left text-xs transition-all ${synthesizeKMode === "custom" ? "border-[var(--thu-purple)] bg-[var(--thu-purple-subtle)] text-[var(--text)]" : "border-[var(--border-soft)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:border-[var(--border)]"}`}>
                      自定义
                    </button>
                    <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                      <input type="number" min={2} max={20} value={synthesizeKCustom} onChange={(e) => { const v = parseInt(e.target.value, 10); if (!Number.isNaN(v)) setSynthesizeKCustom(Math.min(20, Math.max(2, v))); }} onFocus={() => setSynthesizeKMode("custom")} className="w-12 rounded border border-[var(--border-soft)] bg-[var(--bg-card)] px-1.5 py-1 text-center text-[var(--text)]" />
                      类（2–20）
                    </label>
                  </div>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-[var(--text-muted)]">摘要文档（03_summaries）</label>
                <select value={synthesizeInPath} onChange={(e) => setSynthesizeInPath(e.target.value)} className="thu-input w-full rounded border border-[var(--border-soft)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text)]">
                  <option value="">默认（summaries_latest.md）</option>
                  {(topicMeta?.stages?.find((s) => s.id === "03_summaries")?.files ?? []).map((f) => (<option key={f.path} value={`03_summaries/${f.name}`}>{f.name}</option>))}
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setSynthesizeModalOpen(false)} className="thu-modal-btn-secondary rounded-lg px-3 py-2 text-sm font-medium">取消</button>
              <button
                type="button"
                onClick={async () => {
                  setSynthesizeModalOpen(false);
                  setLastCompletedSkillIdForLog(null);
                  latestJobIdRef.current = null;
                  setJobId(null);
                  setLog("");
                  setDone(false);
                  setExitCode(undefined);
                  setRunningSkill("synthesize");
                  setRunStartTime(null);
                  setProgress(0);
                  setElapsedSec(0);
                  const ok = await runOne("synthesize", undefined, {
                    synthesizeK: synthesizeKMode === "auto" ? "auto" : synthesizeKMode === "fixed6" ? "6" : String(Math.min(20, Math.max(2, synthesizeKCustom))),
                    synthesizeInPath: synthesizeInPath || undefined,
                  });
                  if (ok) onJobComplete?.("synthesize");
                  setLastCompletedSkillIdForLog("synthesize");
                  setRunningSkill(null);
                  onRunStarted?.();
                }}
                className="thu-modal-btn-primary rounded-lg px-3 py-2 text-sm font-medium"
              >
                确认运行
              </button>
            </div>
          </div>
        </div>
      )}
      {conceptSynthesizeModalOpen && (
        <div className="thu-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="concept-synthesize-modal-title" onClick={() => setConceptSynthesizeModalOpen(false)}>
          <div className="thu-modal-card relative mx-4 w-full max-w-md p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setConceptSynthesizeModalOpen(false)} className="thu-modal-close absolute right-4 top-4 p-1" aria-label="关闭">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h3 id="concept-synthesize-modal-title" className="thu-modal-title mb-3 text-base pr-8">文献简报</h3>
            <p className="mb-3 text-sm text-[var(--text-muted)]">选择模型与输入文档后点击「确认运行」。</p>
            <div className="mb-4 space-y-3">
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-[var(--text-muted)]">选择模型</label>
                <div className="flex flex-col gap-1.5">
                  <button type="button" onClick={() => setConceptSynthesizeModel("gpt")} className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-all ${conceptSynthesizeModel === "gpt" ? "border-[var(--thu-purple)] bg-[var(--thu-purple-subtle)] text-[var(--text)]" : "border-[var(--border-soft)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:border-[var(--border)]"}`}>
                    <img src="/llm/chatgpt_logo.png" alt="" className="h-5 w-5 flex-shrink-0 object-contain llm-logo llm-logo--openai" />
                    <span>OpenAI GPT-5.2</span>
                  </button>
                  <button type="button" onClick={() => setConceptSynthesizeModel("glm-4.7-flash")} className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-all ${conceptSynthesizeModel === "glm-4.7-flash" ? "border-[var(--thu-purple)] bg-[var(--thu-purple-subtle)] text-[var(--text)]" : "border-[var(--border-soft)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:border-[var(--border)]"}`}>
                    <img src="/llm/zhipu_z_icon.svg" alt="" className="h-5 w-5 flex-shrink-0 object-contain llm-logo llm-logo--zhipu" />
                    <span>智谱 GLM-4.7-Flash</span>
                  </button>
                  <button type="button" onClick={() => setConceptSynthesizeModel("glm-5")} className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-all ${conceptSynthesizeModel === "glm-5" ? "border-[var(--thu-purple)] bg-[var(--thu-purple-subtle)] text-[var(--text)]" : "border-[var(--border-soft)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:border-[var(--border)]"}`}>
                    <img src="/llm/zhipu_z_icon.svg" alt="" className="h-5 w-5 flex-shrink-0 object-contain llm-logo llm-logo--zhipu" />
                    <span>智谱 GLM-5</span>
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-[var(--text-muted)]">元聚类（04_meta）</label>
                <select value={conceptMetaClusters} onChange={(e) => setConceptMetaClusters(e.target.value)} className="thu-input w-full rounded border border-[var(--border-soft)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text)]">
                  <option value="">默认（meta_clusters_latest.md）</option>
                  {(topicMeta?.stages?.find((s) => s.id === "04_meta")?.files ?? []).map((f) => (<option key={f.path} value={f.name}>{f.name}</option>))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-[var(--text-muted)]">简报（04_meta）</label>
                <select value={conceptBriefing} onChange={(e) => setConceptBriefing(e.target.value)} className="thu-input w-full rounded border border-[var(--border-soft)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text)]">
                  <option value="">默认（briefing_latest.md）</option>
                  {(topicMeta?.stages?.find((s) => s.id === "04_meta")?.files ?? []).map((f) => (<option key={f.path} value={f.name}>{f.name}</option>))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-[var(--text-muted)]">摘要（03_summaries）</label>
                <select value={conceptSummaries} onChange={(e) => setConceptSummaries(e.target.value)} className="thu-input w-full rounded border border-[var(--border-soft)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text)]">
                  <option value="">默认（summaries_latest.md）</option>
                  {(topicMeta?.stages?.find((s) => s.id === "03_summaries")?.files ?? []).map((f) => (<option key={f.path} value={f.name}>{f.name}</option>))}
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setConceptSynthesizeModalOpen(false)} className="thu-modal-btn-secondary rounded-lg px-3 py-2 text-sm font-medium">取消</button>
              <button
                type="button"
                onClick={async () => {
                  setConceptSynthesizeModalOpen(false);
                  setLastCompletedSkillIdForLog(null);
                  latestJobIdRef.current = null;
                  setJobId(null);
                  setLog("");
                  setDone(false);
                  setExitCode(undefined);
                  setRunningSkill("concept_synthesize");
                  setRunStartTime(null);
                  setProgress(0);
                  setElapsedSec(0);
                  const ok = await runOne("concept_synthesize", undefined, {
                    conceptSynthesizeModel,
                    qualityOnly: conceptSynthesizePendingQualityOnly,
                    conceptMetaClusters: conceptMetaClusters || undefined,
                    conceptBriefing: conceptBriefing || undefined,
                    conceptSummaries: conceptSummaries || undefined,
                  });
                  if (ok) onJobComplete?.("concept_synthesize");
                  setLastCompletedSkillIdForLog("concept_synthesize");
                  setRunningSkill(null);
                  onRunStarted?.();
                }}
                className="thu-modal-btn-primary rounded-lg px-3 py-2 text-sm font-medium"
              >
                确认运行
              </button>
            </div>
          </div>
        </div>
      )}
      {writingFailureReason && (
        <div
          className="thu-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="writing-failure-reason-title"
          onClick={() => setWritingFailureReason(null)}
        >
          <div className="thu-modal-card relative mx-4 w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setWritingFailureReason(null)}
              className="thu-modal-close absolute right-4 top-4 p-1"
              aria-label="关闭"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h3 id="writing-failure-reason-title" className="thu-modal-title mb-3 text-base pr-8">综述生成未完成</h3>
            <p className="mb-4 text-sm text-[var(--text)] leading-relaxed whitespace-pre-wrap">{writingFailureReason}</p>
            <p className="mb-4 text-[11px] text-[var(--text-muted)]">失败说明已写入当前主题的「一键综述」产出文件顶部，可打开 06_review 下最新文档查看。</p>
            <button
              type="button"
              onClick={() => setWritingFailureReason(null)}
              className="thu-modal-btn-primary rounded-lg px-3 py-2 text-sm font-medium"
            >
              知道了
            </button>
          </div>
        </div>
      )}
      {journalSearchConfirmOpen && (
        <div className="thu-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="journal-search-confirm-title" onClick={() => setJournalSearchConfirmOpen(false)}>
          <div className="thu-modal-card relative mx-4 w-full max-w-md p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setJournalSearchConfirmOpen(false)} className="thu-modal-close absolute right-4 top-4 z-10 p-1 shrink-0" aria-label="关闭">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h3 id="journal-search-confirm-title" className="thu-modal-title mb-3 text-base pr-8">重新检索</h3>
            <p className="mb-3 text-xs text-[var(--text-muted)]">可在下方调整检索选项（默认沿用当前设定），确认后直接运行。</p>
            <div className="mb-4 space-y-3">
              <label className="block">
                <span className="text-[11px] text-[var(--text-muted)]">主题</span>
                <select
                  value={modalPipelineTopic}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) setModalPipelineTopic(v);
                  }}
                  className="thu-input mt-1 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text)]"
                >
                  {(() => {
                    const hasCurrent = availableTopics.some((t) => t.topic === topic);
                    const options = hasCurrent ? availableTopics : [{ topic, label: topic.replace(/_/g, " ") }, ...availableTopics];
                    return options.map((t) => (
                      <option key={t.topic} value={t.topic}>
                        {t.label}
                      </option>
                    ));
                  })()}
                </select>
                <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">产出将保存到该主题下；默认当前页主题，可切换为其他已有主题。</p>
              </label>
              {onFocusLiteratureSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setJournalSearchConfirmOpen(false);
                    onFocusLiteratureSearch();
                  }}
                  className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--bg-sidebar)] px-3 py-2 text-sm font-medium text-[var(--thu-purple)] transition-colors hover:bg-[var(--thu-purple-subtle)]"
                  aria-label="关闭弹窗并定位到新增检索"
                >
                  检索新主题
                </button>
              )}
              <div className="space-y-2">
                <span className="text-[11px] text-[var(--text-muted)]">检索学科</span>
                <div className="flex flex-col gap-1.5">
                  {DISCIPLINES.map((d) => (
                    <label
                      key={d.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--bg-card)] px-3 py-2 text-sm transition-colors has-[:checked]:border-[var(--thu-purple)] has-[:checked]:bg-[var(--thu-purple-subtle)]"
                    >
                      <input
                        type="checkbox"
                        checked={modalSelectedDisciplines.includes(d.id)}
                        onChange={() => {
                          setModalSelectedDisciplines((prev) =>
                            prev.includes(d.id) ? prev.filter((x) => x !== d.id) : [...prev, d.id]
                          );
                        }}
                        className="h-3.5 w-3.5 shrink-0 rounded border-[var(--border)] accent-[var(--thu-purple)]"
                      />
                      {d.label}
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {modalDisciplinesLoading ? "加载中…" : `共 ${modalDisciplineJournalIds.length} 本期刊（已选学科）`}
                </p>
              </div>
              <label className="block">
                <span className="text-[11px] text-[var(--text-muted)]">提示词（可选）</span>
                <textarea
                  value={modalInstructionInput}
                  onChange={(e) => setModalInstructionInput(e.target.value)}
                  placeholder="例如：在选定期刊中搜索数字劳动相关、2024-2026年间的论文"
                  rows={2}
                  className="thu-input mt-1 w-full rounded-lg px-3 py-2 text-sm resize-y"
                />
              </label>
              <div className="flex gap-2">
                <label className="flex-1">
                  <span className="text-[11px] text-[var(--text-muted)]">年份起</span>
                  <select
                    value={modalYearFrom}
                    onChange={(e) => setModalYearFrom(e.target.value)}
                    className="thu-input mt-1 w-full rounded-lg px-3 py-2 text-sm bg-[var(--bg-card)]"
                  >
                    <option value="">不限定</option>
                    {YEAR_OPTIONS.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </label>
                <label className="flex-1">
                  <span className="text-[11px] text-[var(--text-muted)]">年份止</span>
                  <select
                    value={modalYearTo}
                    onChange={(e) => setModalYearTo(e.target.value)}
                    className="thu-input mt-1 w-full rounded-lg px-3 py-2 text-sm bg-[var(--bg-card)]"
                  >
                    <option value="">不限定</option>
                    {YEAR_OPTIONS.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-[var(--text-muted)]">检索类型</span>
                  <span
                    className="relative inline-flex h-[1em] w-[1em] cursor-help items-center justify-center rounded-full border border-current text-[11px]"
                    onMouseEnter={() => setJournalSearchTypeTooltipVisible(true)}
                    onMouseLeave={() => setJournalSearchTypeTooltipVisible(false)}
                    aria-label="检索类型说明"
                  >
                    <span className="opacity-70">ⓘ</span>
                    {journalSearchTypeTooltipVisible && (
                      <span
                        className="absolute bottom-full left-0 z-50 mb-1 w-56 rounded-lg border border-gray-200 px-2.5 py-2 text-[11px] leading-snug shadow-lg"
                        role="tooltip"
                        style={{ backgroundColor: "#ffffff", color: "#1c1924", opacity: 1 }}
                      >
                        {SEARCH_TYPE_TOOLTIP}
                      </span>
                    )}
                  </span>
                </div>
                <div className="mt-1 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setModalSearchMode("strict")}
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                      modalSearchMode === "strict"
                        ? "bg-[#660874] text-white"
                        : "border border-[var(--border-soft)] bg-[var(--bg-sidebar)] text-[var(--text-muted)]"
                    }`}
                  >
                    严格检索
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalSearchMode("relaxed")}
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                      modalSearchMode === "relaxed"
                        ? "text-white"
                        : "border border-[var(--border-soft)] bg-[var(--bg-sidebar)] text-[var(--text-muted)]"
                    }`}
                    style={modalSearchMode === "relaxed" ? { background: "linear-gradient(135deg, #c92d6a 0%, #d93379 50%, #e85a9a 100%)" } : undefined}
                  >
                    宽松检索
                  </button>
                </div>
              </div>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--bg-card)] px-3 py-2 text-sm transition-colors has-[:checked]:border-[var(--thu-purple)] has-[:checked]:bg-[var(--thu-purple-subtle)]">
                <input
                  type="checkbox"
                  checked={modalAbstractFallback}
                  onChange={(e) => setModalAbstractFallback(e.target.checked)}
                  className="h-3.5 w-3.5 shrink-0 rounded border-[var(--border)] accent-[var(--thu-purple)]"
                />
                <span>摘要补全</span>
                <span className="text-[11px] text-[var(--text-muted)]">（缺摘要时抓取出版商页，耗时会变长）</span>
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setJournalSearchConfirmOpen(false)}
                className="thu-modal-btn-secondary rounded-lg px-3 py-2 text-sm font-medium"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  const topicSlug = modalPipelineTopic || toSlug(modalInstructionInput) || topic || "digital_labor";
                  const from = modalYearFrom ? parseInt(modalYearFrom, 10) : undefined;
                  const to = modalYearTo ? parseInt(modalYearTo, 10) : undefined;
                  setJournalSearchConfirmOpen(false);
                  const instr = (modalInstructionInput || "").trim() || undefined;
                  onRunJournalSearch?.({
                    topicSlug,
                    journalSourceIds: modalDisciplineJournalIds,
                    yearFrom: from && !Number.isNaN(from) ? from : undefined,
                    yearTo: to && !Number.isNaN(to) ? to : undefined,
                    searchMode: modalSearchMode,
                    instruction: instr,
                    abstractFallback: modalAbstractFallback,
                  });
                }}
                disabled={modalSelectedDisciplines.length === 0 || modalDisciplineJournalIds.length === 0 || modalDisciplinesLoading}
                className="thu-modal-btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                确认并运行
              </button>
            </div>
          </div>
        </div>
      )}
      {writingReviewModalOpen && (
        <div className="thu-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="writing-review-modal-title" onClick={() => setWritingReviewModalOpen(false)}>
          <div className="thu-modal-card relative mx-4 flex w-full max-w-md flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <div className="flex-shrink-0 px-5 pt-5 pr-12 pb-0">
              <h3 id="writing-review-modal-title" className="thu-modal-title text-base">一键综述</h3>
            </div>
            <button type="button" onClick={() => setWritingReviewModalOpen(false)} className="thu-modal-close absolute right-4 top-4 z-10 p-1 shrink-0" aria-label="关闭">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">

            {writingReviewStep === "upload_choice" && (
              <>
                <p className="mb-4 text-sm text-[var(--text)]">是否上传写作案例？</p>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => { setUploadStyle(null); setWritingReviewStep("upload_style_pick"); }}
                    className="thu-modal-btn-primary rounded-lg px-3 py-2 text-sm font-medium"
                  >
                    是，上传我的写作样例
                  </button>
                  <button
                    type="button"
                    onClick={() => setWritingReviewStep("default_style")}
                    className="thu-modal-btn-secondary rounded-lg px-3 py-2 text-sm font-medium"
                  >
                    否，参考既有风格
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPendingWritingStyle("none"); setWritingReviewStep("no_style_options"); }}
                    className="thu-modal-btn-secondary rounded-lg px-3 py-2 text-sm font-medium"
                  >
                    否，不参考任何样例，直接生成内容
                  </button>
                </div>
              </>
            )}

            {writingReviewStep === "upload_style_pick" && (
              <>
                <p className="mb-3 text-sm text-[var(--text)]">请先选择写作样本类型（必选其一后才会出现「下一步」）</p>
                <div className="mb-3 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setUploadStyle("academic")}
                    className={`rounded-lg px-3 py-2 text-sm font-medium text-left transition-all ${uploadStyle === "academic" ? "thu-modal-btn-primary" : "border border-[var(--border-soft)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:border-[var(--border)]"}`}
                  >
                    学术型
                  </button>
                  <button
                    type="button"
                    onClick={() => setUploadStyle("colloquial")}
                    className={`rounded-lg px-3 py-2 text-sm font-medium text-left transition-all ${uploadStyle === "colloquial" ? "thu-modal-btn-primary" : "border border-[var(--border-soft)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:border-[var(--border)]"}`}
                  >
                    通俗型
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setWritingReviewStep("upload_choice")} className="thu-modal-btn-secondary rounded-lg px-3 py-1.5 text-xs">返回</button>
                  {uploadStyle && (
                    <button type="button" onClick={() => setWritingReviewStep("upload_form")} className="thu-modal-btn-primary rounded-lg px-3 py-2 text-sm font-medium">下一步：上传样例</button>
                  )}
                </div>
              </>
            )}

            {writingReviewStep === "upload_form" && uploadStyle && (
              <>
                <p className="mb-3 text-xs text-[var(--text-muted)]">类型：{uploadStyle === "academic" ? "学术型" : "通俗型"}。文件将保存到 assets/{uploadStyle}，转录结果保存到 references/submit/{uploadStyle}。</p>
                <div className="mb-3 flex items-center gap-2">
                  <input
                    type="file"
                    accept=".pdf,.docx"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      setUploadFile(f ?? null);
                      setUploadError(null);
                    }}
                    className="text-[11px] text-[var(--text)] file:mr-2 file:rounded file:border-0 file:bg-[var(--thu-purple-subtle)] file:px-2 file:py-1 file:text-xs file:font-medium file:text-[var(--thu-purple)]"
                  />
                  {uploadFile && <span className="text-[11px] text-[var(--text-muted)]">{uploadFile.name}</span>}
                </div>
                {uploadError && <p className="mb-2 text-xs text-[var(--accent)]">{uploadError}</p>}
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setWritingReviewStep("upload_style_pick")} className="thu-modal-btn-secondary rounded-lg px-3 py-1.5 text-xs">返回</button>
                  <button type="button" onClick={confirmUploadAndRun} disabled={!uploadFile} className="thu-modal-btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50">确认并运行</button>
                </div>
              </>
            )}

            {writingReviewStep === "default_style" && (
              <>
                <p className="mb-1 text-sm font-medium text-[var(--text)]">默认风格：请先选学术型或通俗型</p>
                <p className="mb-3 text-xs text-[var(--text-muted)]">学术型可进一步选中文或英文样例；通俗型使用内置默认样例。所选类型将同时使用内置默认样例与您上传的该类型写作样例（侧栏「写作样例」可管理）。</p>
                <div className="mb-3 space-y-3">
                  <div>
                    <p className="mb-1.5 text-[11px] font-medium text-[var(--text-muted)]">学术型</p>
                    <div className="flex flex-col gap-1.5">
                      <button
                        type="button"
                        onClick={() => { setPendingWritingStyle("zh"); setPendingWritingPrompt(writingReviewPrompt); setWritingReviewStep("confirm"); }}
                        className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--bg-card)] px-3 py-2 text-left text-sm font-medium text-[var(--text-muted)] transition-all hover:border-[var(--border)]"
                      >
                        参考中文样例
                      </button>
                      <button
                        type="button"
                        onClick={() => { setPendingWritingStyle("en"); setPendingWritingPrompt(writingReviewPrompt); setWritingReviewStep("confirm"); }}
                        className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--bg-card)] px-3 py-2 text-left text-sm font-medium text-[var(--text-muted)] transition-all hover:border-[var(--border)]"
                      >
                        参考英文样例
                      </button>
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-[11px] font-medium text-[var(--text-muted)]">通俗型</p>
                    <button
                      type="button"
                      onClick={() => { setPendingWritingStyle("colloquial"); setPendingWritingPrompt(writingReviewPrompt); setWritingReviewStep("confirm"); }}
                      className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--bg-card)] px-3 py-2 text-left text-sm font-medium text-[var(--text-muted)] transition-all hover:border-[var(--border)]"
                    >
                      使用通俗型默认样例
                    </button>
                  </div>
                </div>
                <div className="mb-3 space-y-1">
                  <label className="block text-[11px] text-[var(--text-muted)]">额外提示词（可选）</label>
                  <textarea
                    value={writingReviewPrompt}
                    onChange={(e) => setWritingReviewPrompt(e.target.value)}
                    placeholder="例如：突出某主题、避免某表述…"
                    rows={2}
                    className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--bg-page)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--thu-purple)] focus:outline-none"
                  />
                </div>
                <div className="mb-3">
                  <label className="mb-1.5 block text-[11px] font-medium text-[var(--text-muted)]">选择模型</label>
                  <div className="flex flex-col gap-1.5">
                    <button type="button" onClick={() => setWritingModel("gpt")} className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-all ${writingModel === "gpt" ? "border-[var(--thu-purple)] bg-[var(--thu-purple-subtle)] text-[var(--text)]" : "border-[var(--border-soft)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:border-[var(--border)]"}`}>
                      <img src="/llm/chatgpt_logo.png" alt="" className="h-5 w-5 flex-shrink-0 object-contain llm-logo llm-logo--openai" />
                      <span>OpenAI GPT-5.2</span>
                    </button>
                    <button type="button" onClick={() => setWritingModel("glm-4.7-flash")} className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-all ${writingModel === "glm-4.7-flash" ? "border-[var(--thu-purple)] bg-[var(--thu-purple-subtle)] text-[var(--text)]" : "border-[var(--border-soft)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:border-[var(--border)]"}`}>
                      <img src="/llm/zhipu_z_icon.svg" alt="" className="h-5 w-5 flex-shrink-0 object-contain llm-logo llm-logo--zhipu" />
                      <span>智谱 GLM-4.7-Flash</span>
                    </button>
                    <button type="button" onClick={() => setWritingModel("glm-5")} className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-all ${writingModel === "glm-5" ? "border-[var(--thu-purple)] bg-[var(--thu-purple-subtle)] text-[var(--text)]" : "border-[var(--border-soft)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:border-[var(--border)]"}`}>
                      <img src="/llm/zhipu_z_icon.svg" alt="" className="h-5 w-5 flex-shrink-0 object-contain llm-logo llm-logo--zhipu" />
                      <span>智谱 GLM-5</span>
                    </button>
                  </div>
                </div>
                <div className="mb-3">
                  <label className="mb-1 block text-[11px] font-medium text-[var(--text-muted)]">输入文档（05_report）</label>
                  <select value={writingReportFile} onChange={(e) => setWritingReportFile(e.target.value)} className="thu-input w-full rounded border border-[var(--border-soft)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text)]">
                    <option value="">默认（chunks 或 report_latest.md）</option>
                    {(topicMeta?.stages?.find((s) => s.id === "05_report")?.files ?? []).map((f) => (<option key={f.path} value={f.name}>{f.name}</option>))}
                  </select>
                </div>
                <button type="button" onClick={() => setWritingReviewStep("upload_choice")} className="thu-modal-btn-secondary rounded-lg px-3 py-1.5 text-xs">返回</button>
              </>
            )}

            {writingReviewStep === "no_style_options" && (
              <>
                <p className="mb-1 text-sm font-medium text-[var(--text)]">不参考任何写作样例，直接生成综述</p>
                <p className="mb-3 text-xs text-[var(--text-muted)]">请选择模型与输入文档（可选填额外提示词）。</p>
                <div className="mb-3 space-y-1">
                  <label className="block text-[11px] text-[var(--text-muted)]">额外提示词（可选）</label>
                  <textarea
                    value={writingReviewPrompt}
                    onChange={(e) => setWritingReviewPrompt(e.target.value)}
                    placeholder="例如：突出某主题、避免某表述…"
                    rows={2}
                    className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--bg-page)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--thu-purple)] focus:outline-none"
                  />
                </div>
                <div className="mb-3">
                  <label className="mb-1.5 block text-[11px] font-medium text-[var(--text-muted)]">选择模型</label>
                  <div className="flex flex-col gap-1.5">
                    <button type="button" onClick={() => setWritingModel("gpt")} className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-all ${writingModel === "gpt" ? "border-[var(--thu-purple)] bg-[var(--thu-purple-subtle)] text-[var(--text)]" : "border-[var(--border-soft)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:border-[var(--border)]"}`}>
                      <img src="/llm/chatgpt_logo.png" alt="" className="h-5 w-5 flex-shrink-0 object-contain llm-logo llm-logo--openai" />
                      <span>OpenAI GPT-5.2</span>
                    </button>
                    <button type="button" onClick={() => setWritingModel("glm-4.7-flash")} className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-all ${writingModel === "glm-4.7-flash" ? "border-[var(--thu-purple)] bg-[var(--thu-purple-subtle)] text-[var(--text)]" : "border-[var(--border-soft)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:border-[var(--border)]"}`}>
                      <img src="/llm/zhipu_z_icon.svg" alt="" className="h-5 w-5 flex-shrink-0 object-contain llm-logo llm-logo--zhipu" />
                      <span>智谱 GLM-4.7-Flash</span>
                    </button>
                    <button type="button" onClick={() => setWritingModel("glm-5")} className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-all ${writingModel === "glm-5" ? "border-[var(--thu-purple)] bg-[var(--thu-purple-subtle)] text-[var(--text)]" : "border-[var(--border-soft)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:border-[var(--border)]"}`}>
                      <img src="/llm/zhipu_z_icon.svg" alt="" className="h-5 w-5 flex-shrink-0 object-contain llm-logo llm-logo--zhipu" />
                      <span>智谱 GLM-5</span>
                    </button>
                  </div>
                </div>
                <div className="mb-3">
                  <label className="mb-1 block text-[11px] font-medium text-[var(--text-muted)]">输入文档（05_report）</label>
                  <select value={writingReportFile} onChange={(e) => setWritingReportFile(e.target.value)} className="thu-input w-full rounded border border-[var(--border-soft)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text)]">
                    <option value="">默认（chunks 或 report_latest.md）</option>
                    {(topicMeta?.stages?.find((s) => s.id === "05_report")?.files ?? []).map((f) => (<option key={f.path} value={f.name}>{f.name}</option>))}
                  </select>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setWritingReviewStep("upload_choice")} className="thu-modal-btn-secondary rounded-lg px-3 py-1.5 text-xs">返回</button>
                  <button type="button" onClick={() => { setPendingWritingPrompt(writingReviewPrompt); setWritingReviewStep("confirm"); }} className="thu-modal-btn-primary rounded-lg px-3 py-2 text-sm font-medium">下一步</button>
                </div>
              </>
            )}

            {writingReviewStep === "confirm" && pendingWritingStyle && (
              <>
                <p className="mb-3 text-sm font-medium text-[var(--text)]">请确认您的设置后运行</p>
                <dl className="mb-3 space-y-1.5 rounded-lg border border-[var(--border-soft)] bg-[var(--bg-card)] px-3 py-2 text-xs">
                  <div className="flex gap-2">
                    <dt className="text-[var(--text-muted)] shrink-0">参考样例：</dt>
                    <dd className="text-[var(--text)]">
                      {pendingWritingStyle === "zh" && "中文学术型（academic-2a / 2b）"}
                      {pendingWritingStyle === "en" && "英文学术型（academic-1a / 1b）"}
                      {pendingWritingStyle === "colloquial" && "通俗型默认样例"}
                      {pendingWritingStyle === "none" && "不参考任何风格"}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-[var(--text-muted)] shrink-0">模型：</dt>
                    <dd className="text-[var(--text)]">{writingModel === "gpt" ? "OpenAI GPT-5.2" : writingModel === "glm-5" ? "智谱 GLM-5" : writingModel === "glm-4.7-flash" ? "智谱 GLM-4.7-Flash" : "未选择（将使用智谱 GLM-4.7-Flash）"}</dd>
                  </div>
                  {writingReportFile && (
                    <div className="flex gap-2">
                      <dt className="text-[var(--text-muted)] shrink-0">输入文档：</dt>
                      <dd className="text-[var(--text)]">{writingReportFile}</dd>
                    </div>
                  )}
                  {pendingWritingPrompt && (
                    <div className="flex gap-2">
                      <dt className="text-[var(--text-muted)] shrink-0">额外提示：</dt>
                      <dd className="text-[var(--text)] break-words">{pendingWritingPrompt}</dd>
                    </div>
                  )}
                </dl>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setWritingReviewStep(pendingWritingStyle === "none" ? "no_style_options" : "default_style")} className="thu-modal-btn-secondary rounded-lg px-3 py-1.5 text-xs">返回修改</button>
                  <button
                    type="button"
                    onClick={() => startWritingReviewWithStyle(pendingWritingStyle, pendingWritingPrompt || null)}
                    className="thu-modal-btn-primary rounded-lg px-3 py-2 text-sm font-medium"
                  >
                    确认并运行
                  </button>
                </div>
              </>
            )}

            {writingReviewStep === "upload_choice" && (
              <button
                type="button"
                onClick={() => { setWritingReviewModalOpen(false); setWritingReviewStep("upload_choice"); setWritingReviewPrompt(""); setUploadError(null); }}
                className="thu-modal-btn-secondary mt-3 rounded-lg px-3 py-1.5 text-xs"
              >
                取消
              </button>
            )}

            </div>
          </div>
        </div>
      )}
      {error && (
        <p className="text-xs text-[var(--accent)]">{error}</p>
      )}
    </div>
  );
}
