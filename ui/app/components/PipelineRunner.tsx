"use client";

import { useState, useEffect } from "react";
import type { JobType } from "@/app/types";

const JOB_LABELS: Record<JobType, string> = {
  journal_search: "文献检索",
  paper_summarize: "文章归纳 (paper_summarize)",
  synthesize: "文献整合 (synthesize)",
  concept_synthesize: "概念合成 (荟萃分析)",
  writing_under_style: "综述仿写 (writing_under_style)",
};

const JOB_ESTIMATED_SEC: Record<JobType, number> = {
  journal_search: 180,
  filter: 120,
  paper_summarize: 300,
  synthesize: 120,
  concept_synthesize: 210,
  upload_and_writing: 600,
  writing_under_style: 390,
};

export function PipelineRunner({
  topic,
  onJumpToOutputs,
}: {
  topic: string;
  onJumpToOutputs?: () => void;
}) {
  const [jobType, setJobType] = useState<JobType>("concept_synthesize");
  const [conceptSynthesizeModel, setConceptSynthesizeModel] = useState<"gpt" | "glm-4.7-flash" | "glm-5">("glm-4.7-flash");
  const [jobId, setJobId] = useState<string | null>(null);
  const [log, setLog] = useState("");
  const [done, setDone] = useState(false);
  const [exitCode, setExitCode] = useState<number | undefined>();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runStartTime, setRunStartTime] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [abortConfirmOpen, setAbortConfirmOpen] = useState(false);

  const run = async () => {
    setError(null);
    setJobId(null);
    setLog("");
    setDone(false);
    setExitCode(undefined);
    setRunStartTime(null);
    setProgress(0);
    setRunning(true);
    try {
      const body: { jobType: string; topic: string; conceptSynthesizeModel?: "gpt" | "glm-4.7-flash" | "glm-5" } = {
        jobType,
        topic,
      };
      if (jobType === "concept_synthesize") body.conceptSynthesizeModel = conceptSynthesizeModel;
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Run failed");
        setRunning(false);
        return;
      }
      setJobId(data.jobId);
      setRunStartTime(Date.now());
      setProgress(0);
      const poll = async () => {
        const lres = await fetch(`/api/logs?jobId=${data.jobId}`);
        const ldata = await lres.json();
        setLog(ldata.content);
        setDone(ldata.done);
        setExitCode(ldata.exitCode);
        if (ldata.done) {
          setProgress(100);
          setRunStartTime(null);
          setRunning(false);
        } else {
          setTimeout(poll, 800);
        }
      };
      poll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      setRunning(false);
    }
  };

  useEffect(() => {
    if (!jobId || done || runStartTime == null) return;
    const estimatedSec = JOB_ESTIMATED_SEC[jobType] ?? 180;
    const tick = () => {
      const elapsed = (Date.now() - runStartTime) / 1000;
      setProgress(Math.min(95, (elapsed / estimatedSec) * 100));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [jobId, done, runStartTime, jobType]);

  return (
    <div className="border border-[var(--border)] rounded-lg bg-[var(--bg-sidebar)] p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-[var(--text-muted)]">运行技能</span>
        <select
          value={jobType}
          onChange={(e) => setJobType(e.target.value as JobType)}
          className="rounded border border-[var(--border)] bg-white px-2 py-1 text-sm"
          disabled={running}
        >
          {(Object.keys(JOB_LABELS) as JobType[]).map((k) => (
            <option key={k} value={k}>
              {JOB_LABELS[k]}
            </option>
          ))}
        </select>
        {jobType === "concept_synthesize" && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConceptSynthesizeModel("gpt")}
              className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition-all ${
                conceptSynthesizeModel === "gpt"
                  ? "border-[var(--thu-purple)] bg-[var(--thu-purple-subtle)]"
                  : "border-[var(--border)] bg-white"
              }`}
            >
              <img src="/llm/chatgpt_logo.png" alt="" className="h-4 w-4 object-contain" />
              <span>OpenAI GPT-5.2</span>
            </button>
            <button
              type="button"
              onClick={() => setConceptSynthesizeModel("glm-4.7-flash")}
              className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition-all ${
                conceptSynthesizeModel === "glm-4.7-flash"
                  ? "border-[var(--thu-purple)] bg-[var(--thu-purple-subtle)]"
                  : "border-[var(--border)] bg-white"
              }`}
            >
              <img src="/llm/zhipu_z_icon.svg" alt="" className="h-4 w-4 object-contain" />
              <span>智谱 GLM-4.7-Flash</span>
            </button>
            <button
              type="button"
              onClick={() => setConceptSynthesizeModel("glm-5")}
              className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition-all ${
                conceptSynthesizeModel === "glm-5"
                  ? "border-[var(--thu-purple)] bg-[var(--thu-purple-subtle)]"
                  : "border-[var(--border)] bg-white"
              }`}
            >
              <img src="/llm/zhipu_z_icon.svg" alt="" className="h-4 w-4 object-contain" />
              <span>智谱 GLM-5</span>
            </button>
          </div>
        )}
        <span className="text-sm text-[var(--text-muted)]">topic: {topic}</span>
        <button
          onClick={run}
          disabled={running || !topic}
          className="thu-btn-primary rounded-lg px-3 py-2 text-sm font-medium shadow-thu-soft disabled:opacity-50 transition-colors"
        >
          {running ? "运行中…" : "运行"}
        </button>
      </div>
      {error && (
        <p className="text-sm text-[var(--accent)]">{error}</p>
      )}
      {jobId && (
        <>
          {running && runStartTime != null && (
            <div className="mb-2 space-y-2 rounded-lg border border-[var(--thu-purple)] bg-[var(--thu-purple-subtle)] px-2.5 py-2">
              <div className="flex items-center gap-2">
                <div
                  className="run-status-spinner h-6 w-6 flex-shrink-0 rounded-full border-2 border-[var(--thu-purple)] border-t-transparent"
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-[var(--text)]">正在运行 · {JOB_LABELS[jobType]}</p>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    预估约 {Math.round((JOB_ESTIMATED_SEC[jobType] ?? 180) / 60)} 分钟 · 已用 {Math.floor((Date.now() - runStartTime) / 1000)} 秒 · 进度 {Math.round(progress)}%
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAbortConfirmOpen(true)}
                  className="thu-modal-btn-secondary flex-shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium"
                >
                  暂停运行
                </button>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-card)]">
                <div className="h-full rounded-full bg-[var(--thu-purple)] transition-[width] duration-500 ease-out" style={{ width: `${Math.round(progress)}%` }} role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} />
              </div>
            </div>
          )}
          {abortConfirmOpen && jobId && (
            <div className="thu-modal-overlay fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="pipeline-abort-title">
              <div className="thu-modal-card mx-4 w-full max-w-md p-5">
                <h3 id="pipeline-abort-title" className="thu-modal-title mb-3 text-base">暂停运行</h3>
                <p className="mb-4 text-sm text-[var(--text)]">是否中止当前技能运行？</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setAbortConfirmOpen(false)}
                    className="thu-modal-btn-primary rounded-lg px-3 py-2 text-sm font-medium"
                  >
                    继续运行
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setAbortConfirmOpen(false);
                      try {
                        await fetch("/api/run/abort", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ jobId }),
                        });
                      } catch {
                        // ignore
                      }
                    }}
                    className="thu-modal-btn-secondary rounded-lg px-3 py-2 text-sm font-medium"
                  >
                    取消运行
                  </button>
                </div>
              </div>
            </div>
          )}
          {done && (
            <div className="mb-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--bg-card)]">
                <div className="h-full w-full rounded-full bg-[var(--thu-purple)]" style={{ width: "100%" }} role="progressbar" aria-valuenow={100} aria-valuemin={0} aria-valuemax={100} />
              </div>
              <span className="text-[11px] font-medium text-[var(--text-muted)]">100%</span>
            </div>
          )}
          <pre className="text-xs bg-white border border-[var(--border)] rounded p-2 max-h-48 overflow-auto whitespace-pre-wrap">
            {log || "（等待日志…）"}
          </pre>
          {done && (
            <div className="flex items-center gap-2">
              <span className="text-sm">
                {exitCode === 0 ? "成功完成" : `退出码 ${exitCode}`}
              </span>
              {onJumpToOutputs && (
                <button
                  type="button"
                  onClick={onJumpToOutputs}
                  className="thu-title text-sm hover:underline"
                >
                  查看 outputs 预览
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
