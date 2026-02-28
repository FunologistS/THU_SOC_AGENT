"use client";

import { useState, useEffect, useRef } from "react";

const POLL_MS = 1500;
const DEFAULT_HEIGHT_PX = 220;

/** 常驻运行日志面板：新日志追加显示，不覆盖；可折叠、清空 */
export function SessionLogPanel() {
  const [content, setContent] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [clearing, setClearing] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const fetchSession = () => {
      fetch("/api/logs/session")
        .then((r) => r.json())
        .then((d) => setContent(d.content ?? ""))
        .catch(() => setContent(""));
    };
    fetchSession();
    const t = setInterval(fetchSession, POLL_MS);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!expanded || !preRef.current) return;
    preRef.current.scrollTop = preRef.current.scrollHeight;
  }, [content, expanded]);

  const clearLog = () => {
    setClearing(true);
    fetch("/api/logs/session", { method: "POST" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Clear failed"))))
      .then(() => setContent(""))
      .catch(() => {})
      .finally(() => setClearing(false));
  };

  const lineCount = content ? content.trim().split(/\n/).length : 0;

  return (
    <div className="flex flex-col border-t border-[var(--border-soft)] bg-[var(--bg-sidebar)]">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium text-[var(--text-muted)] hover:bg-[var(--bg-card)] hover:text-[var(--text)] transition-colors"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2">
          <span
            className="inline-block transition-transform"
            style={{ transform: expanded ? "rotate(90deg)" : "none" }}
            aria-hidden
          >
            ▶
          </span>
          运行日志
          {lineCount > 0 && (
            <span className="text-[11px] font-normal opacity-80">
              （{lineCount} 行，新日志追加不覆盖）
            </span>
          )}
        </span>
      </button>
      {expanded && (
        <>
          <div className="flex items-center justify-end gap-2 px-3 pb-1">
            <button
              type="button"
              onClick={clearLog}
              disabled={clearing || !content}
              className="rounded-lg border border-[var(--border-soft)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--accent-subtle)] hover:text-[var(--accent)] disabled:opacity-50 transition-colors"
            >
              {clearing ? "清空中…" : "清空"}
            </button>
          </div>
          <pre
            ref={preRef}
            className="overflow-auto whitespace-pre-wrap border-t border-[var(--border-soft)] bg-[var(--bg-card)] px-3 py-2 text-[11px] text-[var(--text)] font-mono"
            style={{ maxHeight: `${DEFAULT_HEIGHT_PX}px` }}
          >
            {content || "（暂无日志；运行技能后此处会持续追加）"}
          </pre>
        </>
      )}
    </div>
  );
}
