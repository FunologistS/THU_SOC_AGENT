"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

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
  jif?: string;
  jci?: string;
  oa_citable_pct?: string;
  total_citations?: string;
  jcr_abbrev?: string;
}

const DATA_SOURCE_LABELS: Record<string, string> = {
  wos: "SSCI完整目录（3540）",
  yml: "OpenAlex解析社会学Q1期刊目录（58+1）",
};

export function JournalCatalog({
  onStartSearch,
  runJobId,
  runLog,
  runDone,
  runExitCode,
  onDataSourceChange,
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
  /** 数据源切换时回调，用于在技能工作台显示当前数据源提示 */
  onDataSourceChange?: (label: string) => void;
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
  const [detailJournal, setDetailJournal] = useState<JournalItem | null>(null);
  const [journalSearchQuery, setJournalSearchQuery] = useState("");
  const fetchingRef = useRef(false);
  const [runStartTime, setRunStartTime] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const JOURNAL_SEARCH_ESTIMATED_SEC = 180;

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
          jif: j.jif,
          jci: j.jci,
          oa_citable_pct: j.oa_citable_pct,
          total_citations: j.total_citations,
          jcr_abbrev: j.jcr_abbrev,
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

  useEffect(() => {
    onDataSourceChange?.(DATA_SOURCE_LABELS[useWos ? "wos" : "yml"] ?? (useWos ? "SSCI完整目录（3540）" : "OpenAlex解析社会学Q1期刊目录（58+1）"));
  }, [useWos, onDataSourceChange]);

  // 检索任务开始：记录开始时间并启动进度条
  useEffect(() => {
    if (runJobId && !runDone) {
      setRunStartTime((t) => t ?? Date.now());
    } else {
      setRunStartTime(null);
      setProgress(runDone ? 100 : 0);
    }
  }, [runJobId, runDone]);

  useEffect(() => {
    if (!runJobId || runDone || runStartTime == null) return;
    const tick = () => {
      const elapsed = (Date.now() - runStartTime) / 1000;
      setProgress(Math.min(95, (elapsed / JOURNAL_SEARCH_ESTIMATED_SEC) * 100));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [runJobId, runDone, runStartTime]);

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

  const getTitle = (j: JournalItem) =>
    toTitleCase(j.display_name || j.name || j.short || j.title || "");

  /** 按搜索框过滤后的期刊列表（标题包含关键词，不区分大小写） */
  const filteredJournals = useMemo(() => {
    const q = journalSearchQuery.trim().toLowerCase();
    if (!q) return journals;
    return journals.filter((j) => getTitle(j).toLowerCase().includes(q));
  }, [journals, journalSearchQuery]);

  /** 按标题 A–Z 排序，并按首字母分组，用于字母索引与快速定位 */
  const { indexLetters, groups } = useMemo(() => {
    const sorted = [...filteredJournals].sort((a, b) =>
      getTitle(a).localeCompare(getTitle(b), "en", { sensitivity: "base" })
    );
    const g = new Map<string, JournalItem[]>();
    for (const j of sorted) {
      const t = getTitle(j);
      const first = (t[0] || "").toUpperCase();
      const key = /[A-Z]/.test(first) ? first : "#";
      if (!g.has(key)) g.set(key, []);
      g.get(key)!.push(j);
    }
    const letters = [...g.keys()].sort((a, b) => (a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b)));
    return { indexLetters: letters, groups: g };
  }, [filteredJournals]);

  const journalListRef = useRef<HTMLDivElement>(null);
  const scrollToLetter = useCallback((letter: string) => {
    const el = document.getElementById(`journal-letter-${letter}`);
    if (el && journalListRef.current) {
      const container = journalListRef.current;
      const y = el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
      container.scrollTo({ top: Math.max(0, y - 4), behavior: "instant" });
    }
  }, []);

  return (
    <div className="space-y-4">
      <h3 className="thu-heading text-xs font-medium uppercase tracking-wider">
        检索范围筛选
      </h3>
      <div className="space-y-3">
        <p className="text-[11px] text-[var(--text-muted)]">期刊数据库 · 学科 / 分区 / 年份 · 主题</p>
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
          <span className="text-sm text-[var(--text-muted)]">数据源</span>
          <select
            value={useWos ? "wos" : "yml"}
            onChange={(e) => {
              const v = e.target.value === "wos";
              setUseWos(v);
              onDataSourceChange?.(DATA_SOURCE_LABELS[v ? "wos" : "yml"]);
            }}
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
        <label className="block">
          <span className="mb-1 block text-[11px] text-[var(--text-muted)]">搜索期刊</span>
          <input
            type="search"
            value={journalSearchQuery}
            onChange={(e) => setJournalSearchQuery(e.target.value)}
            placeholder="输入期刊名称关键词…"
            className="thu-input w-full rounded-lg px-3 py-2 text-sm placeholder:text-[var(--text-muted)]"
            aria-label="按期刊名称搜索"
          />
        </label>
        <div className="space-y-1 text-xs text-[var(--text-muted)]">
          <p className="font-medium text-[var(--text)]">
            {loadingCatalog
              ? "加载期刊列表…"
              : journalSearchQuery.trim()
                ? `共 ${journals.length} 本，匹配 ${filteredJournals.length} 本`
                : `共 ${journals.length} 本期刊（按 A–Z 排序，右侧字母可快速定位）`}
          </p>
          {useWos && !loadingCatalog && (
            <p className="leading-relaxed text-[11px]">
              选学科即得该学科全部期刊。若已添加该学科的 JCR 归一化文件（如 Sociology、Economics），可按分区筛选。
            </p>
          )}
          {!useWos && !loadingCatalog && (
            <p className="leading-relaxed">
              检索时将使用 OpenAlex 解析社会学 Q1 期刊目录
            </p>
          )}
        </div>
        <div className="flex gap-0 rounded-xl border border-[var(--border-soft)] bg-[var(--bg-card)] shadow-thu-soft">
          <div
            ref={journalListRef}
            className="min-h-0 min-w-0 max-h-80 flex-1 overflow-y-auto"
            role="list"
          >
            {indexLetters.length > 0 ? (
              indexLetters.map((letter) => (
                <div key={letter} id={`journal-letter-${letter}`}>
                  <div className="sticky top-0 z-[1] bg-[var(--bg-card)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--thu-purple)] border-b border-[var(--border-soft)]">
                    {letter}
                  </div>
                  <ul className="divide-y divide-[var(--border-soft)]">
                    {(groups.get(letter) ?? []).map((j, i) => (
                      <li
                        key={j.issn || (j as { openalex_source_id?: string }).openalex_source_id || i}
                        className="px-3 py-2 text-sm leading-snug"
                      >
                        <button
                          type="button"
                          onClick={() => setDetailJournal(j)}
                          className="w-full text-left hover:bg-[var(--thu-purple-subtle)] rounded-lg -mx-1 px-1 py-0.5 transition-colors"
                          title="点击查看指标"
                        >
                          <span className="break-words text-[var(--text)]">
                            {displayTitle(j)}
                          </span>
                          {(j.quartile || (!useWos && (j as { has_jcr?: boolean }).has_jcr)) && (
                            <span className="ml-1.5 inline-flex shrink-0 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                              {j.quartile || "JCR"}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            ) : filteredJournals.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-[var(--text-muted)]">
                {journalSearchQuery.trim() ? "无匹配期刊，请调整关键词" : "暂无期刊"}
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border-soft)]">
                {filteredJournals.map((j, i) => (
                  <li
                    key={j.issn || (j as { openalex_source_id?: string }).openalex_source_id || i}
                    className="px-3 py-2 text-sm leading-snug"
                  >
                    <button
                      type="button"
                      onClick={() => setDetailJournal(j)}
                      className="w-full text-left hover:bg-[var(--thu-purple-subtle)] rounded-lg -mx-1 px-1 py-0.5 transition-colors"
                      title="点击查看指标"
                    >
                      <span className="break-words text-[var(--text)]">{displayTitle(j)}</span>
                      {(j.quartile || (!useWos && (j as { has_jcr?: boolean }).has_jcr)) && (
                        <span className="ml-1.5 inline-flex shrink-0 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                          {j.quartile || "JCR"}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {indexLetters.length > 1 && (
            <div
              className="flex max-h-80 w-8 shrink-0 flex-col overflow-y-auto border-l border-[var(--border-soft)] bg-[var(--bg-card)] py-1 pr-1"
              aria-label="按首字母快速定位"
            >
              <div className="grid grid-cols-2 gap-x-0.5 gap-y-0 text-[9px] font-medium leading-tight text-[var(--text-muted)]">
                {indexLetters.map((letter) => (
                  <button
                    key={letter}
                    type="button"
                    onClick={() => scrollToLetter(letter)}
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
        <div className="flex flex-col gap-2 pt-0.5">
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="thu-btn-primary w-full rounded-lg px-3 py-2 text-sm font-medium shadow-thu-soft transition-colors"
          >
            设置主题与年份 · 开始检索
          </button>
        </div>
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
            <div className="mb-1 text-xs font-medium text-[var(--text-muted)]">
              运行日志
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
              检索范围筛选
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

      {detailJournal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ backgroundColor: "var(--overlay)" }}
          onClick={() => setDetailJournal(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="journal-detail-title"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-thu-dialog max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 id="journal-detail-title" className="font-semibold text-[var(--text)] text-base border-b border-[var(--border-soft)] pb-2">
              {displayTitle(detailJournal)}
            </h4>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-[var(--text-muted)] font-medium">ISSN</dt>
                <dd className="text-[var(--text)]">{detailJournal.issn || "—"}</dd>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">印刷版国际标准刊号</p>
              </div>
              <div>
                <dt className="text-[var(--text-muted)] font-medium">eISSN</dt>
                <dd className="text-[var(--text)]">{detailJournal.eissn || "—"}</dd>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">电子版国际标准刊号</p>
              </div>
              {detailJournal.jif != null && detailJournal.jif !== "" && (
                <div>
                  <dt className="text-[var(--text-muted)] font-medium">JIF（期刊影响因子）</dt>
                  <dd className="text-[var(--text)]">{detailJournal.jif}</dd>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Journal Impact Factor，反映期刊近年被引频次与发文量比值</p>
                </div>
              )}
              {detailJournal.jci != null && detailJournal.jci !== "" && (
                <div>
                  <dt className="text-[var(--text-muted)] font-medium">JCI（期刊引证指标）</dt>
                  <dd className="text-[var(--text)]">{detailJournal.jci}</dd>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Journal Citation Indicator，学科归一化影响力指标。数据截至 2026 年 2 月。</p>
                </div>
              )}
              {detailJournal.quartile && (
                <div>
                  <dt className="text-[var(--text-muted)] font-medium">分区</dt>
                  <dd className="text-[var(--text)]">{detailJournal.quartile}</dd>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">JCR 按学科内 JIF 排序划分的 quartile（Q1 为前 25%）</p>
                </div>
              )}
              {detailJournal.oa_citable_pct != null && detailJournal.oa_citable_pct !== "" && (
                <div>
                  <dt className="text-[var(--text-muted)] font-medium">OA 可引用占比（%）</dt>
                  <dd className="text-[var(--text)]">{detailJournal.oa_citable_pct}%</dd>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">开放获取且可被引用的文章占该刊可引用文章的比例</p>
                </div>
              )}
              {detailJournal.total_citations != null && detailJournal.total_citations !== "" && (
                <div>
                  <dt className="text-[var(--text-muted)] font-medium">总被引次数</dt>
                  <dd className="text-[var(--text)]">{detailJournal.total_citations}</dd>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">该刊在 JCR 统计窗口内的总被引次数</p>
                </div>
              )}
              {detailJournal.jcr_abbrev && (
                <div>
                  <dt className="text-[var(--text-muted)] font-medium">JCR 缩写</dt>
                  <dd className="text-[var(--text)] font-mono text-xs">{detailJournal.jcr_abbrev}</dd>
                </div>
              )}
              <div>
                <dt className="text-[var(--text-muted)] font-medium">出版社</dt>
                <dd className="text-[var(--text)]">{detailJournal.publisher || "—"}</dd>
              </div>
            </dl>
            <div className="mt-4 pt-3 border-t border-[var(--border-soft)] flex justify-end">
              <button
                type="button"
                onClick={() => setDetailJournal(null)}
                className="thu-btn-primary rounded-lg px-4 py-2 text-sm font-medium"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
