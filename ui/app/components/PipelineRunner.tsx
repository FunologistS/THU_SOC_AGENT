"use client";

import { useState } from "react";
import type { JobType } from "@/app/types";

const JOB_LABELS: Record<JobType, string> = {
  journal_search: "检索范围筛选",
  paper_summarize: "文章归纳 (paper_summarize)",
  synthesize: "文献整合 (synthesize)",
  concept_synthesize: "概念合成 (荟萃分析)",
  writing_under_style: "综述仿写 (writing_under_style)",
};

export function PipelineRunner({
  topic,
  onJumpToOutputs,
}: {
  topic: string;
  onJumpToOutputs?: () => void;
}) {
  const [jobType, setJobType] = useState<JobType>("concept_synthesize");
  const [conceptSynthesizeModel, setConceptSynthesizeModel] = useState<"gpt" | "glm">("glm");
  const [jobId, setJobId] = useState<string | null>(null);
  const [log, setLog] = useState("");
  const [done, setDone] = useState(false);
  const [exitCode, setExitCode] = useState<number | undefined>();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setError(null);
    setJobId(null);
    setLog("");
    setDone(false);
    setExitCode(undefined);
    setRunning(true);
    try {
      const body: { jobType: string; topic: string; conceptSynthesizeModel?: "gpt" | "glm" } = {
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
      const poll = async () => {
        const lres = await fetch(`/api/logs?jobId=${data.jobId}`);
        const ldata = await lres.json();
        setLog(ldata.content);
        setDone(ldata.done);
        setExitCode(ldata.exitCode);
        if (!ldata.done) setTimeout(poll, 800);
        else setRunning(false);
      };
      poll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      setRunning(false);
    }
  };

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
              onClick={() => setConceptSynthesizeModel("glm")}
              className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition-all ${
                conceptSynthesizeModel === "glm"
                  ? "border-[var(--thu-purple)] bg-[var(--thu-purple-subtle)]"
                  : "border-[var(--border)] bg-white"
              }`}
            >
              <img src="/llm/zhipu_z_icon.svg" alt="" className="h-4 w-4 object-contain" />
              <span>智谱 GLM-4.7-Flash</span>
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
          {running && (
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-[var(--thu-purple)] bg-[var(--thu-purple-subtle)] px-2.5 py-2">
              <div
                className="run-status-spinner h-6 w-6 flex-shrink-0 rounded-full border-2 border-[var(--thu-purple)] border-t-transparent"
                aria-hidden
              />
              <div>
                <p className="text-xs font-medium text-[var(--text)]">正在运行…</p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  预计{jobType === "concept_synthesize" ? " 2–5" : jobType === "writing_under_style" ? " 3–10" : " 数"}分钟（{JOB_LABELS[jobType]}）
                </p>
              </div>
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
