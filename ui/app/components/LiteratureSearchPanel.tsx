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

/** 是否包含非英文字符（仅允许英文字母、数字、空格、下划线、连字符） */
function hasNonEnglish(s: string): boolean {
  if (!s.trim()) return false;
  return /[^a-zA-Z0-9\s_\-]/.test(s);
}

export type JournalSearchParams = {
  topicInput: string;
  searchTerms: string[];
  searchLogics: ("and" | "or")[];
  yearFrom?: number;
  yearTo?: number;
  searchMode: "strict" | "relaxed";
  journalSourceIds: string[];
  dataSourceLabel: string;
  selectedDisciplines: string[];
  selectedQuartiles: string[];
  abstractFallback?: boolean;
};

const QUARTILE_BUTTONS = ["Q1", "Q2", "Q3", "Q4"] as const;

/** 重新检索弹窗等处的学科列表 fallback（API 未加载时） */
export const FALLBACK_DISCIPLINES = [
  { id: "Sociology", label: "Sociology" },
  { id: "Anthropology", label: "Anthropology" },
  { id: "Economics", label: "Economics" },
];

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
      searchTerms?: string[];
      searchLogics?: ("and" | "or")[];
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
  const [availableDisciplines, setAvailableDisciplines] = useState<{ id: string; label: string }[]>([]);
  const [selectedDisciplines, setSelectedDisciplines] = useState<string[]>([]);
  const [selectedQuartiles, setSelectedQuartiles] = useState<string[]>([]);
  const [journals, setJournals] = useState<Array<{ openalex_source_id?: string }>>([]);
  const [loading, setLoading] = useState(true);
  /** 主要检索词 */
  const [baseTerm, setBaseTerm] = useState("");
  /** 后续添加的检索词，每项带与前一词的逻辑 */
  const [extraTerms, setExtraTerms] = useState<{ logic: "and" | "or"; term: string }[]>([]);
  /** 当前正在输入的“添加词”及下次添加时使用的逻辑 */
  const [extraInput, setExtraInput] = useState("");
  const [nextLogic, setNextLogic] = useState<"and" | "or">("or");
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
    const validQuartiles = selectedQuartiles.filter((q) => /^Q[1-4]$/.test(q));
    if (validQuartiles.length > 0) params.set("quartile", validQuartiles.join(","));
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
  }, [selectedDisciplines, selectedQuartiles]);

  useEffect(() => {
    fetch("/api/journals-by-discipline")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.disciplines) && d.disciplines.length > 0) {
          setAvailableDisciplines(d.disciplines.map((x: string) => ({ id: x, label: x })));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchJournals();
  }, [fetchJournals]);

  useEffect(() => {
    const label =
      selectedDisciplines.length === 0
        ? "OpenAlex 解析（未选学科）"
        : `OpenAlex 解析（${selectedDisciplines.join(", ")}${selectedQuartiles.length > 0 ? ` ${selectedQuartiles.join(",")}` : ""}）`;
    onDataSourceChange?.(label);
  }, [selectedDisciplines, selectedQuartiles, onDataSourceChange]);

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
    const terms = baseTerm.trim()
      ? [baseTerm.trim(), ...extraTerms.map((e) => e.term.trim())].filter(Boolean)
      : [];
    if (terms.length === 0) {
      await thuAlert("请输入至少一个检索词");
      return;
    }
    const slug = toSlug(terms[0]);
    const from = yearFrom ? parseInt(yearFrom, 10) : undefined;
    const to = yearTo ? parseInt(yearTo, 10) : undefined;
    const ids = journals
      .map((j) => (j.openalex_source_id ?? "").trim())
      .filter(Boolean) as string[];
    const logics = extraTerms.map((e) => e.logic);
    setRunning(true);
    onStartSearch({
      topicSlug: slug,
      yearFrom: from && !Number.isNaN(from) ? from : undefined,
      yearTo: to && !Number.isNaN(to) ? to : undefined,
      journalSourceIds: ids,
      searchMode,
      searchTerms: terms.length > 0 ? terms : undefined,
      searchLogics: logics.length > 0 ? logics : undefined,
      abstractFallback,
    });
    setRunning(false);
  }, [
    selectedDisciplines.length,
    baseTerm,
    extraTerms,
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
        : `OpenAlex 解析（${selectedDisciplines.join(", ")}${selectedQuartiles.length > 0 ? ` ${selectedQuartiles.join(",")}` : ""}）`;
    const from = yearFrom ? parseInt(yearFrom, 10) : NaN;
    const to = yearTo ? parseInt(yearTo, 10) : NaN;
    const terms = baseTerm.trim() ? [baseTerm.trim(), ...extraTerms.map((e) => e.term.trim())].filter(Boolean) : [];
    const logics = extraTerms.map((e) => e.logic);
    return {
      topicInput: baseTerm,
      searchTerms: [...terms],
      searchLogics: [...logics],
      yearFrom: Number.isNaN(from) ? undefined : from,
      yearTo: Number.isNaN(to) ? undefined : to,
      searchMode,
      journalSourceIds: ids,
      dataSourceLabel: label,
      selectedDisciplines: [...selectedDisciplines],
      selectedQuartiles: [...selectedQuartiles],
      abstractFallback,
    };
  }, [journals, selectedDisciplines, selectedQuartiles, baseTerm, extraTerms, yearFrom, yearTo, searchMode, abstractFallback]);

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
        当前数据源：OpenAlex 解析期刊。可选学科与分区（Q1–Q4）后设置主题与年份进行检索。
      </p>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm text-[var(--text-muted)] shrink-0">检索学科</span>
          <span className="inline-flex items-center gap-x-2 shrink-0">
            {availableDisciplines.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedDisciplines(availableDisciplines.map((d) => d.id))}
                className="text-[11px] font-medium text-[var(--thu-purple)] hover:underline whitespace-nowrap"
              >
                全选
              </button>
            )}
            {selectedDisciplines.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedDisciplines([])}
                className="text-[11px] font-medium text-[var(--thu-purple)] hover:underline whitespace-nowrap"
              >
                一键清空
              </button>
            )}
          </span>
        </div>
        <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
          {availableDisciplines.length === 0 ? (
            <p className="text-[11px] text-[var(--text-muted)]">加载学科列表…</p>
          ) : (
            availableDisciplines.map((d) => (
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
            ))
          )}
        </div>
      </div>

      <div className="space-y-1">
        <span className="text-sm text-[var(--text-muted)]">分区</span>
        <div className="flex flex-wrap gap-2">
          {QUARTILE_BUTTONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() =>
                setSelectedQuartiles((prev) =>
                  prev.includes(q) ? prev.filter((x) => x !== q) : [...prev, q].sort()
                )
              }
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                selectedQuartiles.includes(q)
                  ? "bg-[var(--thu-purple)] text-white"
                  : "border border-[var(--border-soft)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:border-[var(--thu-purple)] hover:text-[var(--text)]"
              }`}
              aria-pressed={selectedQuartiles.includes(q)}
              aria-label={`分区 ${q}`}
            >
              {q}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-[var(--text-muted)]">可多选；不选则包含该学科下全部分区</p>
        <p className="text-[11px] text-[var(--text-muted)] whitespace-nowrap">
          {loading ? "加载中…" : `已选 ${selectedDisciplines.length} 个学科 · 共 ${journals.length} 本期刊`}
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-[var(--border-soft)] bg-[var(--bg-sidebar)] px-3 py-3">
        <div>
          <span className="text-xs font-medium text-[var(--text-muted)]">自定义</span>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">仅支持英文检索</p>
        </div>
        <label className="block">
          <span className="text-[11px] text-[var(--text-muted)]">主要检索词</span>
          <input
            type="text"
            value={baseTerm}
            onChange={(e) => setBaseTerm(e.target.value)}
            placeholder="如：digital labor"
            className="thu-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
          />
          {baseTerm.trim() && hasNonEnglish(baseTerm) && (
            <p className="mt-0.5 text-[11px] text-[var(--accent)]">请输入英文，单词间下划线和空格等价。</p>
          )}
        </label>
        <label className="block">
          <span className="text-[11px] text-[var(--text-muted)]">添加检索词（副检索词）</span>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
            可填缩写、同义词等，如AI、EVs等；选「或」可扩大命中，选「且」则需同时包含。
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <input
              type="text"
              value={extraInput}
              onChange={(e) => setExtraInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const t = extraInput.trim();
                  if (t) {
                    setExtraTerms((prev) => [...prev, { logic: nextLogic, term: t }]);
                    setExtraInput("");
                  }
                }
              }}
              placeholder="如AI、EVs等"
              className="thu-input min-w-0 flex-1 rounded-lg px-2.5 py-1.5 text-sm"
            />
            <select
              value={nextLogic}
              onChange={(e) => setNextLogic(e.target.value as "and" | "or")}
              className="shrink-0 rounded-lg border border-[var(--border-soft)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text)]"
              aria-label="与前一词的逻辑"
            >
              <option value="or">或</option>
              <option value="and">且</option>
            </select>
            <button
              type="button"
              onClick={() => {
                const t = extraInput.trim();
                if (t) {
                  setExtraTerms((prev) => [...prev, { logic: nextLogic, term: t }]);
                  setExtraInput("");
                }
              }}
              className="thu-modal-btn-secondary shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-medium"
            >
              添加
            </button>
          </div>
          {(extraInput.trim() && hasNonEnglish(extraInput)) || extraTerms.some((e) => hasNonEnglish(e.term)) ? (
            <p className="mt-0.5 text-[11px] text-[var(--accent)]">请输入英文，单词间下划线和空格等价。</p>
          ) : null}
          {extraTerms.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-[var(--text-muted)]">已添加：</span>
              {extraTerms.map((e, i) => (
                <span
                  key={`${e.term}-${i}`}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--border-soft)] bg-[var(--bg-card)] px-2 py-0.5 text-xs"
                >
                  <span className="text-[var(--text-muted)]">{e.logic === "and" ? "且" : "或"}</span>
                  <span>{e.term}</span>
                  <button
                    type="button"
                    onClick={() => setExtraTerms((prev) => prev.filter((_, j) => j !== i))}
                    className="text-[var(--text-muted)] hover:text-[var(--text)]"
                    aria-label={`移除 ${e.term}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
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
        disabled={loading || journals.length === 0 || running || (!baseTerm.trim() && extraTerms.length === 0)}
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
