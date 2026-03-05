"use client";

import { useState, useEffect, useRef } from "react";
import { useThUAlertConfirm } from "@/components/ThUAlertConfirm";

const POLL_MS = 1500;
const DEFAULT_HEIGHT_PX = 220;

/** 常驻运行日志面板：新日志追加显示，不覆盖；可折叠、清空；支持归档与清理任务日志 */
export function SessionLogPanel() {
  const [content, setContent] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [jobCount, setJobCount] = useState<number | null>(null);
  const [manageMsg, setManageMsg] = useState("");
  const [managing, setManaging] = useState(false);
  /** 上次一键保存时间（北京时间，到分钟）；有保存记录时显示 */
  const [lastSaveTime, setLastSaveTime] = useState<string | null>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const { confirm: thuConfirm } = useThUAlertConfirm();

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
    fetch("/api/git-history")
      .then((r) => r.json())
      .then((d) => {
        const saves = d?.saves;
        if (Array.isArray(saves) && saves.length > 0 && saves[0]?.dateBeijing) {
          setLastSaveTime(saves[0].dateBeijing);
        } else {
          setLastSaveTime(null);
        }
      })
      .catch(() => setLastSaveTime(null));
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    fetch("/api/logs/jobs")
      .then((r) => r.json())
      .then((d) => setJobCount(Array.isArray(d.jobs) ? d.jobs.length : 0))
      .catch(() => setJobCount(null));
  }, [expanded]);

  useEffect(() => {
    if (!expanded || !preRef.current) return;
    preRef.current.scrollTop = preRef.current.scrollHeight;
  }, [content, expanded]);

  const clearLog = () => {
    setClearing(true);
    fetch("/api/logs/session", { method: "POST" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Clear failed"))))
      .then(() => fetch("/api/logs/session").then((r) => r.json()).then((d) => setContent(d.content ?? "")))
      .catch(() => {})
      .finally(() => setClearing(false));
  };

  const onCleanupClick = async () => {
    const ok = await thuConfirm(
      "确定仅保留最近 30 条任务日志？超出部分将移入过期日志（archive/retired/）保留，主目录只留最近 30 条。\n\n不会清空上方常驻运行日志。"
    );
    if (ok) runManage("cleanup", { keepLast: 30 });
  };

  const onClearClick = async () => {
    const ok = await thuConfirm(
      "将仅清除已归档任务对应的运行日志，未归档的近期日志会保留。\n\n确定要清空已归档部分吗？"
    );
    if (ok) clearLog();
  };

  const runManage = async (
    action: "archive" | "cleanup",
    body: { olderThanDays?: number; keepLast?: number }
  ) => {
    setManaging(true);
    setManageMsg("");
    const url = action === "archive" ? "/api/logs/archive" : "/api/logs/cleanup";
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (r.ok) {
        setManageMsg(data.message ?? (action === "archive" ? "已归档" : "已清理"));
        fetch("/api/logs/jobs")
          .then((res) => res.json())
          .then((d) => setJobCount(Array.isArray(d.jobs) ? d.jobs.length : 0))
          .catch(() => {});
      } else {
        setManageMsg(data.error ?? "操作失败");
      }
    } catch {
      setManageMsg("请求失败");
    } finally {
      setManaging(false);
    }
  };

  const onArchiveRetiredClick = async () => {
    setManaging(true);
    setManageMsg("");
    try {
      const r = await fetch("/api/logs/archive-retired", { method: "POST" });
      const data = await r.json();
      setManageMsg(r.ok ? (data.message ?? "已归档") : (data.error ?? "操作失败"));
    } catch {
      setManageMsg("请求失败");
    } finally {
      setManaging(false);
    }
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
              （常驻 {lineCount} 行，新日志追加不覆盖）
            </span>
          )}
        </span>
      </button>
      {expanded && (
        <>
          {lastSaveTime != null && (
            <div className="px-3 py-1.5 text-[11px] text-[var(--text-muted)] border-b border-[var(--border-soft)]">
              上次保存时间：{lastSaveTime}（北京时间）
            </div>
          )}
          <div className="border-t border-[var(--border-soft)] bg-[var(--bg-sidebar)] px-3 py-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
              <span>日志管理：</span>
              {jobCount !== null && <span>当前 {jobCount} 条任务日志</span>}
              <button
                type="button"
                onClick={() => runManage("archive", { olderThanDays: 3 })}
                disabled={managing}
                className="rounded border border-[var(--border-soft)] bg-[var(--bg-card)] px-2 py-1 font-medium hover:bg-[var(--accent-subtle)] hover:text-[var(--accent)] disabled:opacity-50 transition-colors"
              >
                {managing ? "处理中…" : "归档 3 天前"}
              </button>
              <button
                type="button"
                onClick={onCleanupClick}
                disabled={managing}
                title="超出条数会移入 archive/retired/，主目录只留最近 30 条；不改上方常驻日志"
                className="rounded border border-[var(--border-soft)] bg-[var(--bg-card)] px-2 py-1 font-medium hover:bg-[var(--accent-subtle)] hover:text-[var(--accent)] disabled:opacity-50 transition-colors"
              >
                仅保留最近 30 条（任务）
              </button>
              <button
                type="button"
                onClick={onArchiveRetiredClick}
                disabled={managing}
                title="将 archive/retired/ 中的任务按日期移入 archive/YYYY-MM/，便于后续按天数清理"
                className="rounded border border-[var(--border-soft)] bg-[var(--bg-card)] px-2 py-1 font-medium hover:bg-[var(--accent-subtle)] hover:text-[var(--accent)] disabled:opacity-50 transition-colors"
              >
                自动归档过期日志
              </button>
              <button
                type="button"
                onClick={onClearClick}
                disabled={clearing || !content}
                title="仅清除已归档任务对应的日志，未归档的近期日志保留"
                className="rounded border border-[var(--border-soft)] bg-[var(--bg-card)] px-2 py-1 font-medium hover:bg-[var(--accent-subtle)] hover:text-[var(--accent)] disabled:opacity-50 transition-colors"
              >
                {clearing ? "清空中…" : "清空"}
              </button>
            </div>
            {manageMsg && (
              <p className="mt-1.5 text-[11px] text-[var(--accent)]">{manageMsg}</p>
            )}
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
