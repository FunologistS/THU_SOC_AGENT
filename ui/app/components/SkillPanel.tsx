"use client";

import { useState } from "react";
import type { JobType } from "@/app/types";

const TOPIC_REGEX = /^[a-z0-9_/-]+$/;
function isValidTopicSlug(s: string): boolean {
  const t = s.trim();
  return t.length > 0 && t.length <= 120 && TOPIC_REGEX.test(t);
}

/** 5 步：层层递进，对应后端 jobType */
export type SkillId = JobType;

const SKILLS: { step: number; id: SkillId; label: string; desc: string }[] = [
  { step: 1, id: "journal_search", label: "批量检索", desc: "第一层：按期刊与主题抓取论文，汇聚为 01_raw 原始论文集" },
  { step: 2, id: "paper_summarize", label: "清洗规整", desc: "第二层：清洗去噪得 02_clean，再归纳为 03_summaries 结构化摘要" },
  { step: 3, id: "synthesize", label: "主题聚类", desc: "第三层：对摘要做主题聚类与统计，产出 04_meta 聚类与简报" },
  { step: 4, id: "concept_synthesize", label: "荟萃分析", desc: "第四层：在聚类基础上做概念合成，形成 05_report 概念报告" },
  { step: 5, id: "writing_under_style", label: "文献简报", desc: "第五层：将概念报告改写为学术风格段落，定稿输出 06_review 文献简报" },
];

/** 说明书技能悬停时高亮的左侧卡片 id 列表（与 manual skill id 映射一致） */
export function SkillPanel({
  topic,
  onTopicChange,
  onJumpToOutputs,
  highlightedCardIds = [],
}: {
  topic: string;
  onTopicChange?: (newTopic: string) => void;
  onJumpToOutputs?: () => void;
  highlightedCardIds?: string[];
}) {
  const highlightSet = new Set(highlightedCardIds);
  const [topicInput, setTopicInput] = useState("");
  const [topicError, setTopicError] = useState<string | null>(null);
  const [runningSkill, setRunningSkill] = useState<SkillId | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [log, setLog] = useState("");
  const [done, setDone] = useState(false);
  const [exitCode, setExitCode] = useState<number | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadStyle, setUploadStyle] = useState<"academic" | "colloquial">("academic");
  const [uploadError, setUploadError] = useState<string | null>(null);

  const applyTopic = () => {
    const raw = topicInput.trim();
    setTopicError(null);
    if (!raw) return;
    if (!isValidTopicSlug(raw)) {
      setTopicError("主题仅允许小写字母、数字、下划线、连字符与斜杠");
      return;
    }
    onTopicChange?.(raw);
    setTopicInput("");
  };

  const runOne = (jobType: JobType, extraArgs?: string[]): Promise<boolean> => {
    return new Promise((resolve) => {
      fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          extraArgs ? { jobType, topic, args: extraArgs } : { jobType, topic }
        ),
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
                else resolve(ld.exitCode === 0);
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
    setJobId(null);
    setLog("");
    setDone(false);
    setExitCode(undefined);
    setRunningSkill(skillId);

    try {
      await runOne(skillId);
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
      await runOne("upload_and_writing", [uploadStyle, savedFileName]);
      setUploadFile(null);
      setRunningSkill(null);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "请求失败");
      setRunningSkill(null);
    }
  };

  const topicDisplay = topic ? topic.replace(/_/g, " ") : "—";

  return (
    <div className="space-y-3">
      <div className="rounded-[var(--radius-md)] border border-[var(--border-soft)] bg-[var(--bg-sidebar)] px-3 py-2">
        <p className="text-xs text-[var(--text-muted)]">
          当前主题：<span className="font-medium text-[var(--text)]">{topicDisplay}</span>
        </p>
        {onTopicChange && (
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyTopic()}
              placeholder="新主题，如 digital_labor"
              className="thu-input min-w-0 flex-1 rounded-lg px-2 py-1.5 text-sm"
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
        {topicError && (
          <p className="mt-1 text-xs text-[var(--accent)]">{topicError}</p>
        )}
      </div>
      <p className="text-[11px] text-[var(--text-muted)] leading-snug">
        顺序：① 批量检索 → ② 清洗规整 → ③ 主题聚类 → ④ 荟萃分析 → 上传写作样本 → ⑤ 文献简报
      </p>
      <div className="grid gap-1.5">
        {SKILLS.slice(0, 4).map((s) => (
          <div
            key={s.id}
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
        <div
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
        {SKILLS.slice(4).map((s) => (
          <div
            key={s.id}
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
      </div>
      {error && (
        <p className="text-xs text-[var(--accent)]">{error}</p>
      )}
      {jobId && (
        <div className="rounded-[var(--radius-md)] border border-[var(--border-soft)] bg-[var(--bg-sidebar)] p-2.5">
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
