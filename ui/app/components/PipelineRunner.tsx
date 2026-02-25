"use client";

import { useState } from "react";
import type { JobType } from "@/app/types";

const JOB_LABELS: Record<JobType, string> = {
  journal_search: "主题搜索 (journal_search)",
  paper_summarize: "文章归纳 (paper_summarize)",
  synthesize: "文献整合 (synthesize)",
  concept_synthesize: "概念合成 (concept_synthesize_glm)",
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
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobType, topic }),
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
