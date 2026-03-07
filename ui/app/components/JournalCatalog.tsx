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
  wos: "Social Sciences Citation Index (SSCI)",
  yml: "OpenAlex解析期刊目录（社会学/人类学/经济学 Q1）",
};

/** 有 JCR 归一化数据的学科才显示「分区」筛选项；默认与 API 返回的 quartileDisciplines 一致 */
const DEFAULT_QUARTILE_DISCIPLINES = ["Sociology", "Anthropology", "Economics"];

/** 年份下拉：2026 在上，便于从最新文献选起 */
const YEAR_OPTIONS = Array.from({ length: 2026 - 1900 + 1 }, (_, i) => 2026 - i);

const SEARCH_TYPE_TOOLTIP =
  "严格检索：摘要与关键词都包含检索词才保留。宽松检索：标题、摘要或关键词任一包含即可。";

/** 是否包含非英文字符（仅允许英文字母、数字、空格、下划线、连字符） */
function hasNonEnglish(s: string): boolean {
  if (!s.trim()) return false;
  return /[^a-zA-Z0-9\s_\-]/.test(s);
}

export function JournalCatalog({
  onStartSearch,
  runJobId,
  runLog,
  runDone,
  runExitCode,
  onDataSourceChange,
  hideTitle,
  /** database = 仅查看与搜索期刊，不展示「开始检索」；search = 完整流程（当前默认） */
  mode = "search",
}: {
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
  /** 数据源切换时回调，用于在技能工作台显示当前数据源提示 */
  onDataSourceChange?: (label: string) => void;
  /** 为侧栏折叠时由父级统一渲染标题，隐藏组件内标题 */
  hideTitle?: boolean;
  mode?: "database" | "search";
}) {
  const [journals, setJournals] = useState<JournalItem[]>([]);
  const [disciplines, setDisciplines] = useState<string[]>([]);
  const [quartileDisciplines, setQuartileDisciplines] = useState<string[]>(DEFAULT_QUARTILE_DISCIPLINES);
  const [publishers, setPublishers] = useState<string[]>([]);
  const [discipline, setDiscipline] = useState("");
  const [quartile, setQuartile] = useState("");
  const [publisher, setPublisher] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [baseTerm, setBaseTerm] = useState("");
  const [extraTerms, setExtraTerms] = useState<{ logic: "and" | "or"; term: string }[]>([]);
  const [extraInput, setExtraInput] = useState("");
  const [nextLogic, setNextLogic] = useState<"and" | "or">("or");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [running, setRunning] = useState(false);
  const [useWos, setUseWos] = useState(true);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [detailJournal, setDetailJournal] = useState<JournalItem | null>(null);
  const [journalSearchQuery, setJournalSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<"strict" | "relaxed">("strict");
  const [abstractFallback, setAbstractFallback] = useState(false);
  const [searchTypeTooltipVisible, setSearchTypeTooltipVisible] = useState(false);
  const [multiCategoryExpanded, setMultiCategoryExpanded] = useState(false);
  const fetchingRef = useRef(false);
  const [runStartTime, setRunStartTime] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const JOURNAL_SEARCH_ESTIMATED_SEC = 180;
  /** 已解析学科（references/sources 有对应 YAML），选这些学科时用 journals-by-discipline 完整呈现 */
  const [parsedDisciplines, setParsedDisciplines] = useState<string[]>([]);

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
        if (Array.isArray(d.quartileDisciplines)) setQuartileDisciplines(d.quartileDisciplines);
        if (d.publishers) setPublishers(d.publishers);
      })
      .catch(() => { if (fetchingRef.current) setJournals([]); })
      .finally(() => {
        fetchingRef.current = false;
        setLoadingCatalog(false);
      });
  }, [discipline, quartile, publisher]);

  /** 已解析学科：从 journals.yml 按学科返回完整期刊（含 OpenAlex、JCR 等） */
  const fetchParsedDiscipline = useCallback(() => {
    if (!discipline) return;
    const params = new URLSearchParams();
    params.set("disciplines", discipline);
    if (quartile) params.set("quartile", quartile);
    params.set("enrich", "jcr");
    fetchingRef.current = true;
    setLoadingCatalog(true);
    fetch(`/api/journals-by-discipline?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (!fetchingRef.current) return;
        const list = (d.journals || []).map((j: Record<string, unknown>) => ({
          title: (j.name ?? j.title) ?? "",
          name: (j.name ?? j.title) ?? "",
          issn: (j.issn ?? "") as string,
          eissn: (j.eissn ?? "") as string,
          publisher: (j.publisher ?? "") as string,
          categories: j.categories as string[] | undefined,
          quartile: j.quartile as string | undefined,
          jif: j.jif as string | undefined,
          jci: j.jci as string | undefined,
          oa_citable_pct: j.oa_citable_pct as string | undefined,
          total_citations: j.total_citations as string | undefined,
          jcr_abbrev: j.jcr_abbrev as string | undefined,
          openalex_source_id: j.openalex_source_id as string | undefined,
        }));
        setJournals(list);
      })
      .catch(() => { if (fetchingRef.current) setJournals([]); })
      .finally(() => {
        fetchingRef.current = false;
        setLoadingCatalog(false);
      });
  }, [discipline, quartile]);

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

  /** 挂载时拉取已解析学科列表：期刊数据库不用；新增检索仅展示这些学科，且仅用其做检索 */
  useEffect(() => {
    fetch("/api/journals-by-discipline")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.disciplines)) {
          setParsedDisciplines(d.disciplines);
          if (mode === "search") {
            setDisciplines(d.disciplines);
            setQuartileDisciplines(d.disciplines);
          }
        }
      })
      .catch(() => {});
  }, [mode]);

  /** 学科名规范化后比较（与 API 一致：and 去掉、Women's Studies ↔ Women Studies），使 WOS 下拉选中时也走解析学科接口 */
  const isParsedDiscipline = useMemo(() => {
    if (!discipline) return false;
    const n = (s: string) =>
      s
        .replace(/\s+and\s+/gi, " ")
        .replace(/\s+/g, " ")
        .replace(/women'?s?\s*studies/i, "Women Studies")
        .trim();
    return parsedDisciplines.some((p) => n(p) === n(discipline));
  }, [discipline, parsedDisciplines]);

  // 期刊数据库：无学科时用 journals-wos 全量；选了学科则始终先请求 journals-by-discipline（API 会做 WOS 名↔本地名规范化），不依赖 parsedDisciplines 是否已加载。
  // 新增检索：有学科即用 journals-by-discipline。
  useEffect(() => {
    if (mode === "database") {
      if (discipline) fetchParsedDiscipline();
      else fetchWos();
    } else if (mode === "search") {
      if (discipline) fetchParsedDiscipline();
      else {
        setJournals([]);
        setPublishers([]);
        setLoadingCatalog(false);
      }
    } else if (useWos) fetchWos();
    else fetchYml();
  }, [mode, useWos, discipline, quartile, publisher, fetchWos, fetchParsedDiscipline, fetchYml]);

  useEffect(() => {
    if (mode === "database") return;
    onDataSourceChange?.(DATA_SOURCE_LABELS.wos ?? "");
  }, [mode, onDataSourceChange]);

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
    const terms = baseTerm.trim()
      ? [baseTerm.trim(), ...extraTerms.map((e) => e.term.trim())].filter(Boolean)
      : [];
    const slug = terms.length > 0 ? toSlug(terms[0]) : "digital_labor";
    const from = yearFrom ? parseInt(yearFrom, 10) : undefined;
    const to = yearTo ? parseInt(yearTo, 10) : undefined;
    const logics = extraTerms.map((e) => e.logic);
    const payload = {
      topicSlug: slug,
      yearFrom: from && !Number.isNaN(from) ? from : undefined,
      yearTo: to && !Number.isNaN(to) ? to : undefined,
      journalSourceIds: [] as string[],
      journalIssns: undefined as string[] | undefined,
      searchMode,
      searchTerms: terms.length > 0 ? terms : undefined,
      searchLogics: logics.length > 0 ? logics : undefined,
      abstractFallback,
    };

    // 期刊数据库与新增检索统一用 WOS SSCI，检索时传当前列表的 ISSN
    if ((useWos || mode === "search") && journals.length > 0) {
      payload.journalIssns = Array.from(
        new Set(journals.map((j) => [j.issn, j.eissn].filter(Boolean)).flat().filter(Boolean) as string[])
      );
    } else if (!useWos && journals.length > 0) {
      payload.journalSourceIds = journals
        .map((j) => (j as { openalex_source_id?: string }).openalex_source_id)
        .filter(Boolean) as string[];
    }

    setRunning(true);
    setDialogOpen(false);
    onStartSearch(payload);
    setBaseTerm("");
    setExtraTerms([]);
    setExtraInput("");
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

  /** 同时属于多个 WOS 学科的期刊（仅 yml 数据源有 categories） */
  const multiCategoryJournals = useMemo(
    () => journals.filter((j) => Array.isArray(j.categories) && j.categories.length > 1),
    [journals]
  );

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
    const letters = Array.from(g.keys()).sort((a, b) => (a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b)));
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

  const showSsciDisclaimer = mode === "database" || useWos;

  return (
    <div className="space-y-4">
      {!hideTitle && (
        <h3 className="thu-heading text-xs font-medium uppercase tracking-wider">
          {mode === "database" ? "期刊数据库" : "新增检索"}
        </h3>
      )}
      {showSsciDisclaimer && (
        <p className="text-[11px] text-[var(--text-muted)]">
          期刊数据库与新增检索均仅显示 SSCI 期刊，数据来源：Social Sciences Citation Index (SSCI)，数据截止时间：2026年2月16日。
        </p>
      )}
      <div className="space-y-3">
        <p className="text-[11px] text-[var(--text-muted)]">
          {mode === "database" ? "学科 / 分区 / 出版社 · 搜索期刊" : "学科 / 分区 / 年份 · 主题（与期刊数据库同一 SSCI 数据源）"}
        </p>
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
          {(useWos || mode === "database" || mode === "search") && (
            <>
              <span className="text-sm text-[var(--text-muted)]">学科</span>
              <select
                value={discipline}
                onChange={(e) => {
                  const next = e.target.value;
                  setDiscipline(next);
                  if (!quartileDisciplines.includes(next)) setQuartile("");
                }}
                className="thu-input w-full rounded-lg px-3 py-2 text-sm"
              >
                <option value="">全部</option>
                {disciplines.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              {quartileDisciplines.includes(discipline) && (
                <>
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
              选学科即得该学科全部期刊。有 JCR 归一化数据的学科（如 Sociology、Economics、Communication、Urban Studies 等）支持按分区筛选。
            </p>
          )}
          {!useWos && !loadingCatalog && (
            <p className="leading-relaxed">
              检索时将使用 OpenAlex 解析社会学 Q1 期刊目录
            </p>
          )}
        </div>
        {!useWos && !loadingCatalog && multiCategoryJournals.length > 0 && (
          <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--bg-card)] shadow-thu-soft overflow-hidden">
            <button
              type="button"
              onClick={() => setMultiCategoryExpanded((e) => !e)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium text-[var(--text)] hover:bg-[var(--thu-purple-subtle)] transition-colors"
              aria-expanded={multiCategoryExpanded}
            >
              <span>多学科期刊（同时属于多个 WOS 学科）</span>
              <span className="text-[var(--text-muted)] font-normal">
                {multiCategoryJournals.length} 本
              </span>
              <svg
                className={`h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform ${multiCategoryExpanded ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {multiCategoryExpanded && (
              <ul className="border-t border-[var(--border-soft)] divide-y divide-[var(--border-soft)] max-h-48 overflow-y-auto">
                {multiCategoryJournals.map((j, i) => (
                  <li key={j.issn || (j as { openalex_source_id?: string }).openalex_source_id || i} className="px-3 py-2 text-sm">
                    <button
                      type="button"
                      onClick={() => setDetailJournal(j)}
                      className="w-full text-left hover:bg-[var(--thu-purple-subtle)] rounded-lg -mx-1 px-1 py-0.5 transition-colors"
                    >
                      <span className="text-[var(--text)]">{displayTitle(j)}</span>
                      <span className="ml-2 inline-flex flex-wrap gap-1">
                        {(j.categories ?? []).map((c) => (
                          <span
                            key={c}
                            className="inline-flex items-center rounded bg-[var(--thu-purple-subtle)] text-[10px] font-medium text-[var(--thu-purple)] px-1.5 py-0.5"
                          >
                            {c}
                          </span>
                        ))}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
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
                          <span className="ml-1.5 inline-flex shrink-0 items-center gap-1">
                            {(j.quartile || (!useWos && (j as { has_jcr?: boolean }).has_jcr)) && (
                              <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                                {j.quartile || "JCR"}
                              </span>
                            )}
                            {!useWos && j.categories && j.categories.length > 1 && (
                              <span className="text-[10px] font-medium text-[var(--thu-purple)]" title={j.categories.join(", ")}>
                                多学科
                              </span>
                            )}
                          </span>
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
                      <span className="ml-1.5 inline-flex shrink-0 items-center gap-1">
                        {(j.quartile || (!useWos && (j as { has_jcr?: boolean }).has_jcr)) && (
                          <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                            {j.quartile || "JCR"}
                          </span>
                        )}
                        {!useWos && j.categories && j.categories.length > 1 && (
                          <span className="text-[10px] font-medium text-[var(--thu-purple)]" title={j.categories.join(", ")}>
                            多学科
                          </span>
                        )}
                      </span>
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
        {mode === "search" && (
          <div className="flex flex-col gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="thu-btn-primary w-full rounded-lg px-3 py-2 text-sm font-medium shadow-thu-soft transition-colors"
            >
              设置主题与年份 · 开始检索
            </button>
          </div>
        )}
        {mode === "search" && runJobId && (
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

      {mode === "search" && dialogOpen && (
        <div
          className="thu-modal-overlay fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={() => !running && setDialogOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="dialog-title"
        >
          <div
            className="thu-modal-card relative w-full max-w-lg p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" onClick={() => !running && setDialogOpen(false)} className="thu-modal-close absolute right-4 top-4 p-1" aria-label="关闭">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h4 id="dialog-title" className="thu-modal-title text-lg pr-8">
              新增检索
            </h4>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {journals.length > 0
                ? `当前筛选共 ${journals.length} 本期刊，可填写主题与年份范围后开始检索。`
                : "未选定期刊时将使用全部已解析期刊进行检索。"}
            </p>
            <div className="mt-4 space-y-3">
              <p className="text-[11px] text-[var(--text-muted)]">仅支持英文检索</p>
              <label className="block">
                <span className="text-xs text-[var(--text-muted)]">主要检索词</span>
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
                <span className="text-xs text-[var(--text-muted)]">添加检索词</span>
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
                    placeholder="输入后选逻辑并添加"
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
                    className="thu-modal-btn-secondary shrink-0 rounded-lg px-2.5 py-1.5 text-sm"
                  >
                    添加
                  </button>
                </div>
                {(extraInput.trim() && hasNonEnglish(extraInput)) || extraTerms.some((e) => hasNonEnglish(e.term)) ? (
                  <p className="mt-0.5 text-[11px] text-[var(--accent)]">请输入英文，单词间下划线和空格等价。</p>
                ) : null}
                {extraTerms.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-[var(--text-muted)]">已添加：</span>
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
                  <span className="text-xs text-[var(--text-muted)]">检索类型</span>
                  <span
                    className="relative inline-flex h-[1em] w-[1em] cursor-help items-center justify-center rounded-full border border-current text-xs"
                    onMouseEnter={() => setSearchTypeTooltipVisible(true)}
                    onMouseLeave={() => setSearchTypeTooltipVisible(false)}
                    aria-label="检索类型说明"
                  >
                    <span className="opacity-70">ⓘ</span>
                    {searchTypeTooltipVisible && (
                      <span
                        className="absolute bottom-full left-0 z-50 mb-1 w-56 rounded-lg border border-gray-200 px-2.5 py-2 text-xs leading-snug shadow-lg"
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
                  <span className="text-xs text-[var(--text-muted)]">年份起</span>
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
                  <span className="text-xs text-[var(--text-muted)]">年份止</span>
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
              <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--bg-card)] px-3 py-2 text-sm transition-colors has-[:checked]:border-[var(--thu-purple)] has-[:checked]:bg-[var(--thu-purple-subtle)]">
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
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                className="thu-modal-btn-secondary rounded-lg px-3 py-2 text-sm"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleStartSearch}
                disabled={running || (!baseTerm.trim() && extraTerms.length === 0)}
                className="thu-modal-btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                开始检索
              </button>
            </div>
          </div>
        </div>
      )}

      {detailJournal && (
        <div
          className="thu-modal-overlay fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={() => setDetailJournal(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="journal-detail-title"
        >
          <div
            className="thu-modal-card relative w-full max-w-md p-5 max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" onClick={() => setDetailJournal(null)} className="thu-modal-close absolute right-4 top-4 z-10 p-1 shrink-0" aria-label="关闭">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h4 id="journal-detail-title" className="thu-modal-title text-base border-b border-[var(--border-soft)] pb-2 pr-8 shrink-0">
              {displayTitle(detailJournal)}
            </h4>
            <div className="flex-1 min-h-0 overflow-y-auto mt-3">
            <dl className="space-y-2 text-sm">
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
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Journal Citation Indicator，学科归一化影响力指标。Journal Citation Reports 数据库最后更新截至 2025 年 10 月 15 日。</p>
                </div>
              )}
              {(detailJournal.quartile || (detailJournal.categories?.length ?? 0) > 0) && (
                <div>
                  <dt className="text-[var(--text-muted)] font-medium">分区</dt>
                  <dd className="text-[var(--text)]">
                    {detailJournal.categories?.some((c) => / Q[1-4]$/i.test(c)) ? (
                      <span className="text-[11px] text-[var(--text-muted)]">各学科分区见下方「所属学科」</span>
                    ) : (
                      detailJournal.quartile
                    )}
                  </dd>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">JCR 按学科内 JIF 排序划分的 quartile（理论上Q1 为前 25%，但实际上影响因子相近的期刊可能会被归入相同分区，造成不同分区的期刊数量并非严格四等分）；多学科时各学科分区可能不同</p>
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
              {detailJournal.categories && detailJournal.categories.length > 0 && (
                <div>
                  <dt className="text-[var(--text-muted)] font-medium">所属学科（WOS 来源）</dt>
                  <dd className="text-[var(--text)] flex flex-wrap gap-1.5 mt-0.5">
                    {detailJournal.categories.map((c) => (
                      <span
                        key={c}
                        className="inline-flex items-center rounded bg-[var(--thu-purple-subtle)] text-xs font-medium text-[var(--thu-purple)] px-2 py-0.5"
                      >
                        {c}
                      </span>
                    ))}
                    {detailJournal.categories.length > 1 && (
                      <span className="text-[11px] text-[var(--text-muted)] self-center">多学科</span>
                    )}
                  </dd>
                </div>
              )}
            </dl>
            </div>
            <div className="mt-4 pt-3 border-t border-[var(--border-soft)] flex justify-end shrink-0">
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
