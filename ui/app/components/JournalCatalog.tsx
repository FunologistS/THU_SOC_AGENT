"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface JournalItem {
  name?: string;
  title?: string;
  short?: string;
  display_name?: string;
  issn: string;
  eissn?: string;
  openalex_source_id?: string;
  publisher: string;
  has_jcr?: boolean;
  categories?: string[];
  quartile?: string;
}

export function JournalCatalog({
  onStartSearch,
  runJobId,
  runLog,
  runDone,
  runExitCode,
}: {
  onStartSearch: (params: {
    topicSlug: string;
    yearFrom?: number;
    yearTo?: number;
    journalSourceIds: string[];
    journalIssns?: string[];
  }) => void;
  runJobId?: string | null;
  runLog?: string;
  runDone?: boolean;
  runExitCode?: number;
}) {
  const [journals, setJournals] = useState<JournalItem[]>([]);
  const [disciplines, setDisciplines] = useState<string[]>([]);
  const [publishers, setPublishers] = useState<string[]>([]);
  const [discipline, setDiscipline] = useState("");
  const [quartile, setQuartile] = useState("");
  const [publisher, setPublisher] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [topicInput, setTopicInput] = useState("");
  const [instructionInput, setInstructionInput] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [running, setRunning] = useState(false);
  const [useWos, setUseWos] = useState(true);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const fetchingRef = useRef(false);

  const fetchWos = useCallback(() => {
    const params = new URLSearchParams();
    if (discipline) params.set("discipline", discipline);
    if (quartile) params.set("quartile", quartile);
    if (publisher) params.set("publisher", publisher);
    fetchingRef.current = true;
    setLoadingCatalog(true);
    fetch(`/api/journals-wos?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (!fetchingRef.current) return;
        const list = (d.journals || []).map((j: Record<string, unknown>) => ({
          title: j.title,
          name: j.title,
          issn: j.issn ?? "",
          eissn: j.eissn ?? "",
          publisher: j.publisher ?? "",
          categories: j.categories,
          quartile: j.quartile,
        }));
        setJournals(list);
        if (d.disciplines) setDisciplines(d.disciplines);
        if (d.publishers) setPublishers(d.publishers);
      })
      .catch(() => { if (fetchingRef.current) setJournals([]); })
      .finally(() => {
        fetchingRef.current = false;
        setLoadingCatalog(false);
      });
  }, [discipline, quartile, publisher]);

  const fetchYml = useCallback(() => {
    fetchingRef.current = true;
    setLoadingCatalog(true);
    const params = new URLSearchParams();
    if (publisher) params.set("publisher", publisher);
    fetch(`/api/journals?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (!fetchingRef.current) return;
        setJournals(d.journals || []);
        if (d.publishers) setPublishers(d.publishers);
      })
      .catch(() => { if (fetchingRef.current) setJournals([]); })
      .finally(() => {
        fetchingRef.current = false;
        setLoadingCatalog(false);
      });
  }, [publisher]);

  useEffect(() => {
    if (useWos) fetchWos();
    else fetchYml();
  }, [useWos, fetchWos, fetchYml]);

  const toSlug = (s: string) => {
    const slug = s
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_/-]/g, "")
      .replace(/-/g, "_");
    return slug || "digital_labor";
  };

  const handleStartSearch = () => {
    const slug =
      topicInput.trim() ? toSlug(topicInput) : toSlug(instructionInput) || "digital_labor";
    const from = yearFrom ? parseInt(yearFrom, 10) : undefined;
    const to = yearTo ? parseInt(yearTo, 10) : undefined;

    if (useWos && journals.length > 0) {
      const issns = journals
        .map((j) => [j.issn, j.eissn].filter(Boolean))
        .flat()
        .filter(Boolean) as string[];
      setRunning(true);
      setDialogOpen(false);
      onStartSearch({
        topicSlug: slug,
        yearFrom: from && !Number.isNaN(from) ? from : undefined,
        yearTo: to && !Number.isNaN(to) ? to : undefined,
        journalSourceIds: [],
        journalIssns: Array.from(new Set(issns)),
      });
    } else if (!useWos && journals.length > 0) {
      const ids = journals
        .map((j) => (j as { openalex_source_id?: string }).openalex_source_id)
        .filter(Boolean) as string[];
      setRunning(true);
      setDialogOpen(false);
      onStartSearch({
        topicSlug: slug,
        yearFrom: from && !Number.isNaN(from) ? from : undefined,
        yearTo: to && !Number.isNaN(to) ? to : undefined,
        journalSourceIds: ids,
      });
    } else {
      setRunning(true);
      setDialogOpen(false);
      onStartSearch({
        topicSlug: slug,
        yearFrom: from && !Number.isNaN(from) ? from : undefined,
        yearTo: to && !Number.isNaN(to) ? to : undefined,
        journalSourceIds: [],
      });
    }
    setTopicInput("");
    setInstructionInput("");
    setYearFrom("");
    setYearTo("");
    setRunning(false);
  };

  const displayName = (j: JournalItem) =>
    j.display_name || j.name || j.short || j.title || "";
  const toTitleCase = (s: string) =>
    String(s || "")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  const displayTitle = (j: JournalItem) => toTitleCase(displayName(j));

  return (
    <div className="space-y-4">
      <h3 className="thu-heading text-xs font-medium uppercase tracking-wider">
        期刊数据库管理
      </h3>
      <div className="space-y-3">
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
          <span className="text-sm text-[var(--text-muted)]">数据源</span>
          <select
            value={useWos ? "wos" : "yml"}
            onChange={(e) => setUseWos(e.target.value === "wos")}
            className="thu-input w-full rounded-lg px-3 py-2 text-sm"
          >
            <option value="wos">SSCI完整目录（3540）</option>
            <option value="yml">OpenAlex解析社会学Q1期刊目录（58+1）</option>
          </select>
          {useWos && (
            <>
              <span className="text-sm text-[var(--text-muted)]">学科</span>
              <select
                value={discipline}
                onChange={(e) => setDiscipline(e.target.value)}
                className="thu-input w-full rounded-lg px-3 py-2 text-sm"
              >
                <option value="">全部</option>
                {disciplines.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <span className="text-sm text-[var(--text-muted)]">分区</span>
              <select
                value={quartile}
                onChange={(e) => setQuartile(e.target.value)}
                className="thu-input w-full rounded-lg px-3 py-2 text-sm"
              >
                <option value="">全部</option>
                <option value="Q1">Q1</option>
                <option value="Q2">Q2</option>
                <option value="Q3">Q3</option>
                <option value="Q4">Q4</option>
              </select>
            </>
          )}
          <span className="text-sm text-[var(--text-muted)]">出版社</span>
          <select
            value={publisher}
            onChange={(e) => setPublisher(e.target.value)}
            className="thu-input w-full rounded-lg px-3 py-2 text-sm"
          >
            <option value="">全部</option>
            {publishers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-0.5 text-xs text-[var(--text-muted)]">
          <p className="font-medium text-[var(--text)]">
            {loadingCatalog ? "加载期刊列表…" : `共 ${journals.length} 本期刊`}
          </p>
          {useWos && !loadingCatalog && (
            <p className="leading-relaxed">
              检索时将自动匹配 OpenAlex 解析社会学 Q1 期刊
            </p>
          )}
        </div>
        <div className="max-h-44 overflow-y-auto rounded-xl border border-[var(--border-soft)] bg-[var(--bg-card)] shadow-thu-soft">
          <ul className="divide-y divide-[var(--border-soft)]">
            {journals.slice(0, 50).map((j, i) => (
              <li
                key={j.issn || j.openalex_source_id || i}
                className="px-3 py-2 text-sm leading-snug"
                title={displayName(j)}
              >
                <span className="break-words text-[var(--text)]">
                  {displayTitle(j)}
                </span>
                {(j.quartile || (!useWos && (j as { has_jcr?: boolean }).has_jcr)) && (
                  <span className="ml-1.5 inline-flex shrink-0 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                    {j.quartile || "JCR"}
                  </span>
                )}
              </li>
            ))}
            {journals.length > 50 && (
              <li className="px-3 py-2 text-xs text-[var(--text-muted)]">
                … 等共 {journals.length} 本
              </li>
            )}
          </ul>
        </div>
        <div className="flex flex-col gap-2 pt-0.5">
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="thu-btn-primary w-full rounded-lg px-3 py-2 text-sm font-medium shadow-thu-soft transition-colors"
          >
            在选中期刊中检索
          </button>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="thu-btn-secondary w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          >
            输入检索指令
          </button>
        </div>
        {runJobId && (
          <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--bg-sidebar)] p-2 shadow-thu-soft">
            <div className="mb-1 text-xs font-medium text-[var(--text-muted)]">
              检索运行日志
            </div>
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

      {dialogOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ backgroundColor: "var(--overlay)" }}
          onClick={() => !running && setDialogOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="dialog-title"
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-thu-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 id="dialog-title" className="font-semibold text-[var(--text)] text-lg">
              检索指令
            </h4>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {journals.length > 0
                ? `当前筛选共 ${journals.length} 本期刊，可填写主题与年份范围后开始检索。`
                : "未选定期刊时将使用全部已解析期刊进行检索。"}
            </p>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-xs text-[var(--text-muted)]">检索指令（可选）</span>
                <textarea
                  value={instructionInput}
                  onChange={(e) => setInstructionInput(e.target.value)}
                  placeholder="例如：在选定期刊中搜索数字劳动相关、2024-2026年间的论文"
                  rows={3}
                  className="thu-input mt-1 w-full rounded-lg px-3 py-2 text-sm resize-y"
                />
              </label>
              <label className="block">
                <span className="text-xs text-[var(--text-muted)]">主题 / 关键词</span>
                <input
                  type="text"
                  value={topicInput}
                  onChange={(e) => setTopicInput(e.target.value)}
                  placeholder="如：digital_labor、artificial_intelligence"
                  className="thu-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
                />
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  使用英文或下划线，如 digital_labor
                </p>
              </label>
              <div className="flex gap-3">
                <label className="flex-1">
                  <span className="text-xs text-[var(--text-muted)]">年份起</span>
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
                  <span className="text-xs text-[var(--text-muted)]">年份止</span>
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
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                className="rounded-lg px-3 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--bg-sidebar)] transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleStartSearch}
                disabled={running || (!topicInput.trim() && !instructionInput.trim())}
                className="thu-btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 transition-colors shadow-thu-soft"
              >
                开始检索
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
