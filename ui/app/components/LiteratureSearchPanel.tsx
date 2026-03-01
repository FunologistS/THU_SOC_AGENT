"use client";

import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from "react";
import { useThUAlertConfirm } from "@/components/ThUAlertConfirm";

const DISCIPLINES = [
  { id: "Sociology", label: "Sociology" },
  { id: "Anthropology", label: "Anthropology" },
  { id: "Economics", label: "Economics" },
] as const;

function toSlug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "");
}

export type LiteratureSearchPanelHandle = {
  startSearchWithCurrentParams: () => void;
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
    }) => void;
    runJobId?: string | null;
    runLog?: string;
    runDone?: boolean;
    runExitCode?: number;
    onDataSourceChange?: (label: string) => void;
    hideTitle?: boolean;
  }
>(function LiteratureSearchPanel(
  {
    onStartSearch,
    runJobId,
    runLog,
    runDone,
    runExitCode,
    onDataSourceChange,
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
  const [searchMode, setSearchMode] = useState<"strict" | "relaxed">("relaxed");
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
    onStartSearch({
      topicSlug: slug,
      yearFrom: from && !Number.isNaN(from) ? from : undefined,
      yearTo: to && !Number.isNaN(to) ? to : undefined,
      journalSourceIds: ids,
      searchMode,
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
    onStartSearch,
    thuAlert,
  ]);

  useImperativeHandle(ref, () => ({
    startSearchWithCurrentParams: handleStartSearch,
  }), [handleStartSearch]);

  return (
    <div className="space-y-4">
      {!hideTitle && (
        <h3 className="thu-heading text-xs font-medium uppercase tracking-wider">
          文献检索
        </h3>
      )}
      <p className="text-[11px] text-[var(--text-muted)]">
        数据来源：OpenAlex 解析期刊（社会学 / 人类学 / 经济学）。可选 1～3 个学科后设置主题与年份进行检索。
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
          <span className="text-[11px] text-[var(--text-muted)]">主题 / 关键词</span>
          <input
            type="text"
            value={topicInput}
            onChange={(e) => setTopicInput(e.target.value)}
            placeholder="如：digital_labor、artificial_intelligence"
            className="thu-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
          />
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
            使用英文或下划线（会自动转为空格）
          </p>
        </label>
        <label className="block">
          <span className="text-[11px] text-[var(--text-muted)]">检索范围</span>
          <select
            value={searchMode}
            onChange={(e) => setSearchMode(e.target.value as "strict" | "relaxed")}
            className="thu-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
          >
            <option value="relaxed">宽松检索（标题、摘要等出现即可）</option>
            <option value="strict">严格检索（仅标题中含检索词）</option>
          </select>
        </label>
        <div className="flex gap-3">
          <label className="flex-1">
            <span className="text-[11px] text-[var(--text-muted)]">年份起</span>
            <input
              type="number"
              min="2000"
              max="2030"
              value={yearFrom}
              onChange={(e) => setYearFrom(e.target.value)}
              placeholder="2024"
              className="thu-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="flex-1">
            <span className="text-[11px] text-[var(--text-muted)]">年份止</span>
            <input
              type="number"
              min="2000"
              max="2030"
              value={yearTo}
              onChange={(e) => setYearTo(e.target.value)}
              placeholder="2026"
              className="thu-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
            />
          </label>
        </div>
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
        <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--bg-sidebar)] p-2 shadow-thu-soft">
          {!runDone && runStartTime != null && (
            <div className="mb-2 space-y-1.5">
              <p className="text-[11px] text-[var(--text-muted)]">
                预估约 {Math.round(JOURNAL_SEARCH_ESTIMATED_SEC / 60)} 分钟 · 已用 {Math.floor((Date.now() - runStartTime) / 1000)} 秒 · 进度 {Math.round(progress)}%
              </p>
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
            <p className="mt-2 text-xs">
              {runExitCode === 0 ? "✓ 完成" : `退出码 ${runExitCode}`}
            </p>
          )}
        </div>
      )}
    </div>
  );
});
