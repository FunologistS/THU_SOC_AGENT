"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SkillPanel } from "@/components/SkillPanel";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { JournalCatalog } from "@/components/JournalCatalog";
import { LiteratureSearchPanel, type LiteratureSearchPanelHandle } from "@/components/LiteratureSearchPanel";
import { ManualAbstractPanel } from "@/components/ManualAbstractPanel";
import { WritingSamplesPanel } from "@/components/WritingSamplesPanel";
import { ThuLogo } from "@/components/ThuLogo";
import { ManualView } from "@/components/ManualView";
import { SettingsModal } from "@/components/SettingsModal";
import { SessionLogPanel } from "@/components/SessionLogPanel";
import { useThUAlertConfirm } from "@/components/ThUAlertConfirm";
import {
  stageDisplayLabel,
  fileDisplayName,
  sourceDisplayLabel,
  jobDisplayLabel,
} from "@/lib/displayLabels";
import { useSkillCompleteToast } from "@/components/SkillCompleteToast";
import type { TopicMeta } from "../types";
import type { JobType } from "../types";

/** 技能对应的产出阶段（「查看产出」时跳转到该阶段的首个文件） */
const SKILL_TO_STAGE: Record<JobType, string> = {
  journal_search: "01_raw",
  filter: "02_clean",
  paper_summarize: "03_summaries",
  synthesize: "04_meta",
  concept_synthesize: "05_report",
  upload_and_writing: "06_review",
  transcribe_submit_and_writing: "06_review",
  writing_under_style: "06_review",
};

const DEFAULT_TOPIC = "artificial_intelligence";
const DEFAULT_SOURCE = "outputs";

const SIDEBAR_WIDTH_MIN = 320;
const SIDEBAR_WIDTH_MAX = 560;
const SIDEBAR_WIDTH_DEFAULT = 380;

/** 侧栏区块折叠状态 */
type SidebarSections = { journalDb: boolean; journal: boolean; skills: boolean; manual: boolean; writingSamples: boolean; docs: boolean };

/** 侧栏区块标题用图标（24×24 风格） */
const IconBook = () => (
  <svg className="h-4 w-4 shrink-0 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  </svg>
);
const IconSearch = () => (
  <svg className="h-4 w-4 shrink-0 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);
const IconWorkbench = () => (
  <svg className="h-4 w-4 shrink-0 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);
const IconEditList = () => (
  <svg className="h-4 w-4 shrink-0 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
  </svg>
);
const IconFolder = () => (
  <svg className="h-4 w-4 shrink-0 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
);
const IconDocumentText = () => (
  <svg className="h-4 w-4 shrink-0 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);
const IconChevron = ({ open }: { open: boolean }) => (
  <svg className={`h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform ${open ? "" : "-rotate-90"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

/** 始终可选的预设主题（与 outputs 实际目录合并后供技能工作台切换） */
const PRESET_TOPICS: { topic: string; label: string }[] = [
  { topic: "artificial_intelligence", label: "Artificial Intelligence" },
  { topic: "digital_labor", label: "Digital Labor" },
];

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
              <span className="font-semibold text-[var(--text)]">社会科学文献综合处理</span>
              <span className="mx-2 text-[var(--text-muted)] font-normal" aria-hidden>｜</span>
              <span className="font-medium text-[var(--text-muted)]">智能体</span>
            </h1>
            <p className="mt-2 text-xs font-medium uppercase tracking-widest text-[var(--text-muted)]">批量检索 · 清洗规整 · 荟萃分析 · 文献简报 · 一键综述</p>
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
  const availableTopicsForPanel = useMemo(() => {
    const byTopic = new Map<string, string>();
    for (const t of PRESET_TOPICS) byTopic.set(t.topic, t.label);
    for (const t of topics) byTopic.set(t.topic, t.label);
    return Array.from(byTopic.entries())
      .map(([topic, label]) => ({ topic, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "zh", { sensitivity: "base" }));
  }, [topics]);

  /** 文档目录主题按首字母分组，用于右侧字母快速定位（与期刊数据库一致）；非 A–Z 归为 # */
  const topicLetterIndex = useMemo(() => {
    const sorted = [...availableTopicsForPanel];
    const g = new Map<string, { topic: string; label: string }[]>();
    for (const t of sorted) {
      const first = (t.label[0] ?? t.topic[0] ?? "").toUpperCase();
      const key = /[A-Z]/.test(first) ? first : "#";
      if (!g.has(key)) g.set(key, []);
      g.get(key)!.push(t);
    }
    const letters = Array.from(g.keys()).sort((a, b) => (a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b)));
    return { indexLetters: letters, groups: g };
  }, [availableTopicsForPanel]);

  const topicListRef = useRef<HTMLDivElement>(null);
  const scrollToTopicLetter = useCallback((letter: string) => {
    const el = document.getElementById(`topic-letter-${letter}`);
    if (el && topicListRef.current) {
      const container = topicListRef.current;
      const y = el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
      container.scrollTo({ top: Math.max(0, y - 4), behavior: "smooth" });
    }
  }, []);

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
  const [journalSearchProgress, setJournalSearchProgress] = useState(0);
  /** 重新检索开始时间（用于进度条与已用秒数）；仅在运行中有效 */
  const [journalSearchRunStartTime, setJournalSearchRunStartTime] = useState<number | null>(null);
  /** 已用秒数（每秒更新），用于技能工作台「重新检索」展示预估/已用/进度 */
  const [journalSearchElapsedSec, setJournalSearchElapsedSec] = useState(0);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pendingJumpToOutputs, setPendingJumpToOutputs] = useState(false);
  const [lastCompletedSkillId, setLastCompletedSkillId] = useState<JobType | null>(null);
  const [fileMenuPath, setFileMenuPath] = useState<string | null>(null);
  const [renameModal, setRenameModal] = useState<{ path: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [journalDataSourceLabel, setJournalDataSourceLabel] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setThemeState] = useState<"light" | "dark">("light");
  const [lastCommitIso, setLastCommitIso] = useState<string | null>(null);
  /** 技能工作台是否有任务正在运行（用于返回启动页前确认） */
  const [skillRunning, setSkillRunning] = useState(false);
  const skillRunningPrevRef = useRef(false);
  /** 重新检索开始时间（ref，用于 poll 完成时写入精确总用时） */
  const journalSearchRunStartTimeRef = useRef<number | null>(null);
  /** 文档预览区域右上角导出菜单开关 */
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const skillCompleteToast = useSkillCompleteToast();
  // 重新检索结束时显示右上角完成通知
  const journalSearchDonePrevRef = useRef(false);
  useEffect(() => {
    if (journalSearchDonePrevRef.current === false && journalSearchDone) {
      const success = journalSearchExitCode === 0;
      skillCompleteToast.notify({
        label: "重新检索",
        success,
        ...(success && {
          onClick: () => {
            setLastCompletedSkillId("journal_search");
            setPendingJumpToOutputs(true);
            setMetaRefreshKey((k) => k + 1);
          },
        }),
      });
    }
    journalSearchDonePrevRef.current = journalSearchDone;
  }, [journalSearchDone, journalSearchExitCode, skillCompleteToast]);

  useEffect(() => {
    const t = document.documentElement.getAttribute("data-theme") as "light" | "dark" | null;
    if (t === "dark" || t === "light") setThemeState(t);
    else {
      const stored = localStorage.getItem("thu_soc_theme") as "light" | "dark" | null;
      if (stored === "dark" || stored === "light") setThemeState(stored);
    }
  }, []);
  const setTheme = useCallback((next: "light" | "dark") => {
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("thu_soc_theme", next);
    setThemeState(next);
  }, []);
  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);
  const [sidebarOpen, setSidebarOpen] = useState<SidebarSections>({
    writingSamples: false,
    journalDb: false,
    journal: false,
    skills: false,
    manual: false,
    docs: false,
  });
  /** 点击「检索新主题」后触发「新增检索」标题高亮淡出，每次点击递增以重播动画 */
  const [journalHighlightTrigger, setJournalHighlightTrigger] = useState(0);
  const { alert: thuAlert, confirm: thuConfirm } = useThUAlertConfirm();
  const toggleSidebarSection = useCallback((key: keyof SidebarSections) => {
    setSidebarOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  /** 说明书「本页功能一览」表格中点击区域名时，展开侧栏对应板块并滚动到该板块顶部 */
  const handleManualAreaClick = useCallback((area: string) => {
    const key: keyof SidebarSections | null =
      area === "期刊数据库"
        ? "journalDb"
        : area === "新增检索"
          ? "journal"
          : area === "技能工作台"
            ? "skills"
            : area === "手动补录空缺摘要"
              ? "manual"
              : area === "写作样例"
              ? "writingSamples"
              : area === "文档目录"
                ? "docs"
                : null;
    if (!key) return;
    setSidebarOpen((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => {
      const el = asideRef.current?.querySelector(`[data-sidebar-section="${key}"]`);
      (el as HTMLElement)?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 120);
  }, []);

  /** 说明书「技能工作台详情」中点击某一技能时：点击「期刊数据库」则展开侧栏「期刊数据库」板块，其他技能展开「技能工作台」并高亮该卡片 */
  const handleSkillClick = useCallback((skillId: string) => {
    if (skillId === "journal-catalog") {
      setSidebarOpen((prev) => ({ ...prev, journalDb: true }));
      setTimeout(() => {
        const el = asideRef.current?.querySelector('[data-sidebar-section="journalDb"]');
        (el as HTMLElement)?.scrollIntoView({ block: "start", behavior: "smooth" });
      }, 120);
    } else {
      setSidebarOpen((prev) => ({ ...prev, skills: true }));
      setHoveredManualSkillId(skillId);
      setTimeout(() => {
        const el = asideRef.current?.querySelector('[data-sidebar-section="skills"]');
        (el as HTMLElement)?.scrollIntoView({ block: "start", behavior: "smooth" });
      }, 120);
    }
  }, []);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_WIDTH_DEFAULT);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef({ x: 0, width: SIDEBAR_WIDTH_DEFAULT });
  const mainRef = useRef<HTMLElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const literatureSearchRef = useRef<LiteratureSearchPanelHandle | null>(null);

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e: MouseEvent) => {
      const { x, width } = resizeStartRef.current;
      const delta = e.clientX - x;
      const next = Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, width + delta));
      setSidebarWidth(next);
    };
    const onUp = () => setIsResizing(false);
    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
    };
  }, [isResizing]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizeStartRef.current = { x: e.clientX, width: sidebarWidth };
    setIsResizing(true);
  }, [sidebarWidth]);

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
      .then((d) => setTopics((d.topics || []).filter((t: { topic: string }) => t.topic !== "system")))
      .catch(() => setTopics([]));
  }, [source, metaRefreshKey]);

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

  const pathForApi = (filePath: string) =>
    filePath.startsWith(topic + "/") ? filePath : `${topic}/${filePath}`;

  const deleteFile = useCallback(
    async (filePath: string) => {
      if (source !== "outputs") return;
      setFileMenuPath(null);
      setDeleteError(null);
      try {
        const res = await fetch("/api/delete-file", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: pathForApi(filePath) }),
        });
        const data = await res.json();
        if (!res.ok) {
          setDeleteError(data.error || "删除失败");
          return;
        }
        setMetaRefreshKey((k) => k + 1);
        const wasCurrent =
          file === filePath || file === pathForApi(filePath) || file === `${topic}/${filePath}`;
        if (wasCurrent) setUrl({ stage: "", file: "" });
      } catch (e) {
        setDeleteError(e instanceof Error ? e.message : "请求失败");
      }
    },
    [source, topic, file, setUrl]
  );

  const renameFile = useCallback(
    async (filePath: string, newName: string) => {
      if (!newName.trim().toLowerCase().endsWith(".md")) {
        setRenameError("文件名须以 .md 结尾");
        return;
      }
      setRenameError(null);
      try {
        const res = await fetch("/api/rename-file", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: pathForApi(filePath), newName: newName.trim() }),
        });
        const data = await res.json();
        if (!res.ok) {
          setRenameError(data.error || "重命名失败");
          return;
        }
        setMetaRefreshKey((k) => k + 1);
        const wasCurrent = file === filePath || file === `${topic}/${filePath}`;
        if (wasCurrent) setUrl({ file: (data.path as string) ?? filePath });
        setRenameModal(null);
      } catch (e) {
        setRenameError(e instanceof Error ? e.message : "请求失败");
      }
    },
    [topic, file, setUrl]
  );

  // 点击「查看产出」后：先刷新 meta，再根据「刚完成的技能」跳转到对应阶段的首个文件
  useEffect(() => {
    if (!pendingJumpToOutputs || !meta?.stages?.length) return;
    setPendingJumpToOutputs(false);
    const targetStageId =
      lastCompletedSkillId && SKILL_TO_STAGE[lastCompletedSkillId]
        ? SKILL_TO_STAGE[lastCompletedSkillId]
        : null;
    const stageMeta = targetStageId
      ? meta.stages.find((s) => s.id === targetStageId)
      : null;
    const files = stageMeta?.files ?? [];
    const versionedFile = files.find((f) => /_\d{8}_v\d+\.md$/.test(f.name));
    const firstFile = versionedFile ?? files[0];
    if (firstFile) {
      setUrl({ stage: stageMeta!.id, file: firstFile.path });
      return;
    }
    // 无对应阶段或未记录技能时：回退到 06_review 或 05_report
    const reviewStage = meta.stages.find((s) => s.id === "06_review");
    const reportStage = meta.stages.find((s) => s.id === "05_report");
    const reviewFile = reviewStage?.files?.[0];
    const reportFile = reportStage?.files?.[0];
    const fallback = reviewFile
      ? { stage: reviewStage!.id, file: reviewFile.path }
      : reportFile
        ? { stage: reportStage!.id, file: reportFile.path }
        : null;
    if (fallback) setUrl({ stage: fallback.stage, file: fallback.file });
  }, [pendingJumpToOutputs, meta, lastCompletedSkillId, setUrl]);

  const journalSearchWasDoneRef = useRef(false);
  useEffect(() => {
    if (journalSearchDone && !journalSearchWasDoneRef.current && journalSearchExitCode === 0) {
      setLastCompletedSkillId("journal_search");
      setMetaRefreshKey((k) => k + 1);
    }
    journalSearchWasDoneRef.current = journalSearchDone;
  }, [journalSearchDone, journalSearchExitCode]);

  useEffect(() => {
    fetch("/api/git-info")
      .then((r) => r.json())
      .then((d) => (d?.ok && d?.lastCommitIso ? setLastCommitIso(d.lastCommitIso) : null))
      .catch(() => {});
  }, []);

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
    setUrl({ source: "outputs", topic, stage: "", file: "" });
    setPendingJumpToOutputs(true);
    setMetaRefreshKey((k) => k + 1);
  }, [topic, setUrl]);

  const handleJobComplete = useCallback((skillId: JobType) => {
    setLastCompletedSkillId(skillId);
    setMetaRefreshKey((k) => k + 1);
    if (skillId === "paper_summarize") setHoveredManualSkillId((prev) => (prev === "paper-summarize" ? null : prev));
  }, []);

  const handleJobFinished = useCallback(
    (skillId: JobType, success: boolean) => {
      skillCompleteToast.notify({
        label: jobDisplayLabel(skillId),
        success,
        ...(success && {
          onClick: () => {
            setLastCompletedSkillId(skillId);
            setPendingJumpToOutputs(true);
            setMetaRefreshKey((k) => k + 1);
          },
        }),
      });
    },
    [skillCompleteToast]
  );

  const refreshGitInfo = useCallback(() => {
    fetch("/api/git-info")
      .then((r) => r.json())
      .then((d) => (d?.ok && d?.lastCommitIso ? setLastCommitIso(d.lastCommitIso) : null))
      .catch(() => {});
  }, []);

  const changeTopic = useCallback(
    (newTopic: string) => {
      setUrl({ topic: newTopic, stage: "", file: "" });
    },
    [setUrl]
  );

  const JOURNAL_SEARCH_ESTIMATED_SEC = 180;
  const runJournalSearch = useCallback(
    (params: {
      topicSlug: string;
      journalSourceIds: string[];
      journalIssns?: string[];
      yearFrom?: number;
      yearTo?: number;
      searchMode?: "strict" | "relaxed";
      searchTerms?: string[];
      searchLogics?: ("and" | "or")[];
      abstractFallback?: boolean;
    }) => {
      setUrl({ topic: params.topicSlug, source: "outputs" });
      setJournalSearchJobId(null);
      setJournalSearchLog("");
      setJournalSearchDone(false);
      setJournalSearchExitCode(undefined);
      setJournalSearchProgress(0);
      setJournalSearchRunStartTime(null);
      setJournalSearchElapsedSec(0);
      const body: Record<string, unknown> = {
        jobType: "journal_search",
        topic: params.topicSlug,
        journalSourceIds: params.journalSourceIds,
      };
      if (params.journalIssns?.length) body.journalIssns = params.journalIssns;
      if (params.yearFrom != null) body.yearFrom = params.yearFrom;
      if (params.yearTo != null) body.yearTo = params.yearTo;
      if (params.searchMode) body.searchMode = params.searchMode;
      if (params.searchTerms?.length) body.searchTerms = params.searchTerms;
      if (params.searchLogics?.length === (params.searchTerms?.length ?? 0) - 1) body.searchLogics = params.searchLogics;
      if (params.abstractFallback === true) body.abstractFallback = true;
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
          const startTime = Date.now();
          journalSearchRunStartTimeRef.current = startTime;
          setJournalSearchJobId(data.jobId);
          setJournalSearchRunStartTime(startTime);
          setJournalSearchElapsedSec(0);
          setJournalSearchProgress(0);
          const poll = () => {
            fetch(`/api/logs?jobId=${data.jobId}`)
              .then((l) => l.json())
              .then((ld) => {
                setJournalSearchLog(ld.content);
                setJournalSearchDone(ld.done);
                setJournalSearchExitCode(ld.exitCode);
                if (ld.done) {
                  setJournalSearchProgress(100);
                  const start = journalSearchRunStartTimeRef.current;
                  if (start != null) setJournalSearchElapsedSec(Math.floor((Date.now() - start) / 1000));
                } else {
                  setTimeout(poll, 800);
                }
              });
          };
          poll();
        })
        .catch((e) => setJournalSearchLog(e?.message || "请求失败"));
    },
    [setUrl]
  );

  /** 重新检索运行中：每秒更新已用秒数与进度条（基于时间而非轮询回调，避免一次跳到 95%） */
  useEffect(() => {
    if (!journalSearchJobId || journalSearchRunStartTime == null || journalSearchDone) return;
    const tick = () => {
      const elapsed = (Date.now() - journalSearchRunStartTime) / 1000;
      setJournalSearchElapsedSec(Math.floor(elapsed));
      setJournalSearchProgress(Math.min(95, (elapsed / JOURNAL_SEARCH_ESTIMATED_SEC) * 100));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [journalSearchJobId, journalSearchRunStartTime, journalSearchDone]);

  /** job 被清空时重置开始时间与已用秒数 */
  useEffect(() => {
    if (!journalSearchJobId) {
      journalSearchRunStartTimeRef.current = null;
      setJournalSearchRunStartTime(null);
      setJournalSearchElapsedSec(0);
    }
  }, [journalSearchJobId]);

  /** 重新检索运行中时滚动到运行日志区域 */
  useEffect(() => {
    if (!journalSearchJobId) return;
    const t = setTimeout(() => {
      asideRef.current?.querySelector('[data-run-log-section="journal"]')?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 150);
    return () => clearTimeout(t);
  }, [journalSearchJobId]);

  /** 点击「暂停运行」时先打开确认弹窗，不直接中止 */
  const [journalSearchAbortConfirmOpen, setJournalSearchAbortConfirmOpen] = useState(false);
  const openJournalSearchAbortConfirm = useCallback(() => {
    if (journalSearchJobId) setJournalSearchAbortConfirmOpen(true);
  }, [journalSearchJobId]);
  const confirmAbortJournalSearch = useCallback(() => {
    const id = journalSearchJobId;
    setJournalSearchAbortConfirmOpen(false);
    if (!id) return;
    fetch("/api/run/abort", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: id }),
    }).finally(() => {
      setJournalSearchJobId(null);
      setJournalSearchLog("");
      setJournalSearchDone(false);
      setJournalSearchExitCode(undefined);
      setJournalSearchProgress(0);
      setJournalSearchRunStartTime(null);
      setJournalSearchElapsedSec(0);
    });
  }, [journalSearchJobId]);

  const displaySource = sourceDisplayLabel(source);
  const displayStage = stage ? stageDisplayLabel(stage) : "";
  const displayFile = currentFileMeta
    ? fileDisplayName(currentFileMeta.name)
    : file
      ? fileDisplayName(file.split("/").pop() ?? file)
      : "";

  /** 将 ISO 时间格式化为北京时间（精确到分钟） */
  const lastUpdateBeijing =
    lastCommitIso
      ? (() => {
          try {
            const d = new Date(lastCommitIso);
            return d.toLocaleString("zh-CN", {
              timeZone: "Asia/Shanghai",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            });
          } catch {
            return null;
          }
        })()
      : null;

  return (
    <div className="flex h-screen flex-col bg-[var(--bg-page)]">
      <header className="header-brand relative flex-shrink-0 border-b border-[var(--border-soft)]">
        <div className="gradient-thu-bar absolute inset-x-0 top-0" aria-hidden />
        <div className="relative flex items-center gap-5 px-6 py-4">
          <ThuLogo />
          <div className="min-w-0 flex-1">
            <h1 className="header-title text-[1.25rem] font-semibold leading-tight tracking-tight thu-title">
              <span className="font-semibold text-[var(--text)]">社会科学文献综合处理</span>
              <span className="mx-2 text-[var(--text-muted)] font-normal" aria-hidden>｜</span>
              <span className="font-medium text-[var(--text-muted)]">智能体</span>
            </h1>
            <p className="mt-2 text-xs font-medium uppercase tracking-widest text-[var(--text-muted)]">
              批量检索 · 清洗规整 · 荟萃分析 · 文献简报 · 一键综述
            </p>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="flex-shrink-0 inline-flex items-center justify-center rounded-[10px] p-2 text-[var(--text-muted)] hover:bg-[var(--thu-purple-subtle)] hover:text-[var(--text)] transition-colors"
            aria-label={theme === "dark" ? "切换为日间" : "切换为夜间"}
            title={theme === "dark" ? "日间模式" : "夜间模式"}
          >
            {theme === "dark" ? (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex-shrink-0 inline-flex items-center justify-center rounded-[10px] p-2 text-[var(--text-muted)] hover:bg-[var(--thu-purple-subtle)] hover:text-[var(--text)] transition-colors"
            aria-label="设置"
            title="基本变量与 API Key"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={async () => {
              if (skillRunning) {
                const ok = await thuConfirm("回到启动页将终止运行中技能，是否确认？");
                if (!ok) return;
              }
              window.location.href = "/start.html";
            }}
            className="flex-shrink-0 inline-flex items-center justify-center rounded-[10px] p-2 text-[var(--text-muted)] hover:bg-[var(--thu-purple-subtle)] hover:text-[var(--text)] transition-colors"
            aria-label="返回启动页"
            title="返回启动页"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => {
              setUrl({ stage: "", file: "" });
              mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="home-btn-thu flex-shrink-0 inline-flex items-center gap-2 rounded-[10px] px-4 py-2 text-sm font-medium text-white shadow-thu-soft transition-all duration-200 hover:opacity-95 hover:shadow-lg"
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <path d="M9 22V12h6v10" />
            </svg>
            首页
          </button>
        </div>
      </header>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} onGitSaveSuccess={refreshGitInfo} />

      <div className="flex flex-1 min-h-0">
        <div className="flex flex-shrink-0" style={{ width: sidebarWidth }}>
          <aside ref={asideRef} className="aside-brand flex min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden border-r border-[var(--border-soft)] bg-[var(--bg-card)]">
          <section data-sidebar-section="journalDb" className="thu-panel-left flex-shrink-0 border-b border-[var(--border-soft)] bg-[var(--bg-card)]">
            <button
              type="button"
              onClick={() => toggleSidebarSection("journalDb")}
              className="section-head flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-[var(--text)] hover:bg-[var(--thu-purple-subtle)] transition-colors"
              aria-expanded={sidebarOpen.journalDb}
            >
              <IconBook />
              <span className="min-w-0 flex-1">期刊数据库</span>
              <IconChevron open={sidebarOpen.journalDb} />
            </button>
            {sidebarOpen.journalDb && (
              <div className="p-4 pt-0 max-h-[70vh] min-h-0 overflow-y-auto">
                <JournalCatalog mode="database" hideTitle onStartSearch={() => {}} />
              </div>
            )}
          </section>
          <section data-sidebar-section="journal" className="thu-panel-left flex-shrink-0 border-b border-[var(--border-soft)] bg-[var(--bg-card)]">
            <button
              type="button"
              onClick={() => toggleSidebarSection("journal")}
              className="section-head relative flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-[var(--text)] hover:bg-[var(--thu-purple-subtle)] transition-colors overflow-hidden"
              aria-expanded={sidebarOpen.journal}
            >
              {journalHighlightTrigger > 0 && (
                <span
                  key={journalHighlightTrigger}
                  className="journal-section-highlight-fade absolute inset-0 z-0 pointer-events-none rounded-none"
                  aria-hidden
                />
              )}
              <IconSearch />
              <span className="min-w-0 flex-1 relative z-[1]">新增检索</span>
              <IconChevron open={sidebarOpen.journal} />
            </button>
            {sidebarOpen.journal && (
              <div className="p-4 pt-0">
                <LiteratureSearchPanel
                  ref={literatureSearchRef}
                  hideTitle
                  onStartSearch={runJournalSearch}
                  runJobId={journalSearchJobId}
                  runLog={journalSearchLog}
                  runDone={journalSearchDone}
                  runExitCode={journalSearchExitCode}
                  onAbort={openJournalSearchAbortConfirm}
                  onDataSourceChange={setJournalDataSourceLabel}
                  onJumpToOutputs={jumpToOutputsPreview}
                />
              </div>
            )}
          </section>
          <section
            data-sidebar-section="skills"
            className={`thu-panel-left flex-shrink-0 border-b border-[var(--border-soft)] bg-[var(--bg-card)] ${skillRunning ? "ring-1 ring-inset ring-[var(--thu-purple)]/30" : ""}`}
          >
            <button
              type="button"
              onClick={() => toggleSidebarSection("skills")}
              className="section-head flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-[var(--text)] hover:bg-[var(--thu-purple-subtle)] transition-colors"
              aria-expanded={sidebarOpen.skills}
            >
              <IconWorkbench />
              <span className="min-w-0 flex-1">技能工作台</span>
              {skillRunning && (
                <span className="flex-shrink-0 rounded bg-[var(--thu-purple)]/20 px-1.5 py-0.5 text-[10px] font-medium text-[var(--thu-purple)]">
                  运行中
                </span>
              )}
              <IconChevron open={sidebarOpen.skills} />
            </button>
            {sidebarOpen.skills && (
              <div className="p-4 pt-0">
                <SkillPanel
                  topic={topic}
                  availableTopics={availableTopicsForPanel}
                  onTopicChange={changeTopic}
                  onJumpToOutputs={jumpToOutputsPreview}
                  onJobComplete={handleJobComplete}
                  onJobFinished={handleJobFinished}
                  highlightedCardIds={highlightedCardIds}
                  topicMeta={meta}
                  journalDataSourceLabel={journalDataSourceLabel}
                  onFocusLiteratureSearch={() => {
                    setSidebarOpen((prev) => ({ ...prev, journal: true }));
                    setJournalHighlightTrigger((t) => t + 1);
                  }}
                  getJournalSearchDefaults={() => literatureSearchRef.current?.getCurrentParams() ?? null}
                  onRunJournalSearch={(params) => {
                    runJournalSearch(params);
                    setSidebarOpen((prev) => ({ ...prev, skills: true }));
                    setTimeout(() => {
                      asideRef.current?.querySelector('[data-run-log-skill="journal_search"]')?.scrollIntoView({ block: "nearest", behavior: "smooth" });
                    }, 150);
                  }}
                  onRunStarted={(skillId) => {
                    setSidebarOpen((prev) => ({ ...prev, skills: true }));
                    setTimeout(() => {
                      asideRef.current?.querySelector(`[data-run-log-skill="${skillId}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
                    }, 150);
                  }}
                  onRunningChange={setSkillRunning}
                  journalSearchJobId={journalSearchJobId}
                  journalSearchLog={journalSearchLog}
                  journalSearchDone={journalSearchDone}
                  journalSearchExitCode={journalSearchExitCode}
                  journalSearchProgress={journalSearchProgress}
                  journalSearchElapsedSec={journalSearchElapsedSec}
                  journalSearchEstimatedSec={JOURNAL_SEARCH_ESTIMATED_SEC}
                  onAbortJournalSearch={openJournalSearchAbortConfirm}
                  onDismissJournalSearchLog={() => setJournalSearchJobId(null)}
                />
              </div>
            )}
          </section>
          {source === "outputs" && topic && (
            <section data-sidebar-section="manual" className="thu-panel-left flex-shrink-0 border-b border-[var(--border-soft)] bg-[var(--bg-card)]">
              <button
                type="button"
                onClick={() => toggleSidebarSection("manual")}
                className="section-head flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-[var(--text)] hover:bg-[var(--thu-purple-subtle)] transition-colors"
                aria-expanded={sidebarOpen.manual}
              >
                <IconEditList />
                <span className="min-w-0 flex-1">手动补录空缺摘要</span>
                <IconChevron open={sidebarOpen.manual} />
              </button>
              {sidebarOpen.manual && (
                <div className="p-4 pt-0">
                  <ManualAbstractPanel
                    hideTitle
                    topic={topic}
                    topicLabel={availableTopicsForPanel.find((t) => t.topic === topic)?.label}
                    availableTopics={availableTopicsForPanel}
                    onTopicChange={changeTopic}
                    onSaved={() => setMetaRefreshKey((k) => k + 1)}
                    onRequestFocusPaperSummarize={() => {
                      setSidebarOpen((prev) => ({ ...prev, skills: true }));
                      setHoveredManualSkillId("paper-summarize");
                      setTimeout(() => {
                        const el = asideRef.current?.querySelector('[data-skill-id="paper_summarize"]');
                        (el as HTMLElement)?.scrollIntoView({ block: "center", behavior: "smooth" });
                      }, 120);
                    }}
                  />
                </div>
              )}
            </section>
          )}
          <section data-sidebar-section="writingSamples" className="thu-panel-left flex-shrink-0 border-b border-[var(--border-soft)] bg-[var(--bg-card)]">
            <button
              type="button"
              onClick={() => toggleSidebarSection("writingSamples")}
              className="section-head flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-[var(--text)] hover:bg-[var(--thu-purple-subtle)] transition-colors"
              aria-expanded={sidebarOpen.writingSamples}
            >
              <IconDocumentText />
              <span className="min-w-0 flex-1">写作样例</span>
              <IconChevron open={sidebarOpen.writingSamples} />
            </button>
            {sidebarOpen.writingSamples && (
              <div className="p-4 pt-0">
                <WritingSamplesPanel hideTitle />
              </div>
            )}
          </section>
          <section data-sidebar-section="docs" className="thu-panel-left flex-shrink-0 bg-[var(--bg-card)]">
            <button
              type="button"
              onClick={() => toggleSidebarSection("docs")}
              className="section-head flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-[var(--text)] hover:bg-[var(--thu-purple-subtle)] transition-colors"
              aria-expanded={sidebarOpen.docs}
            >
              <IconFolder />
              <span className="min-w-0 flex-1">文档目录</span>
              <IconChevron open={sidebarOpen.docs} />
            </button>
            {sidebarOpen.docs && (
              <div className="p-4">
                {topic && (
                  <p className="mb-2 text-xs text-[var(--text-muted)]">
                    当前主题：<span className="font-medium text-[var(--text)]">{availableTopicsForPanel.find((t) => t.topic === topic)?.label ?? topic.replace(/_/g, " ")}</span>
                  </p>
                )}
                <p className="mb-1 text-xs text-[var(--text-muted)]">主题</p>
                <p className="mb-2 text-[11px] text-[var(--text-muted)] opacity-90">
                  共 {availableTopicsForPanel.length} 个主题，右侧字母可快速定位
                </p>
                <div className="flex gap-0 max-h-48 rounded-[var(--radius-lg)] border border-[var(--border-soft)] bg-[var(--bg-card)] shadow-thu-soft overflow-hidden">
                  <div
                    ref={topicListRef}
                    className="min-h-0 min-w-0 max-h-48 flex-1 overflow-y-auto"
                    role="list"
                  >
                    {availableTopicsForPanel.length === 0 ? (
                      <div className="px-3 py-3 text-sm text-[var(--text-muted)]">暂无主题</div>
                    ) : topicLetterIndex.indexLetters.length > 0 ? (
                      topicLetterIndex.indexLetters.map((letter) => (
                        <div key={letter} id={`topic-letter-${letter}`}>
                          <div className="sticky top-0 z-[1] bg-[var(--bg-card)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--thu-purple)] border-b border-[var(--border-soft)]">
                            {letter}
                          </div>
                          <ul className="divide-y divide-[var(--border-soft)]">
                            {(topicLetterIndex.groups.get(letter) ?? []).map((t) => (
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
                        </div>
                      ))
                    ) : (
                      <ul>
                        {availableTopicsForPanel.map((t) => (
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
                    )}
                  </div>
                  {topicLetterIndex.indexLetters.length > 1 && (
                    <div
                      className="flex max-h-48 w-7 shrink-0 flex-col overflow-y-auto border-l border-[var(--border-soft)] bg-[var(--bg-card)] py-1 pr-1"
                      aria-label="按首字母快速定位"
                    >
                      <div className="grid grid-cols-2 gap-x-0.5 gap-y-0 text-[9px] font-medium leading-tight text-[var(--text-muted)]">
                        {topicLetterIndex.indexLetters.map((letter) => (
                          <button
                            key={letter}
                            type="button"
                            onClick={() => scrollToTopicLetter(letter)}
                            className="flex min-h-0 items-center justify-center py-0.5 hover:text-[var(--thu-purple)] hover:bg-[var(--thu-purple-subtle)] rounded transition-colors"
                            title={`跳转到 ${letter}`}
                          >
                            {letter}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
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
                              const menuOpen = fileMenuPath === f.path;
                              return (
                                <li key={f.path} className="group flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => { setUrl({ stage: s.id, file: f.path }); setFileMenuPath(null); }}
                                    className={`min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${isActive ? "thu-btn-primary" : "text-[var(--text-muted)] hover:bg-[var(--thu-purple-subtle)] hover:text-[var(--text)]"}`}
                                    title={f.name}
                                  >
                                    {fileDisplayName(f.name)}
                                  </button>
                                  {source === "outputs" && (
                                    <div className="relative flex-shrink-0">
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setFileMenuPath(menuOpen ? null : f.path); }}
                                        className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--border-soft)] hover:text-[var(--text)] transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                        title="更多操作"
                                        aria-expanded={menuOpen}
                                      >
                                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                                          <circle cx="12" cy="5" r="1.5" />
                                          <circle cx="12" cy="12" r="1.5" />
                                          <circle cx="12" cy="19" r="1.5" />
                                        </svg>
                                      </button>
                                      {menuOpen && (
                                        <>
                                          <div className="fixed inset-0 z-10" aria-hidden onClick={() => setFileMenuPath(null)} />
                                          <ul className="absolute right-0 top-full z-20 mt-0.5 min-w-[8rem] rounded-lg border border-[var(--border-soft)] bg-[var(--bg-card)] py-1 shadow-thu-soft">
                                            <li>
                                              <a
                                                href={`/api/file?source=outputs&path=${encodeURIComponent(pathForApi(f.path))}&download=1&format=markdown`}
                                                download={f.name}
                                                className="block px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--thu-purple-subtle)]"
                                                onClick={() => setFileMenuPath(null)}
                                              >
                                                导出为 Markdown
                                              </a>
                                            </li>
                                            <li>
                                              <a
                                                href={`/api/file?source=outputs&path=${encodeURIComponent(pathForApi(f.path))}&download=1&format=docx`}
                                                download={(`${f.name.replace(/\.md$/i, "") || "document"}.docx`)}
                                                className="block px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--thu-purple-subtle)]"
                                                onClick={() => setFileMenuPath(null)}
                                              >
                                                导出为 Word（.docx）
                                              </a>
                                            </li>
                                            <li>
                                              <a
                                                href={`/api/file?source=outputs&path=${encodeURIComponent(pathForApi(f.path))}&download=1&format=pdf`}
                                                download={(`${f.name.replace(/\.md$/i, "") || "document"}.pdf`)}
                                                className="block px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--thu-purple-subtle)]"
                                                onClick={() => setFileMenuPath(null)}
                                              >
                                                导出为 PDF
                                              </a>
                                            </li>
                                            <li>
                                              <button
                                                type="button"
                                                className="w-full px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--thu-purple-subtle)]"
                                                onClick={() => { setRenameModal({ path: f.path, name: f.name }); setRenameValue(f.name); setRenameError(null); setFileMenuPath(null); }}
                                              >
                                                重命名
                                              </button>
                                            </li>
                                            <li>
                                              <button
                                                type="button"
                                                className="w-full px-3 py-2 text-left text-sm text-[var(--accent)] hover:bg-[var(--accent-subtle)]"
                                                onClick={async () => {
                                                  const ok = await thuConfirm(`确定将「${fileDisplayName(f.name)}」移至废纸篓？`);
                                                  if (ok) {
                                                    setDeleteError(null);
                                                    deleteFile(f.path);
                                                  }
                                                  setFileMenuPath(null);
                                                }}
                                              >
                                                删除文档
                                              </button>
                                            </li>
                                          </ul>
                                        </>
                                      )}
                                    </div>
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
              </div>
            )}
          </section>
          </aside>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-valuenow={sidebarWidth}
            aria-valuemin={SIDEBAR_WIDTH_MIN}
            aria-valuemax={SIDEBAR_WIDTH_MAX}
            onMouseDown={handleResizeStart}
            className={`flex-shrink-0 w-1 cursor-col-resize border-r border-[var(--border-soft)] bg-transparent transition-colors hover:bg-[var(--thu-purple-subtle)] ${isResizing ? "bg-[var(--thu-purple-subtle)]" : ""}`}
            title="拖拽调整侧边栏宽度"
          />
        </div>

        {renameModal && (
          <div className="thu-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="rename-title" onClick={() => { setRenameModal(null); setRenameError(null); }}>
            <div className="thu-modal-card relative mx-4 w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
              <button type="button" onClick={() => { setRenameModal(null); setRenameError(null); }} className="thu-modal-close absolute right-4 top-4 p-1" aria-label="关闭">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              <h3 id="rename-title" className="thu-modal-title mb-3 text-base pr-8">重命名文档</h3>
              <p className="mb-2 text-xs text-[var(--text-muted)]">当前：{renameModal.name}</p>
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="mb-2 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--bg-page)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--thu-purple)] focus:outline-none"
                placeholder="新文件名（如 report_20260224_v1.md）"
              />
              {renameError && <p className="mb-2 text-xs text-[var(--accent)]">{renameError}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setRenameModal(null); setRenameError(null); }}
                  className="thu-modal-btn-secondary rounded-lg px-3 py-2 text-sm font-medium"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => renameFile(renameModal.path, renameValue)}
                  className="thu-modal-btn-primary rounded-lg px-3 py-2 text-sm font-medium"
                >
                  确定
                </button>
              </div>
            </div>
          </div>
        )}

        <main ref={mainRef} className="flex-1 min-w-0 overflow-auto bg-[var(--bg-page)]">
          <div className="sticky top-0 z-10 border-b border-[var(--border-soft)] bg-[var(--bg-card)]/90 px-6 py-3 shadow-thu-soft backdrop-blur-md min-h-[3.25rem] flex items-center">
            <div className="absolute inset-x-0 bottom-0 h-px gradient-thu-line" aria-hidden />
            <div className="flex w-full items-center justify-between gap-4">
              <div className="text-sm text-[var(--text-muted)] min-w-0">
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
              {file && source === "outputs" && filePathForApi && (
                <div className="relative flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setExportMenuOpen((open) => !open)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:border-[var(--thu-purple)] hover:bg-[var(--thu-purple-subtle)] transition-colors"
                    aria-expanded={exportMenuOpen}
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <span>导出文档</span>
                    <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                      <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.25a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08z" />
                    </svg>
                  </button>
                  {exportMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        aria-hidden
                        onClick={() => setExportMenuOpen(false)}
                      />
                      <ul className="absolute right-0 top-full z-20 mt-1 min-w-[10rem] rounded-lg border border-[var(--border-soft)] bg-[var(--bg-card)] py-1 shadow-thu-soft text-xs">
                        <li>
                          <a
                            href={`/api/file?source=${encodeURIComponent(source)}&path=${encodeURIComponent(filePathForApi)}&download=1&format=markdown`}
                            download={((filePathForApi?.split("/").pop() ?? "").replace(/\.md$/i, "") || "document") + ".md"}
                            className="block px-3 py-1.5 text-[var(--text)] hover:bg-[var(--thu-purple-subtle)]"
                            onClick={() => setExportMenuOpen(false)}
                          >
                            导出为 Markdown
                          </a>
                        </li>
                        <li>
                          <a
                            href={`/api/file?source=${encodeURIComponent(source)}&path=${encodeURIComponent(filePathForApi)}&download=1&format=docx`}
                            download={((filePathForApi?.split("/").pop() ?? "").replace(/\.md$/i, "") || "document") + ".docx"}
                            className="block px-3 py-1.5 text-[var(--text)] hover:bg-[var(--thu-purple-subtle)]"
                            onClick={() => setExportMenuOpen(false)}
                          >
                            导出为 Word（.docx）
                          </a>
                        </li>
                        <li>
                          <a
                            href={`/api/file?source=${encodeURIComponent(source)}&path=${encodeURIComponent(filePathForApi)}&download=1&format=pdf`}
                            download={((filePathForApi?.split("/").pop() ?? "").replace(/\.md$/i, "") || "document") + ".pdf"}
                            className="block px-3 py-1.5 text-[var(--text)] hover:bg-[var(--thu-purple-subtle)]"
                            onClick={() => setExportMenuOpen(false)}
                          >
                            导出为 PDF
                          </a>
                        </li>
                      </ul>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="p-6 min-w-0 overflow-x-hidden flex-1">
            <div className="mx-auto max-w-3xl min-w-0 w-full">
              {loading && (
                <p className="text-sm text-[var(--text-muted)]">加载中…</p>
              )}
              {!loading && file && (
                <MarkdownPreview
                  content={content}
                  citationLinkTopic={
                    source === "outputs" && topic && (file.includes("05_report") || file.includes("06_review"))
                      ? topic
                      : undefined
                  }
                  emptyPlaceholder={
                    source === "outputs"
                      ? "该文件尚未生成或已被删除；请从左侧选择其他阶段文件，或先运行对应管线步骤。"
                      : undefined
                  }
                />
              )}
              {!loading && !file && (
                manualData ? (
                  <ManualView
                    data={manualData}
                    onSkillHover={setHoveredManualSkillId}
                    onAreaClick={handleManualAreaClick}
                    onSkillClick={handleSkillClick}
                  />
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">说明书加载中…</p>
                )
              )}
            </div>
          </div>
        </main>
      </div>
      <footer className="flex-shrink-0 border-t border-[var(--border-soft)] bg-[var(--bg-card)] px-6 py-3">
        {lastUpdateBeijing && (
          <p className="text-right text-xs text-[var(--text-muted)]">
            最后更新：{lastUpdateBeijing} 北京时间
          </p>
        )}
      </footer>
      <SessionLogPanel />
      {/* 重新检索「暂停运行」确认弹窗：确定取消 / 继续运行 */}
      {journalSearchAbortConfirmOpen && journalSearchJobId && (
        <div
          className="thu-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="journal-abort-confirm-title"
          onClick={() => setJournalSearchAbortConfirmOpen(false)}
        >
          <div className="thu-modal-card relative mx-4 w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setJournalSearchAbortConfirmOpen(false)}
              className="thu-modal-close absolute right-4 top-4 p-1"
              aria-label="关闭"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h3 id="journal-abort-confirm-title" className="thu-modal-title mb-3 text-base pr-8">暂停运行</h3>
            <p className="mb-4 text-sm text-[var(--text)]">是否中止当前检索？</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setJournalSearchAbortConfirmOpen(false)}
                className="thu-modal-btn-secondary rounded-lg px-3 py-2 text-sm font-medium"
              >
                继续运行
              </button>
              <button
                type="button"
                onClick={confirmAbortJournalSearch}
                className="thu-modal-btn-primary rounded-lg px-3 py-2 text-sm font-medium"
              >
                确定取消
              </button>
            </div>
          </div>
        </div>
      )}
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
