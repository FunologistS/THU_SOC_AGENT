"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { ReferencesBlock } from "@/components/ReferencesBlock";

/** 匹配文献简报中的一级标题：## 一、... ## 二、... */
const SECTION_HEADING_RE = /^##\s+([一二三四五六七八九十]+)、(.+)$/;

type Section = { id: string; title: string; body: string };

/**
 * 从 intro 中提取第一个围栏代码块（```...```，可在任意位置，前可有标题等）作为摘要，
 * 供摘要块展示：可换行、可一键复制、可一次看到全部内容。
 * 返回 { summaryText, introBefore, introAfter } 或 null（未找到代码块时）。
 */
function extractFirstCodeBlockAsSummary(intro: string): {
  summaryText: string;
  introBefore: string;
  introAfter: string;
} | null {
  const openIdx = intro.indexOf("```");
  if (openIdx === -1) return null;
  const afterOpen = intro.slice(openIdx + 3);
  const firstNewline = afterOpen.indexOf("\n");
  const rest = firstNewline === -1 ? afterOpen : afterOpen.slice(firstNewline + 1);
  const closeIdx = rest.indexOf("```");
  if (closeIdx === -1) return null;
  const inner = rest.slice(0, closeIdx).trim();
  const introBefore = intro.slice(0, openIdx).trim();
  const introAfter = rest.slice(closeIdx + 3).trim();
  return { summaryText: inner, introBefore, introAfter };
}

function parseReportSections(content: string): { intro: string; sections: Section[] } {
  const trimmed = content.trim();
  if (!trimmed) return { intro: "", sections: [] };
  const parts = trimmed.split(/\n(?=##\s+[一二三四五六七八九十]+、)/);
  const intro = (parts[0] ?? "").trim();
  const sections: Section[] = [];
  parts.slice(1).forEach((part, idx) => {
    const firstLine = part.split("\n")[0] ?? "";
    const match = firstLine.match(SECTION_HEADING_RE);
    const title = match ? `${match[1]}、${match[2].trim()}` : firstLine.replace(/^##\s+/, "").trim();
    const body = part.includes("\n") ? part.slice(part.indexOf("\n") + 1).trim() : "";
    sections.push({ id: `section-${idx}`, title, body });
  });
  return { intro, sections };
}

function hasReportSectionHeadings(content: string): boolean {
  return /\n##\s+[一二三四五六七八九十]+、/m.test(content);
}

/**
 * 将 intro 中「主题总览」表格的「主题」列从纯关键词改为「一、章节标题（关键词）」，
 * 以便 themeOverviewCellStyle 将括号内关键词单独一行、小字显示。
 */
function transformThemeOverviewTable(intro: string, sections: Section[]): string {
  if (!sections.length) return intro;
  const lines = intro.split(/\r?\n/);
  let inTable = false;
  let themeColIdx = -1;
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^###\s+主题总览\s*$/.test(line.trim())) {
      result.push(line);
      inTable = false;
      themeColIdx = -1;
      continue;
    }
    if (!line.trim().startsWith("|")) {
      result.push(line);
      if (inTable) inTable = false;
      continue;
    }
    const parts = line.split("|");
    const cells = parts.slice(1, -1).map((c) => c.trim());
    if (!inTable) {
      themeColIdx = cells.findIndex((c) => /主题/.test(c));
      inTable = true;
    }
    if (themeColIdx >= 0 && cells.length > themeColIdx && /^\d+$/.test(cells[0] ?? "")) {
      const rowNum = parseInt(cells[0]!, 10);
      const section = sections[rowNum - 1];
      const keywords = cells[themeColIdx] ?? "";
      if (section && keywords) {
        const newCell = `${section.title}（${keywords}）`;
        const newCells = [...cells];
        newCells[themeColIdx] = newCell;
        result.push("| " + newCells.join(" | ") + " |");
        continue;
      }
    }
    result.push(line);
  }
  return result.join("\n");
}

/** 一键综述顶部的摘要块：可换行、可一键复制，不再用代码块展示 */
function ReviewSummaryBlock({ summaryText }: { summaryText: string }) {
  const [copied, setCopied] = useState(false);
  const copySummary = useCallback(() => {
    navigator.clipboard.writeText(summaryText).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => {}
    );
  }, [summaryText]);
  return (
    <div className="mb-8 rounded-lg border border-[var(--border-soft)] bg-[var(--bg-card)] p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-medium text-[var(--text-muted)]">摘要</span>
        <button
          type="button"
          onClick={copySummary}
          className="shrink-0 rounded px-2 py-1 text-xs font-medium text-[var(--thu-purple)] hover:bg-[var(--thu-purple-subtle)] transition-colors"
        >
          {copied ? "已复制" : "一键复制"}
        </button>
      </div>
      <p className="text-sm text-[var(--text)] whitespace-pre-wrap break-words leading-relaxed m-0">
        {summaryText}
      </p>
    </div>
  );
}

export function ReportWithTOC({
  content,
  citationLinkTopic,
  topic,
  scrollContainerRef,
  scrollContainer,
  emptyPlaceholder,
}: {
  content: string;
  citationLinkTopic?: string;
  topic: string;
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  /** 滚动容器 DOM，由父组件通过 ref 回调传入，确保挂载后能正确绑定 scroll 监听 */
  scrollContainer?: HTMLElement | null;
  emptyPlaceholder?: string;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showBackTop, setShowBackTop] = useState(false);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const TOC_WIDTH_MIN = 120;
  const TOC_WIDTH_MAX = 420;
  const TOC_WIDTH_DEFAULT = 152;
  const [tocWidth, setTocWidth] = useState(TOC_WIDTH_DEFAULT);
  const [isDraggingToc, setIsDraggingToc] = useState(false);

  const [isLg, setIsLg] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const fn = () => setIsLg(mql.matches);
    fn();
    mql.addEventListener("change", fn);
    return () => mql.removeEventListener("change", fn);
  }, []);

  useEffect(() => {
    if (!isDraggingToc) return;
    const onMove = (e: MouseEvent) => {
      const w = window.innerWidth - e.clientX;
      setTocWidth(Math.min(TOC_WIDTH_MAX, Math.max(TOC_WIDTH_MIN, w)));
    };
    const onUp = () => setIsDraggingToc(false);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isDraggingToc]);

  const { intro, sections } = parseReportSections(content);
  const visibleSectionsForToc = sections.filter((sec) => sec.body.trim().length > 0);

  const setSectionRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) sectionRefs.current.set(id, el);
    else sectionRefs.current.delete(id);
  }, []);

  const updateActiveIdFromScroll = useCallback(() => {
    const el = scrollContainer ?? scrollContainerRef.current;
    if (!el) return;
    setShowBackTop(el.scrollTop > 400);
    const scrollTop = el.scrollTop;
    const viewOffset = 100;
    const containerRect = el.getBoundingClientRect();
    const entries = Array.from(sectionRefs.current.entries());
    let current: string | null = entries.length ? entries[0]![0] : null;
    for (let i = 0; i < entries.length; i++) {
      const [id, sectionEl] = entries[i]!;
      const sectionTop =
        scrollTop + sectionEl.getBoundingClientRect().top - containerRect.top;
      if (sectionTop <= scrollTop + viewOffset) current = id;
    }
    setActiveId(current);
  }, [scrollContainer]);

  useEffect(() => {
    const el = scrollContainer ?? scrollContainerRef.current;
    if (!el || visibleSectionsForToc.length === 0) return;
    const onScroll = () => {
      requestAnimationFrame(updateActiveIdFromScroll);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    requestAnimationFrame(updateActiveIdFromScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollContainer, updateActiveIdFromScroll, visibleSectionsForToc.length]);

  const scrollToSection = useCallback(
    (id: string) => {
      const sectionEl = sectionRefs.current.get(id);
      const container = scrollContainerRef.current;
      if (sectionEl && container) {
        const sectionTop =
          container.scrollTop +
          sectionEl.getBoundingClientRect().top -
          container.getBoundingClientRect().top;
        container.scrollTo({ top: Math.max(0, sectionTop - 8), behavior: "smooth" });
      }
    },
    [scrollContainerRef]
  );

  const scrollToTop = useCallback(() => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [scrollContainerRef]);

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  if (!content.trim()) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        {emptyPlaceholder ?? "该文件尚未生成或已被删除；请从左侧选择其他阶段文件，或先运行对应管线步骤。"}
      </p>
    );
  }

  if (!hasReportSectionHeadings(content)) {
    const extracted = extractFirstCodeBlockAsSummary(content);
    if (extracted) {
      return (
        <>
          {extracted.introBefore ? (
            <div className="prose-reader mb-4">
              <MarkdownPreview
                content={extracted.introBefore}
                citationLinkTopic={citationLinkTopic}
                emptyPlaceholder=""
              />
            </div>
          ) : null}
          <ReviewSummaryBlock summaryText={extracted.summaryText} />
          {extracted.introAfter ? (
            <div className="prose-reader mt-4">
              <MarkdownPreview
                content={extracted.introAfter}
                citationLinkTopic={citationLinkTopic}
                emptyPlaceholder={emptyPlaceholder}
              />
            </div>
          ) : null}
          <ReferencesBlock topic={topic} />
        </>
      );
    }
    return (
      <>
        <MarkdownPreview
          content={content}
          citationLinkTopic={citationLinkTopic}
          emptyPlaceholder={emptyPlaceholder}
        />
        <ReferencesBlock topic={topic} />
      </>
    );
  }

  const extractedIntro = intro ? extractFirstCodeBlockAsSummary(intro) : null;
  const visibleSections = sections.filter((sec) => sec.body.trim().length > 0);
  const introForDisplay = transformThemeOverviewTable(
    extractedIntro ? (extractedIntro.introBefore + (extractedIntro.introAfter ? "\n\n" + extractedIntro.introAfter : "")).trim() : intro,
    sections
  );
  const introBeforeTransformed = extractedIntro ? transformThemeOverviewTable(extractedIntro.introBefore, sections) : introForDisplay;
  const introAfterTransformed = extractedIntro && extractedIntro.introAfter ? transformThemeOverviewTable(extractedIntro.introAfter, sections) : "";

  return (
    <div className="flex gap-0">
      <div className="min-w-0 flex-1">
        {extractedIntro ? (
          <>
            {extractedIntro.introBefore ? (
              <div className="prose-reader mb-4">
                <MarkdownPreview
                  content={introBeforeTransformed}
                  citationLinkTopic={citationLinkTopic}
                  emptyPlaceholder=""
                  themeOverviewCellStyle
                />
              </div>
            ) : null}
            <ReviewSummaryBlock summaryText={extractedIntro.summaryText} />
            {extractedIntro.introAfter ? (
              <div className="prose-reader mt-4 mb-8">
                <MarkdownPreview
                  content={introAfterTransformed}
                  citationLinkTopic={citationLinkTopic}
                  emptyPlaceholder=""
                  themeOverviewCellStyle
                />
              </div>
            ) : null}
          </>
        ) : intro ? (
          <div className="prose-reader mb-8">
            <MarkdownPreview
              content={introForDisplay}
              citationLinkTopic={citationLinkTopic}
              emptyPlaceholder=""
              themeOverviewCellStyle
            />
          </div>
        ) : null}
        {visibleSections.map((sec) => (
          <section
            key={sec.id}
            id={sec.id}
            ref={(el) => setSectionRef(sec.id, el)}
            className="report-section border-b border-[var(--border-soft)] last:border-b-0 last:pb-0 pb-6 mb-6 last:mb-0"
          >
            <button
              type="button"
              onClick={() => toggleCollapse(sec.id)}
              className="report-section-heading flex w-full items-center gap-2 rounded-lg py-2 pr-2 -ml-1 text-left text-base font-semibold text-[var(--text)] hover:bg-[var(--thu-purple-subtle)] transition-colors"
              aria-expanded={!collapsed[sec.id]}
            >
              <span
                className="shrink-0 transition-transform"
                style={{ transform: collapsed[sec.id] ? "rotate(-90deg)" : "rotate(0deg)" }}
                aria-hidden
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
              <span className="min-w-0 truncate">{sec.title}</span>
            </button>
            {!collapsed[sec.id] && (
              <div className="report-section-body mt-2 pl-6">
                <MarkdownPreview content={sec.body} citationLinkTopic={citationLinkTopic} emptyPlaceholder="" />
              </div>
            )}
          </section>
        ))}
        <ReferencesBlock topic={topic} />
      </div>
      <aside
        className="report-toc hidden flex-col overflow-y-auto overflow-x-hidden border-l border-[var(--border-soft)] bg-[var(--bg-card)]/95 backdrop-blur-sm py-3 lg:flex flex-shrink-0 relative"
        aria-label="目录"
        style={{
          width: tocWidth,
          minWidth: tocWidth,
          maxHeight: "calc(100vh - 5rem)",
          position: "relative",
        }}
      >
        <button
          type="button"
          aria-label="拖动调整目录宽度"
          className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[var(--thu-purple)]/20 active:bg-[var(--thu-purple)]/30 transition-colors z-10"
          style={{ transform: "translateX(-50%)" }}
          onMouseDown={(e) => { e.preventDefault(); setIsDraggingToc(true); }}
        />
        <div className="pl-4 pr-3 pt-0 pb-0">
        <p className="mb-2 text-xs font-medium text-[var(--text-muted)]">目录</p>
        <nav className="space-y-0.5">
          {visibleSections.map((sec) => (
            <button
              key={sec.id}
              type="button"
              onClick={() => scrollToSection(sec.id)}
              className={`block w-full rounded px-2 py-1.5 text-left text-xs transition-colors break-words min-w-0 ${
                activeId === sec.id
                  ? "bg-[var(--thu-purple-subtle)] text-[var(--thu-purple)] font-medium"
                  : "text-[var(--text-muted)] hover:bg-[var(--border-soft)] hover:text-[var(--text)]"
              }`}
            >
              {sec.title}
            </button>
          ))}
        </nav>
        <div className="mt-4 pt-4 border-t border-[var(--border-soft)]">
          <button
            type="button"
            onClick={scrollToTop}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--thu-purple-subtle)] hover:text-[var(--thu-purple)] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="18 15 12 9 6 15" />
            </svg>
            回到顶部
          </button>
        </div>
        </div>
      </aside>
      {showBackTop && (
        <button
          type="button"
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 z-30 flex lg:hidden items-center justify-center w-10 h-10 rounded-full bg-[var(--thu-purple)] text-white shadow-thu-soft hover:bg-[var(--thu-purple-dark)] transition-colors"
          aria-label="回到顶部"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
      )}
    </div>
  );
}
