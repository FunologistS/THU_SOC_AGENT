"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SkillPanel } from "@/components/SkillPanel";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { JournalCatalog } from "@/components/JournalCatalog";
import { ThuLogo } from "@/components/ThuLogo";
import { ManualView } from "@/components/ManualView";
import {
  stageDisplayLabel,
  fileDisplayName,
  sourceDisplayLabel,
} from "@/lib/displayLabels";
import type { TopicMeta } from "../types";

const DEFAULT_TOPIC = "artificial_intelligence";
const DEFAULT_SOURCE = "mock";

/** 加载中占位：与正式布局一致，避免闪烁 */
function HomeFallback() {
  return (
    <div className="flex h-screen flex-col bg-[var(--bg-page)]">
      <header className="header-brand relative flex-shrink-0 border-b border-[var(--border-soft)]">
        <div className="gradient-thu-bar absolute inset-x-0 top-0" aria-hidden />
        <div className="relative flex items-center gap-5 px-6 py-4">
          <ThuLogo />
          <div className="min-w-0 flex-1">
            <h1 className="header-title text-[1.25rem] font-semibold leading-tight tracking-tight thu-title">
              <span className="font-semibold text-[var(--text)]">社会科学文献处理</span>
              <span className="mx-2 text-[var(--text-muted)] font-normal" aria-hidden>｜</span>
              <span className="font-medium text-[var(--text-muted)]">综合智能体</span>
            </h1>
            <p className="mt-2 text-xs font-medium uppercase tracking-widest text-[var(--text-muted)]">批量检索 · 清洗规整 · 主题聚类 · 荟萃分析 · 文献简报</p>
          </div>
        </div>
      </header>
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-[var(--text-muted)]">加载中…</p>
      </div>
    </div>
  );
}

function HomeContent() {
  const searchParams = useSearchParams();
  const topic = searchParams?.get("topic") ?? DEFAULT_TOPIC;
  const stage = searchParams?.get("stage") ?? "";
  const file = searchParams?.get("file") ?? "";
  const source = searchParams?.get("source") ?? DEFAULT_SOURCE;

  const [topics, setTopics] = useState<{ topic: string; label: string }[]>([]);
  const [meta, setMeta] = useState<TopicMeta | null>(null);
  const [metaRefreshKey, setMetaRefreshKey] = useState(0);
  const [content, setContent] = useState("");
  const [manualData, setManualData] = useState<{
    intro: string;
    toc: { id: string; title: string }[];
    overviewRows: { area: string; description: string }[];
    skills: { id: string; label: string; content: string }[];
  } | null>(null);
  const [hoveredManualSkillId, setHoveredManualSkillId] = useState<string | null>(null);
  const highlightedCardIds = useMemo(() => {
    if (!hoveredManualSkillId) return [];
    const map: Record<string, string[]> = {
      "journal-catalog": [],
      "journal-search": ["journal_search"],
      "paper-summarize": ["paper_summarize"],
      "literature-synthesis": ["synthesize", "concept_synthesize"],
      "paper-writing": ["writing_under_style"],
    };
    return map[hoveredManualSkillId] ?? [];
  }, [hoveredManualSkillId]);
  const [loading, setLoading] = useState(false);
  const [journalSearchJobId, setJournalSearchJobId] = useState<string | null>(null);
  const [journalSearchLog, setJournalSearchLog] = useState("");
  const [journalSearchDone, setJournalSearchDone] = useState(false);
  const [journalSearchExitCode, setJournalSearchExitCode] = useState<number | undefined>();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const setUrl = useCallback(
    (updates: { topic?: string; stage?: string; file?: string; source?: string }) => {
      const u = new URLSearchParams(window.location.search);
      if (updates.topic !== undefined) u.set("topic", updates.topic);
      if (updates.stage !== undefined) u.set("stage", updates.stage);
      if (updates.file !== undefined) u.set("file", updates.file);
      if (updates.source !== undefined) u.set("source", updates.source);
      const q = u.toString();
      window.history.replaceState({}, "", q ? `/app?${q}` : "/app");
    },
    []
  );

  useEffect(() => {
    fetch(`/api/topics?source=${source}`)
      .then((r) => r.json())
      .then((d) => setTopics(d.topics || []))
      .catch(() => setTopics([]));
  }, [source]);

  useEffect(() => {
    if (!topic) {
      setMeta(null);
      return;
    }
    fetch(`/api/topic-meta?topic=${encodeURIComponent(topic)}&source=${source}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setMeta)
      .catch(() => setMeta(null));
  }, [topic, source, metaRefreshKey]);

  const deleteFile = useCallback(
    async (filePath: string) => {
      if (source !== "outputs") return;
      const pathForApi = filePath.startsWith(topic + "/") ? filePath : `${topic}/${filePath}`;
      setDeleteError(null);
      try {
        const res = await fetch("/api/delete-file", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: pathForApi }),
        });
        const data = await res.json();
        if (!res.ok) {
          setDeleteError(data.error || "删除失败");
          return;
        }
        setMetaRefreshKey((k) => k + 1);
        const wasCurrent =
          file === filePath || file === pathForApi || file === `${topic}/${filePath}`;
        if (wasCurrent) setUrl({ stage: "", file: "" });
      } catch (e) {
        setDeleteError(e instanceof Error ? e.message : "请求失败");
      }
    },
    [source, topic, file, setUrl]
  );

  useEffect(() => {
    if (!topic || !file) {
      setContent("");
      return;
    }
    const path = file.startsWith(topic + "/") ? file : `${topic}/${file}`;
    setLoading(true);
    fetch(
      `/api/file?source=${encodeURIComponent(source)}&path=${encodeURIComponent(path)}`
    )
      .then((r) => (r.ok ? r.text() : ""))
      .then(setContent)
      .catch(() => setContent(""))
      .finally(() => setLoading(false));
  }, [topic, file, source]);

  useEffect(() => {
    if (file) return;
    fetch("/api/manual")
      .then((r) => (r.ok ? r.json() : null))
      .then(setManualData)
      .catch(() => setManualData(null));
  }, [file]);

  const currentStageMeta = meta?.stages?.find((s) => s.id === stage);
  const currentFileMeta = currentStageMeta?.files?.find(
    (f) => f.path === file || f.name === file || `${stage}/${f.name}` === file
  );
  const filePathForApi = currentFileMeta
    ? `${topic}/${currentFileMeta.path}`
    : file
      ? `${topic}/${file}`
      : "";

  const jumpToOutputsPreview = useCallback(() => {
    setUrl({
      source: "outputs",
      topic,
      stage: "06_review",
      file: "06_review/review_latest.md",
    });
  }, [topic, setUrl]);

  const changeTopic = useCallback(
    (newTopic: string) => {
      setUrl({ topic: newTopic, stage: "", file: "" });
    },
    [setUrl]
  );

  const runJournalSearch = useCallback(
    (params: {
      topicSlug: string;
      journalSourceIds: string[];
      journalIssns?: string[];
      yearFrom?: number;
      yearTo?: number;
    }) => {
      setUrl({ topic: params.topicSlug, source: "outputs" });
      setJournalSearchJobId(null);
      setJournalSearchLog("");
      setJournalSearchDone(false);
      setJournalSearchExitCode(undefined);
      const body: Record<string, unknown> = {
        jobType: "journal_search",
        topic: params.topicSlug,
        journalSourceIds: params.journalSourceIds,
      };
      if (params.journalIssns?.length) body.journalIssns = params.journalIssns;
      if (params.yearFrom != null) body.yearFrom = params.yearFrom;
      if (params.yearTo != null) body.yearTo = params.yearTo;
      fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
        .then((r) => r.json())
        .then((data) => {
          if (!data.jobId) {
            setJournalSearchLog(data.error || "启动失败");
            return;
          }
          setJournalSearchJobId(data.jobId);
          const poll = () => {
            fetch(`/api/logs?jobId=${data.jobId}`)
              .then((l) => l.json())
              .then((ld) => {
                setJournalSearchLog(ld.content);
                setJournalSearchDone(ld.done);
                setJournalSearchExitCode(ld.exitCode);
                if (!ld.done) setTimeout(poll, 800);
              });
          };
          poll();
        })
        .catch((e) => setJournalSearchLog(e?.message || "请求失败"));
    },
    [setUrl]
  );

  const displaySource = sourceDisplayLabel(source);
  const displayStage = stage ? stageDisplayLabel(stage) : "";
  const displayFile = currentFileMeta
    ? fileDisplayName(currentFileMeta.name)
    : file
      ? fileDisplayName(file.split("/").pop() ?? file)
      : "";

  return (
    <div className="flex h-screen flex-col bg-[var(--bg-page)]">
      <header className="header-brand relative flex-shrink-0 border-b border-[var(--border-soft)]">
        <div className="gradient-thu-bar absolute inset-x-0 top-0" aria-hidden />
        <div className="relative flex items-center gap-5 px-6 py-4">
          <ThuLogo />
          <div className="min-w-0 flex-1">
            <h1 className="header-title text-[1.25rem] font-semibold leading-tight tracking-tight thu-title">
              <span className="font-semibold text-[var(--text)]">社会科学文献处理</span>
              <span className="mx-2 text-[var(--text-muted)] font-normal" aria-hidden>｜</span>
              <span className="font-medium text-[var(--text-muted)]">综合智能体</span>
            </h1>
            <p className="mt-2 text-xs font-medium uppercase tracking-widest text-[var(--text-muted)]">
              批量检索 · 清洗规整 · 主题聚类 · 荟萃分析 · 文献简报
            </p>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="aside-brand flex w-80 flex-shrink-0 flex-col overflow-y-auto overflow-x-hidden border-r border-[var(--border-soft)] bg-[var(--bg-sidebar)]">
          <section className="thu-panel-left flex-shrink-0 border-b border-[var(--border-soft)] bg-[var(--bg-sidebar)] p-4">
            <JournalCatalog
              onStartSearch={runJournalSearch}
              runJobId={journalSearchJobId}
              runLog={journalSearchLog}
              runDone={journalSearchDone}
              runExitCode={journalSearchExitCode}
            />
          </section>
          <section className="flex-shrink-0 border-b border-[var(--border-soft)] bg-[var(--bg-card)] p-4 shadow-thu-soft">
            <h2 className="section-head mb-3 text-sm">技能工作台</h2>
            <SkillPanel
              topic={topic}
              onTopicChange={changeTopic}
              onJumpToOutputs={jumpToOutputsPreview}
              highlightedCardIds={highlightedCardIds}
            />
          </section>
          <section className="flex-shrink-0 p-4">
            <h2 className="section-head mb-3 text-sm">文献目录</h2>
            <div className="mb-3 flex gap-2">
              <button
                type="button"
                onClick={() => setUrl({ source: "mock" })}
                className={`rounded-[10px] px-3 py-2 text-sm font-medium transition-all duration-200 ${source === "mock" ? "thu-btn-primary shadow-thu-soft" : "bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--thu-purple-subtle)] hover:text-[var(--text)] border border-[var(--border-soft)]"}`}
              >
                示例数据
              </button>
              <button
                type="button"
                onClick={() => setUrl({ source: "outputs" })}
                className={`rounded-[10px] px-3 py-2 text-sm font-medium transition-all duration-200 ${source === "outputs" ? "thu-btn-primary shadow-thu-soft" : "bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--thu-purple-subtle)] hover:text-[var(--text)] border border-[var(--border-soft)]"}`}
              >
                我的产出
              </button>
            </div>
            <p className="mb-2 text-xs text-[var(--text-muted)]">主题</p>
            <ul className="max-h-28 overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--border-soft)] bg-[var(--bg-card)] shadow-thu-soft">
              {topics.length === 0 && (
                <li className="px-3 py-3 text-sm text-[var(--text-muted)]">暂无主题</li>
              )}
              {topics.map((t) => (
                <li key={t.topic}>
                  <button
                    type="button"
                    onClick={() => setUrl({ topic: t.topic, stage: "", file: "" })}
                    className={`w-full rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${topic === t.topic ? "thu-btn-primary" : "text-[var(--text)] hover:bg-[var(--thu-purple-subtle)]"}`}
                  >
                    {t.label}
                  </button>
                </li>
              ))}
            </ul>
            {meta && (
              <>
                <p className="mt-3 mb-2 text-xs text-[var(--text-muted)]">阶段 · 文件</p>
                {deleteError && (
                  <p className="mb-2 text-xs text-[var(--accent)]">{deleteError}</p>
                )}
                <ul className="max-h-52 overflow-y-auto space-y-2 rounded-[var(--radius-lg)] border border-[var(--border-soft)] bg-[var(--bg-card)] p-2 shadow-thu-soft">
                  {meta.stages.map((s) => (
                    <li key={s.id}>
                      <div
                        className={`rounded-lg px-2 py-1.5 text-sm font-medium ${stage === s.id ? "bg-[var(--thu-purple-subtle)] thu-heading" : "text-[var(--text)]"}`}
                      >
                        {stageDisplayLabel(s.id)}
                      </div>
                      <ul className="ml-2 mt-1 space-y-0.5">
                        {s.files?.map((f) => {
                          const isActive =
                            file === f.path || file === f.name || file === `${s.id}/${f.name}`;
                          return (
                            <li key={f.path} className="group flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setUrl({ stage: s.id, file: f.path })}
                                className={`min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${isActive ? "thu-btn-primary" : "text-[var(--text-muted)] hover:bg-[var(--thu-purple-subtle)] hover:text-[var(--text)]"}`}
                                title={f.name}
                              >
                                {fileDisplayName(f.name)}
                              </button>
                              {source === "outputs" && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (window.confirm(`确定将「${fileDisplayName(f.name)}」移至废纸篓？`)) {
                                      setDeleteError(null);
                                      deleteFile(f.path);
                                    }
                                  }}
                                  className="flex-shrink-0 rounded p-1 text-[var(--text-muted)] hover:bg-[var(--accent-subtle)] hover:text-[var(--accent)] transition-colors"
                                  title="移至废纸篓"
                                >
                                  <span className="text-xs">删</span>
                                </button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="mt-6 border-t border-[var(--border-soft)] pt-4">
              <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                清华大学社会学系
              </p>
              <p className="mt-0.5 text-[10px] text-[var(--text-muted)] opacity-80">
                Since 1926
              </p>
            </div>
          </section>
        </aside>

        <main className="flex-1 min-w-0 overflow-auto bg-[var(--bg-page)]">
          <div className="sticky top-0 z-10 border-b border-[var(--border-soft)] bg-[var(--bg-card)]/90 px-6 py-3 shadow-thu-soft backdrop-blur-md min-h-[3.25rem] flex items-center">
            <div className="absolute inset-x-0 bottom-0 h-px gradient-thu-line" aria-hidden />
            <div className="text-sm text-[var(--text-muted)]">
              {file ? (
                <>
                  <span className="font-medium text-[var(--text)]">{displaySource}</span>
                  {displayStage && (
                    <>
                      <span className="mx-1.5">·</span>
                      <span>{displayStage}</span>
                    </>
                  )}
                  {displayFile && (
                    <>
                      <span className="mx-1.5">·</span>
                      <span className="text-[var(--text)]">{displayFile}</span>
                    </>
                  )}
                </>
              ) : (
                <span className="font-medium text-[var(--text)]">说明书</span>
              )}
            </div>
          </div>
          <div className="p-6">
            <div className="mx-auto max-w-3xl">
              {loading && (
                <p className="text-sm text-[var(--text-muted)]">加载中…</p>
              )}
              {!loading && file && <MarkdownPreview content={content} />}
              {!loading && !file && (
                manualData ? (
                  <ManualView
                    data={manualData}
                    onSkillHover={setHoveredManualSkillId}
                  />
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">说明书加载中…</p>
                )
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function AppPage() {
  return (
    <Suspense fallback={<HomeFallback />}>
      <HomeContent />
    </Suspense>
  );
}
