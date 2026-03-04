"use client";

import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from "react";
import { useThUAlertConfirm } from "@/components/ThUAlertConfirm";

/** 年份下拉：2026 在上，便于从最新文献选起 */
const YEAR_OPTIONS = Array.from({ length: 2026 - 1900 + 1 }, (_, i) => 2026 - i);

const SEARCH_TYPE_TOOLTIP =
  "严格检索：摘要与关键词都包含检索词才保留。宽松检索：标题、摘要或关键词任一包含即可。";

function toSlug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "");
}

export type JournalSearchParams = {
  topicInput: string;
  instructionInput: string;
  yearFrom?: number;
  yearTo?: number;
  searchMode: "strict" | "relaxed";
  journalSourceIds: string[];
  dataSourceLabel: string;
  selectedDisciplines: string[];
  abstractFallback?: boolean;
};

export const DISCIPLINES = [
  { id: "Sociology", label: "Sociology" },
  { id: "Anthropology", label: "Anthropology" },
  { id: "Economics", label: "Economics" },
] as const;

export type LiteratureSearchPanelHandle = {
  startSearchWithCurrentParams: () => void;
  getCurrentParams: () => JournalSearchParams | null;
};

export const LiteratureSearchPanel = forwardRef<
  LiteratureSearchPanelHandle,
  {
    onStartSearch: (params: {
      topicSlug: string;
      yearFrom?: number;
      yearTo?: number;
      journalSourceIds: string[];
      journalIssns?: string[];
      searchMode?: "strict" | "relaxed";
      instruction?: string;
      abstractFallback?: boolean;
    }) => void;
    runJobId?: string | null;
    runLog?: string;
    runDone?: boolean;
    runExitCode?: number;
    /** 取消运行（调用 /api/run/abort），由父组件负责清理 jobId 等状态 */
    onAbort?: (jobId: string) => void;
    onDataSourceChange?: (label: string) => void;
    onJumpToOutputs?: () => void;
    hideTitle?: boolean;
  }
>(function LiteratureSearchPanel(
  {
    onStartSearch,
    runJobId,
    runLog,
    runDone,
    runExitCode,
    onAbort,
    onDataSourceChange,
    onJumpToOutputs,
    hideTitle,
  },
  ref
) {
  const [selectedDisciplines, setSelectedDisciplines] = useState<string[]>(["Sociology", "Anthropology", "Economics"]);
  const [journals, setJournals] = useState<Array<{ openalex_source_id?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [topicInput, setTopicInput] = useState("");
  const [instructionInput, setInstructionInput] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [searchMode, setSearchMode] = useState<"strict" | "relaxed">("strict");
  const [abstractFallback, setAbstractFallback] = useState(false);
  const [searchTypeTooltipVisible, setSearchTypeTooltipVisible] = useState(false);
  const [running, setRunning] = useState(false);
  const [runStartTime, setRunStartTime] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const JOURNAL_SEARCH_ESTIMATED_SEC = 180;
  const requestIdRef = useRef(0);
  const { alert: thuAlert } = useThUAlertConfirm();

  useEffect(() => {
    if (runJobId) setRunStartTime((t) => t ?? Date.now());
    else {
      setRunStartTime(null);
      setProgress(0);
    }
  }, [runJobId]);

  useEffect(() => {
    if (!runStartTime || runDone) {
      if (runDone) setProgress(100);
      return;
    }
    const interval = setInterval(() => {
      const elapsed = (Date.now() - runStartTime) / 1000;
      setProgress(Math.min(95, (elapsed / JOURNAL_SEARCH_ESTIMATED_SEC) * 100));
    }, 1000);
    return () => clearInterval(interval);
  }, [runStartTime, runDone]);

  const fetchJournals = useCallback(() => {
    if (selectedDisciplines.length === 0) {
      setJournals([]);
      setLoading(false);
      return;
    }
    requestIdRef.current += 1;
    const myId = requestIdRef.current;
    setLoading(true);
    const params = new URLSearchParams();
    params.set("disciplines", selectedDisciplines.join(","));
    fetch(`/api/journals-by-discipline?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (myId !== requestIdRef.current) return;
        setJournals(d.journals || []);
      })
      .catch(() => {
        if (myId !== requestIdRef.current) return;
        setJournals([]);
      })
      .finally(() => {
        if (myId !== requestIdRef.current) return;
        setLoading(false);
      });
  }, [selectedDisciplines]);

  useEffect(() => {
    fetchJournals();
  }, [fetchJournals]);

  useEffect(() => {
    const label =
      selectedDisciplines.length === 0
        ? "OpenAlex 解析（未选学科）"
        : `OpenAlex 解析（${selectedDisciplines.map((d) => DISCIPLINES.find((x) => x.id === d)?.label ?? d).join(", ")})`;
    onDataSourceChange?.(label);
  }, [selectedDisciplines, onDataSourceChange]);

  const toggleDiscipline = (id: string) => {
    setSelectedDisciplines((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleStartSearch = useCallback(async () => {
    if (selectedDisciplines.length === 0) {
      await thuAlert("请选择至少1个学科");
      return;
    }
    const slug =
      topicInput.trim() ? toSlug(topicInput) : toSlug(instructionInput) || "digital_labor";
    const from = yearFrom ? parseInt(yearFrom, 10) : undefined;
    const to = yearTo ? parseInt(yearTo, 10) : undefined;
    const ids = journals
      .map((j) => (j.openalex_source_id ?? "").trim())
      .filter(Boolean) as string[];
    setRunning(true);
    const instr = (instructionInput || "").trim() || undefined;
    onStartSearch({
      topicSlug: slug,
      yearFrom: from && !Number.isNaN(from) ? from : undefined,
      yearTo: to && !Number.isNaN(to) ? to : undefined,
      journalSourceIds: ids,
      searchMode,
      instruction: instr,
      abstractFallback,
    });
    setRunning(false);
  }, [
    selectedDisciplines.length,
    topicInput,
    instructionInput,
    yearFrom,
    yearTo,
    journals,
    searchMode,
    abstractFallback,
    onStartSearch,
    thuAlert,
  ]);

  const getCurrentParams = useCallback((): JournalSearchParams | null => {
    const ids = journals
      .map((j) => (j.openalex_source_id ?? "").trim())
      .filter(Boolean) as string[];
    const label =
      selectedDisciplines.length === 0
        ? "OpenAlex 解析（未选学科）"
        : `OpenAlex 解析（${selectedDisciplines.map((d) => DISCIPLINES.find((x) => x.id === d)?.label ?? d).join(", ")}）`;
    const from = yearFrom ? parseInt(yearFrom, 10) : NaN;
    const to = yearTo ? parseInt(yearTo, 10) : NaN;
    return {
      topicInput,
      instructionInput,
      yearFrom: Number.isNaN(from) ? undefined : from,
      yearTo: Number.isNaN(to) ? undefined : to,
      searchMode,
      journalSourceIds: ids,
      dataSourceLabel: label,
      selectedDisciplines: [...selectedDisciplines],
      abstractFallback,
    };
  }, [journals, selectedDisciplines, topicInput, instructionInput, yearFrom, yearTo, searchMode, abstractFallback]);

  useImperativeHandle(
    ref,
    () => ({
      startSearchWithCurrentParams: handleStartSearch,
      getCurrentParams,
    }),
    [handleStartSearch, getCurrentParams]
  );

  return (
    <div className="space-y-4">
      {!hideTitle && (
        <h3 className="thu-heading text-xs font-medium uppercase tracking-wider">
          新增检索
        </h3>
      )}
      <p className="text-[11px] text-[var(--text-muted)]">
        当前数据源：OpenAlex 解析（Sociology, Anthropology, Economics的Q1期刊）。可选 1～3 个学科后设置主题与年份进行检索。
      </p>

      <div className="space-y-2">
        <span className="text-sm text-[var(--text-muted)]">检索学科</span>
        <div className="flex flex-col gap-2">
          {DISCIPLINES.map((d) => (
            <label
              key={d.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--bg-card)] px-3 py-2 text-sm transition-colors has-[:checked]:border-[var(--thu-purple)] has-[:checked]:bg-[var(--thu-purple-subtle)]"
            >
              <input
                type="checkbox"
                checked={selectedDisciplines.includes(d.id)}
                onChange={() => toggleDiscipline(d.id)}
                className="h-3.5 w-3.5 shrink-0 rounded border-[var(--border)] accent-[var(--thu-purple)]"
              />
              {d.label}
            </label>
          ))}
        </div>
      </div>

      <p className="text-xs text-[var(--text-muted)]">
        {loading ? "加载中…" : `共 ${journals.length} 本期刊（已选学科）`}
      </p>

      <div className="space-y-3 rounded-lg border border-[var(--border-soft)] bg-[var(--bg-sidebar)] px-3 py-3">
        <span className="text-xs font-medium text-[var(--text-muted)]">自定义</span>
        <label className="block">
          <span className="text-[11px] text-[var(--text-muted)]">提示词（可选）</span>
          <textarea
            value={instructionInput}
            onChange={(e) => setInstructionInput(e.target.value)}
            placeholder="例如：在选定期刊中搜索数字劳动相关、2024-2026年间的论文"
            rows={2}
            className="thu-input mt-1 w-full rounded-lg px-3 py-2 text-sm resize-y"
          />
        </label>
        <label className="block">
          <span className="text-[11px] text-[var(--text-muted)]">检索主题</span>
          <input
            type="text"
            value={topicInput}
            onChange={(e) => setTopicInput(e.target.value)}
            placeholder="如：digital_labor"
            className="thu-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
          />
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
            请输入英文，单词间空格和下划线效果等价。
          </p>
        </label>
        <label className="block">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[var(--text-muted)]">检索类型</span>
            <span
              className="relative inline-flex h-[1em] w-[1em] cursor-help items-center justify-center rounded-full border border-current text-[11px]"
              onMouseEnter={() => setSearchTypeTooltipVisible(true)}
              onMouseLeave={() => setSearchTypeTooltipVisible(false)}
              aria-label="检索类型说明"
            >
              <span className="opacity-70">ⓘ</span>
              {searchTypeTooltipVisible && (
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
              onClick={() => setSearchMode("strict")}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
                searchMode === "strict"
                  ? "bg-[#660874] text-white shadow-[0_2px_8px_rgba(102,8,116,0.3)]"
                  : "border border-[var(--border-soft)] bg-[var(--bg-sidebar)] text-[var(--text-muted)] hover:border-[#660874] hover:text-[var(--text)]"
              }`}
            >
              严格检索
            </button>
            <button
              type="button"
              onClick={() => setSearchMode("relaxed")}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
                searchMode === "relaxed"
                  ? "text-white shadow-[0_2px_8px_rgba(217,51,121,0.3)]"
                  : "border border-[var(--border-soft)] bg-[var(--bg-sidebar)] text-[var(--text-muted)] hover:border-[#d93379] hover:text-[var(--text)]"
              }`}
              style={searchMode === "relaxed" ? { background: "linear-gradient(135deg, #c92d6a 0%, #d93379 50%, #e85a9a 100%)" } : undefined}
            >
              宽松检索
            </button>
          </div>
        </label>
        <div className="flex gap-3">
          <label className="flex-1">
            <span className="text-[11px] text-[var(--text-muted)]">年份起</span>
            <select
              value={yearFrom}
              onChange={(e) => setYearFrom(e.target.value)}
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
              value={yearTo}
              onChange={(e) => setYearTo(e.target.value)}
              className="thu-input mt-1 w-full rounded-lg px-3 py-2 text-sm bg-[var(--bg-card)]"
            >
              <option value="">不限定</option>
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--bg-card)] px-3 py-2 text-sm transition-colors has-[:checked]:border-[var(--thu-purple)] has-[:checked]:bg-[var(--thu-purple-subtle)]">
          <input
            type="checkbox"
            checked={abstractFallback}
            onChange={(e) => setAbstractFallback(e.target.checked)}
            className="h-3.5 w-3.5 shrink-0 rounded border-[var(--border)] accent-[var(--thu-purple)]"
          />
          <span>摘要补全</span>
          <span className="text-[11px] text-[var(--text-muted)]">（缺摘要时抓取出版商页，耗时会变长）</span>
        </label>
      </div>

      <button
        type="button"
        onClick={handleStartSearch}
        disabled={loading || journals.length === 0 || running}
        className="thu-btn-primary w-full rounded-lg px-3 py-2 text-sm font-medium shadow-thu-soft transition-colors disabled:opacity-50"
      >
        开始检索
      </button>

      {runJobId && (
        <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--bg-sidebar)] p-2 shadow-thu-soft" data-run-log-section="journal">
          {!runDone && runStartTime != null && (
            <div className="mb-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <div
                  className="run-status-spinner h-6 w-6 flex-shrink-0 rounded-full border-2 border-[var(--thu-purple)] border-t-transparent"
                  aria-hidden
                />
                <p className="min-w-0 flex-1 text-[11px] text-[var(--text-muted)]">
                  预估约 {Math.round(JOURNAL_SEARCH_ESTIMATED_SEC / 60)} 分钟 · 已用 {Math.floor((Date.now() - runStartTime) / 1000)} 秒 · 进度 {Math.round(progress)}%
                </p>
                {onAbort && (
                  <button
                    type="button"
                    onClick={() => onAbort(runJobId)}
                    className="thu-modal-btn-secondary flex-shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium"
                  >
                    暂停运行
                  </button>
                )}
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-card)]">
                <div
                  className="h-full rounded-full bg-[var(--thu-purple)] transition-[width] duration-500 ease-out"
                  style={{ width: `${Math.round(progress)}%` }}
                  role="progressbar"
                  aria-valuenow={Math.round(progress)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>
            </div>
          )}
          {runDone && (
            <div className="mb-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--bg-card)]">
                <div className="h-full w-full rounded-full bg-[var(--thu-purple)]" style={{ width: "100%" }} role="progressbar" aria-valuenow={100} aria-valuemin={0} aria-valuemax={100} />
              </div>
              <span className="text-[11px] font-medium text-[var(--text-muted)]">100%</span>
            </div>
          )}
          <div className="mb-1 text-xs font-medium text-[var(--text-muted)]">运行日志</div>
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--bg-card)] p-2 text-xs text-[var(--text)]">
            {runLog || "（等待…）"}
          </pre>
          {runDone && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className={runExitCode === 0 ? "text-[var(--text)]" : "text-[var(--accent)]"}>
                {runExitCode === 0 ? "✓ 完成" : `退出码 ${runExitCode}`}
              </span>
              {runExitCode === 0 && onJumpToOutputs && (
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
});
