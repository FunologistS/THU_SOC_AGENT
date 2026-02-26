"use client";

import { useState, useRef, useEffect } from "react";
import type { JobType } from "@/app/types";
import type { TopicMeta } from "@/app/types";

const TOPIC_REGEX = /^[a-z0-9_/-]+$/;
function isValidTopicSlug(s: string): boolean {
  const t = s.trim();
  return t.length > 0 && t.length <= 120 && TOPIC_REGEX.test(t);
}

/** 5 步：层层递进，对应后端 jobType */
export type SkillId = JobType;

const SKILLS: { step: number; id: SkillId; label: string; desc: string }[] = [
  { step: 1, id: "journal_search", label: "检索范围筛选", desc: "选期刊数据源（学科/分区/年份）与主题，批量抓取论文（01_raw）" },
  { step: 2, id: "paper_summarize", label: "清洗规整", desc: "清洗去噪（02_clean），并生成结构化摘要（03_summaries）" },
  { step: 3, id: "synthesize", label: "主题聚类", desc: "基于结构化摘要做主题聚类，梳理主要研究方向，生成元数据（04_meta）" },
  { step: 4, id: "concept_synthesize", label: "荟萃分析", desc: "在元数据的基础上作荟萃分析，生成文献简报（05_report）" },
  { step: 5, id: "writing_under_style", label: "一键综述", desc: "若用户未上传则采用默认样本作为参考，若用户上传写作样本则以用户新上传样本为参考，将文献简报改写为成文综述" },
];

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
  highlightedCardIds = [],
  topicMeta = null,
  journalDataSourceLabel = null,
}: {
  topic: string;
  availableTopics?: { topic: string; label: string }[];
  onTopicChange?: (newTopic: string) => void;
  onJumpToOutputs?: () => void;
  /** 任务成功结束时调用，传入刚完成的 skillId，用于「查看产出」跳转到对应阶段 */
  onJobComplete?: (skillId: SkillId) => void;
  highlightedCardIds?: string[];
  /** 当前主题的产出 meta，用于依赖检查（未完成前置步骤时提示） */
  topicMeta?: TopicMeta | null;
  /** 当前期刊数据源展示名（来自检索范围筛选 / 期刊数据库），用于灰色提示 */
  journalDataSourceLabel?: string | null;
}) {
  const highlightSet = new Set(highlightedCardIds);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const first = highlightedCardIds?.[0];
    if (!first || !panelRef.current) return;
    const el = panelRef.current.querySelector(`[data-skill-id="${first}"]`);
    (el as HTMLElement)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlightedCardIds]);
  const [topicInput, setTopicInput] = useState("");
  const [topicError, setTopicError] = useState<string | null>(null);
  const [applyEmptyError, setApplyEmptyError] = useState(false);
  const [runningSkill, setRunningSkill] = useState<SkillId | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [log, setLog] = useState("");
  const [done, setDone] = useState(false);
  const [exitCode, setExitCode] = useState<number | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadStyle, setUploadStyle] = useState<"academic" | "colloquial">("academic");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [writingReviewModalOpen, setWritingReviewModalOpen] = useState(false);
  const [writingReviewPrompt, setWritingReviewPrompt] = useState("");
  const [conceptSynthesizeModel, setConceptSynthesizeModel] = useState<"gpt" | "glm">("glm");
  const [conceptSynthesizeModelOpen, setConceptSynthesizeModelOpen] = useState(false);
  const [writingModel, setWritingModel] = useState<"gpt" | "glm">("glm");
  const [writingModelOpen, setWritingModelOpen] = useState(false);

  const applyTopic = () => {
    const raw = topicInput.trim();
    setTopicError(null);
    setApplyEmptyError(false);
    if (!raw) {
      setApplyEmptyError(true);
      return;
    }
    if (!isValidTopicSlug(raw)) {
      setTopicError("主题仅允许小写字母、数字、下划线、连字符与斜杠");
      return;
    }
    onTopicChange?.(raw);
    setTopicInput("");
  };

  const runOne = (
    jobType: JobType,
    extraArgs?: string[],
    options?: { conceptSynthesizeModel?: "gpt" | "glm"; writingModel?: "gpt" | "glm" }
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      const body: {
        jobType: string;
        topic: string;
        args?: string[];
        conceptSynthesizeModel?: "gpt" | "glm";
        writingModel?: "gpt" | "glm";
      } = { jobType, topic };
      if (Array.isArray(extraArgs) && extraArgs.length > 0) body.args = extraArgs;
      if (jobType === "concept_synthesize" && options?.conceptSynthesizeModel)
        body.conceptSynthesizeModel = options.conceptSynthesizeModel;
      if ((jobType === "writing_under_style" || jobType === "upload_and_writing") && options?.writingModel)
        body.writingModel = options.writingModel;
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
          setJobId(data.jobId);
          setLog("");
          const poll = () => {
            fetch(`/api/logs?jobId=${data.jobId}`)
              .then((l) => l.json())
              .then((ld) => {
                setLog(ld.content ?? "");
                setDone(ld.done);
                setExitCode(ld.exitCode);
                if (!ld.done) setTimeout(poll, 800);
                else {
                  if (ld.exitCode === 0) onJobComplete?.(jobType);
                  resolve(ld.exitCode === 0);
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

    if (skillId === "paper_summarize" && !hasStageFiles(topicMeta, "01_raw")) {
      setError("尚未完成「检索范围筛选」，请先运行该步骤。");
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
          const go = window.confirm(
            "当前摘要中存在空缺条目，建议先完成「摘要空缺须手动补录」再继续。\n\n是否仍要继续？"
          );
          if (!go) return;
        }
      } catch {
        // 忽略缺失摘要接口失败，允许继续
      }
    }
    if (skillId === "concept_synthesize" && !hasStageFiles(topicMeta, "04_meta")) {
      setError("尚未完成「主题聚类」，请先运行该步骤。");
      return;
    }
    if (skillId === "writing_under_style" && !hasStageFiles(topicMeta, "05_report")) {
      setError("尚未完成「荟萃分析」，请先运行该步骤。");
      return;
    }

    if (skillId === "writing_under_style") {
      setWritingReviewModalOpen(true);
      return;
    }

    setJobId(null);
    setLog("");
    setDone(false);
    setExitCode(undefined);
    setRunningSkill(skillId);

    try {
      const ok =
        skillId === "concept_synthesize"
          ? await runOne(skillId, undefined, { conceptSynthesizeModel })
          : await runOne(skillId);
      if (ok) onJobComplete?.(skillId);
      setRunningSkill(null);
    } catch {
      setRunningSkill(null);
    }
  };

  const runUploadAndWriting = async () => {
    if (!uploadFile || !topic) return;
    setUploadError(null);
    setError(null);
    setJobId(null);
    setLog("");
    setDone(false);
    setExitCode(undefined);
    setRunningSkill("upload_and_writing");

    const ext = uploadFile.name.slice(uploadFile.name.lastIndexOf(".")).toLowerCase();
    if (ext !== ".pdf" && ext !== ".docx") {
      setUploadError("仅支持 .pdf 与 .docx");
      setRunningSkill(null);
      return;
    }

    try {
      const form = new FormData();
      form.set("file", uploadFile);
      form.set("style", uploadStyle);
      const uploadRes = await fetch("/api/upload-style-file", {
        method: "POST",
        body: form,
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) {
        setUploadError(uploadData.error || "上传失败");
        setRunningSkill(null);
        return;
      }
      const savedFileName = uploadData.savedFileName as string;
      const ok = await runOne("upload_and_writing", [uploadStyle, savedFileName], { writingModel });
      if (ok) onJobComplete?.("upload_and_writing");
      setUploadFile(null);
      setRunningSkill(null);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "请求失败");
      setRunningSkill(null);
    }
  };

  const topicDisplay = topic ? topic.replace(/_/g, " ") : "—";

  const startWritingReview = (withPrompt: string | null) => {
    setWritingReviewModalOpen(false);
    const promptToUse = withPrompt?.trim() || null;
    setWritingReviewPrompt("");
    setJobId(null);
    setLog("");
    setDone(false);
    setExitCode(undefined);
    setRunningSkill("writing_under_style");
    runOne(
      "writing_under_style",
      promptToUse ? [promptToUse] : undefined,
      { writingModel }
    )
      .then(() => setRunningSkill(null))
      .catch(() => setRunningSkill(null));
  };

  return (
    <div ref={panelRef} className="space-y-3">
      {journalDataSourceLabel && (
        <p className="text-[11px] text-[var(--text-muted)] leading-snug">
          当前数据源：{journalDataSourceLabel}
          <br />
          <span className="text-[10px]">如需更改数据源，请前往「检索范围筛选」选择期刊数据库。</span>
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
                if (v) {
                  setTopicError(null);
                  setApplyEmptyError(false);
                  onTopicChange(v);
                }
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
        {onTopicChange && (
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={topicInput}
              onChange={(e) => {
                setTopicInput(e.target.value);
                setApplyEmptyError(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && applyTopic()}
              placeholder="新主题，如 digital_labor"
              className={`thu-input min-w-0 flex-1 rounded-lg px-2 py-1.5 text-sm ${applyEmptyError ? "border-[var(--accent)] ring-1 ring-[var(--accent)]" : ""}`}
            />
            <button
              type="button"
              onClick={applyTopic}
              className="thu-btn-primary flex-shrink-0 rounded-lg px-2 py-1.5 text-sm font-medium"
            >
              应用
            </button>
          </div>
        )}
        {(topicError || applyEmptyError) && (
          <p className="mt-1 text-xs text-[var(--accent)]">
            {applyEmptyError ? "必须输入内容" : topicError}
          </p>
        )}
      </div>
      <p className="text-[11px] text-[var(--text-muted)] leading-snug">
        顺序：① 检索范围筛选 → ② 清洗规整 → ③ 主题聚类 → ④ 荟萃分析 → 上传写作样本 → ⑤ 一键综述
      </p>
      <div className="grid gap-1.5">
        {SKILLS.slice(0, 3).map((s) => (
          <div
            key={s.id}
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
              disabled={!!runningSkill || !topic}
              className="thu-btn-primary flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              {runningSkill === s.id ? "…" : "运行"}
            </button>
          </div>
        ))}
        {/* ④ 荟萃分析：可选 GPT / GLM */}
        <div
          data-skill-id="concept_synthesize"
          className={`card-modern rounded-[var(--radius-md)] border p-2.5 transition-all duration-200 ${
            highlightSet.has("concept_synthesize")
              ? "skill-card-highlight border-[var(--thu-purple)]"
              : "border-[var(--border-soft)] bg-[var(--bg-card)]"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--thu-purple)] text-[10px] font-medium text-white shadow-sm">
              4
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-[var(--text)]">荟萃分析</div>
              <div className="text-[11px] text-[var(--text-muted)] leading-tight">
                在元数据的基础上作荟萃分析，生成文献简报（05_report）
              </div>
            </div>
            <button
              type="button"
              onClick={() => run("concept_synthesize")}
              disabled={!!runningSkill || !topic}
              className="thu-btn-primary flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              {runningSkill === "concept_synthesize" ? "…" : "运行"}
            </button>
          </div>
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setConceptSynthesizeModelOpen((o) => !o)}
              className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <span className="inline-block transition-transform" style={{ transform: conceptSynthesizeModelOpen ? "rotate(90deg)" : "none" }}>
                ▶
              </span>
              选择模型：{conceptSynthesizeModel === "gpt" ? "OpenAI GPT-5.2" : "智谱 GLM-4.7-Flash"}
            </button>
            {conceptSynthesizeModelOpen && (
              <div className="mt-1.5 flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => setConceptSynthesizeModel("gpt")}
                  className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-all ${
                    conceptSynthesizeModel === "gpt"
                      ? "border-[var(--thu-purple)] bg-[var(--thu-purple-subtle)] text-[var(--text)]"
                      : "border-[var(--border-soft)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:border-[var(--border)]"
                  }`}
                  aria-pressed={conceptSynthesizeModel === "gpt"}
                >
                  <img src="/llm/chatgpt_logo.png" alt="" className="h-5 w-5 flex-shrink-0 object-contain" />
                  <span>OpenAI GPT-5.2</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConceptSynthesizeModel("glm")}
                  className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-all ${
                    conceptSynthesizeModel === "glm"
                      ? "border-[var(--thu-purple)] bg-[var(--thu-purple-subtle)] text-[var(--text)]"
                      : "border-[var(--border-soft)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:border-[var(--border)]"
                  }`}
                  aria-pressed={conceptSynthesizeModel === "glm"}
                >
                  <img src="/llm/zhipu_z_icon.svg" alt="" className="h-5 w-5 flex-shrink-0 object-contain" />
                  <span>智谱 GLM-4.7-Flash</span>
                </button>
              </div>
            )}
          </div>
        </div>
        <div
          data-skill-id="upload_and_writing"
          className={`card-modern rounded-[var(--radius-md)] border p-2.5 space-y-2 transition-all duration-200 ${
            highlightSet.has("upload_and_writing")
              ? "skill-card-highlight border-[var(--thu-purple)]"
              : "border-[var(--border-soft)] bg-[var(--bg-card)]"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[10px] font-medium text-white shadow-sm">
              ·
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-[var(--text)]">上传写作样本</div>
              <div className="text-[11px] text-[var(--text-muted)] leading-tight">
                上传 PDF/Word，选学术型或通俗型，依次执行：转录 → 压缩分块 → 风格改写 → RAG 索引
              </div>
            </div>
            <button
              type="button"
              onClick={runUploadAndWriting}
              disabled={!!runningSkill || !topic || !uploadFile}
              className="thu-btn-primary flex-shrink-0 self-center rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              {runningSkill === "upload_and_writing" ? "…" : "运行"}
            </button>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input
                type="radio"
                name="uploadStyle"
                checked={uploadStyle === "academic"}
                onChange={() => setUploadStyle("academic")}
                className="rounded-full border-[var(--border)]"
              />
              <span>学术型</span>
            </label>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input
                type="radio"
                name="uploadStyle"
                checked={uploadStyle === "colloquial"}
                onChange={() => setUploadStyle("colloquial")}
                className="rounded-full border-[var(--border)]"
              />
              <span>通俗型</span>
            </label>
          </div>
          <div className="flex items-center gap-2">
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
          </div>
          {uploadError && (
            <p className="text-xs text-[var(--accent)]">{uploadError}</p>
          )}
        </div>
        {/* ⑤ 一键综述：可选 GPT / GLM */}
        <div
          data-skill-id="writing_under_style"
          className={`card-modern rounded-[var(--radius-md)] border p-2.5 transition-all duration-200 ${
            highlightSet.has("writing_under_style")
              ? "skill-card-highlight border-[var(--thu-purple)]"
              : "border-[var(--border-soft)] bg-[var(--bg-card)]"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--thu-purple)] text-[10px] font-medium text-white shadow-sm">
              5
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-[var(--text)]">一键综述</div>
              <div className="text-[11px] text-[var(--text-muted)] leading-tight">
                若用户未上传则采用默认样本作为参考，若用户上传写作样本则以用户新上传样本为参考，将文献简报改写为成文综述
              </div>
            </div>
            <button
              type="button"
              onClick={() => run("writing_under_style")}
              disabled={!!runningSkill || !topic}
              className="thu-btn-primary flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              {runningSkill === "writing_under_style" ? "…" : "运行"}
            </button>
          </div>
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setWritingModelOpen((o) => !o)}
              className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <span className="inline-block transition-transform" style={{ transform: writingModelOpen ? "rotate(90deg)" : "none" }}>
                ▶
              </span>
              选择模型：{writingModel === "gpt" ? "OpenAI GPT-5.2" : "智谱 GLM-4.7-Flash"}
            </button>
            {writingModelOpen && (
              <div className="mt-1.5 flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => setWritingModel("gpt")}
                  className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-all ${
                    writingModel === "gpt"
                      ? "border-[var(--thu-purple)] bg-[var(--thu-purple-subtle)] text-[var(--text)]"
                      : "border-[var(--border-soft)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:border-[var(--border)]"
                  }`}
                  aria-pressed={writingModel === "gpt"}
                >
                  <img src="/llm/chatgpt_logo.png" alt="" className="h-5 w-5 flex-shrink-0 object-contain" />
                  <span>OpenAI GPT-5.2</span>
                </button>
                <button
                  type="button"
                  onClick={() => setWritingModel("glm")}
                  className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-all ${
                    writingModel === "glm"
                      ? "border-[var(--thu-purple)] bg-[var(--thu-purple-subtle)] text-[var(--text)]"
                      : "border-[var(--border-soft)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:border-[var(--border)]"
                  }`}
                  aria-pressed={writingModel === "glm"}
                >
                  <img src="/llm/zhipu_z_icon.svg" alt="" className="h-5 w-5 flex-shrink-0 object-contain" />
                  <span>智谱 GLM-4.7-Flash</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {writingReviewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true" aria-labelledby="writing-review-modal-title">
          <div className="mx-4 w-full max-w-md rounded-xl border border-[var(--border-soft)] bg-[var(--bg-card)] p-4 shadow-thu-soft">
            <h3 id="writing-review-modal-title" className="mb-3 text-sm font-medium text-[var(--text)]">一键综述</h3>
            <p className="mb-3 text-xs text-[var(--text-muted)]">选择直接生成，或输入额外提示词后再生成。</p>
            <div className="mb-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => startWritingReview(null)}
                className="rounded-lg bg-[var(--thu-purple)] px-3 py-2 text-sm font-medium text-white shadow-thu-soft hover:opacity-90"
              >
                直接生成综述
              </button>
              <div className="space-y-2">
                <label className="block text-[11px] text-[var(--text-muted)]">额外提示词（可选）</label>
                <textarea
                  value={writingReviewPrompt}
                  onChange={(e) => setWritingReviewPrompt(e.target.value)}
                  placeholder="例如：突出某主题、避免某表述、强调政策含义…"
                  rows={3}
                  className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--bg-page)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--thu-purple)] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => startWritingReview(writingReviewPrompt)}
                  className="rounded-lg border border-[var(--border-soft)] bg-[var(--bg-card)] px-3 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--thu-purple-subtle)]"
                >
                  带提示词生成
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setWritingReviewModalOpen(false); setWritingReviewPrompt(""); }}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              取消
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="text-xs text-[var(--accent)]">{error}</p>
      )}
      {jobId && (
        <div className="rounded-[var(--radius-md)] border border-[var(--border-soft)] bg-[var(--bg-sidebar)] p-2.5">
          {!done && (
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-[var(--thu-purple)] bg-[var(--thu-purple-subtle)] px-2.5 py-2">
              <div
                className="run-status-spinner h-6 w-6 flex-shrink-0 rounded-full border-2 border-[var(--thu-purple)] border-t-transparent"
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-[var(--text)]">正在运行…</p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  预计{(() => {
                    const eta: Record<string, string> = {
                      journal_search: "约 1–5 分钟",
                      paper_summarize: "约 2–8 分钟",
                      synthesize: "约 1–3 分钟",
                      concept_synthesize: "约 2–5 分钟",
                      upload_and_writing: "约 5–15 分钟",
                      writing_under_style: "约 3–10 分钟",
                    };
                    const dur = runningSkill ? eta[runningSkill] ?? "数" : "数";
                    const label = runningSkill ? SKILLS.find((s) => s.id === runningSkill)?.label ?? runningSkill : "";
                    return label ? ` ${dur}分钟（${label}）` : ` ${dur}分钟`;
                  })()}
                </p>
              </div>
            </div>
          )}
          <div className="mb-1 text-[11px] font-medium text-[var(--text-muted)]">运行日志</div>
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-[var(--bg-card)] p-2 text-[11px] text-[var(--text)]">
            {log || "（等待…）"}
          </pre>
          {done && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className={exitCode === 0 ? "text-[var(--text)]" : "text-[var(--accent)]"}>
                {exitCode === 0 ? "✓ 完成" : `退出 ${exitCode}`}
              </span>
              {onJumpToOutputs && (
                <button
                  type="button"
                  onClick={onJumpToOutputs}
                  className="thu-title hover:underline"
                >
                  查看产出
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
