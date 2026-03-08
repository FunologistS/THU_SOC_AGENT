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

/** 二级标题：**（一）...** **（二）...** **（三）研究方法**，用于拆分为可折叠块（标题末尾可有可无第二个括号） */
const SUB_SECTION_HEADING_RE = /^\*\*（[一二三四五六七八九十]+）[^*]*\*\*$/;

function parseSubSections(body: string): { title: string; body: string }[] {
  const trimmed = body.trim();
  if (!trimmed) return [];
  const parts = trimmed.split(/\n(?=\*\*（[一二三四五六七八九十]+）)/);
  const result: { title: string; body: string }[] = [];
  for (const part of parts) {
    const lineEnd = part.indexOf("\n");
    const firstLine = lineEnd === -1 ? part : part.slice(0, lineEnd);
    const rest = lineEnd === -1 ? "" : part.slice(lineEnd + 1).trim();
    const isSubHeading = SUB_SECTION_HEADING_RE.test(firstLine);
    if (isSubHeading) {
      const title = firstLine.replace(/\*\*/g, "").trim();
      result.push({ title, body: rest });
    } else if (part.trim()) {
      result.push({ title: firstLine.replace(/\*\*/g, "").trim(), body: rest });
    }
  }
  return result;
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

/** 文献简报/一键综述正文渲染（无右侧目录）。保留摘要块、主题总览、章节、参考文献。 */
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
  scrollContainer?: HTMLElement | null;
  emptyPlaceholder?: string;
}) {
  const [showBackTop, setShowBackTop] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const updateShowBackTop = useCallback(() => {
    const el = scrollContainer ?? scrollContainerRef.current;
    if (!el) return;
    setShowBackTop(el.scrollTop > 400);
  }, [scrollContainer, scrollContainerRef]);

  useEffect(() => {
    const el = scrollContainer ?? scrollContainerRef.current;
    if (!el) return;
    const onScroll = () => requestAnimationFrame(updateShowBackTop);
    el.addEventListener("scroll", onScroll, { passive: true });
    requestAnimationFrame(updateShowBackTop);
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollContainer, scrollContainerRef, updateShowBackTop]);

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

  const { intro, sections } = parseReportSections(content);
  const extractedIntro = intro ? extractFirstCodeBlockAsSummary(intro) : null;
  const visibleSections = sections.filter((sec) => sec.body.trim().length > 0);
  const introForDisplay = transformThemeOverviewTable(
    extractedIntro ? (extractedIntro.introBefore + (extractedIntro.introAfter ? "\n\n" + extractedIntro.introAfter : "")).trim() : intro,
    sections
  );
  const introBeforeTransformed = extractedIntro ? transformThemeOverviewTable(extractedIntro.introBefore, sections) : introForDisplay;
  const introAfterTransformed = extractedIntro && extractedIntro.introAfter ? transformThemeOverviewTable(extractedIntro.introAfter, sections) : "";

  return (
    <>
      <div className="min-w-0">
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
                {(() => {
                  const hasSubHeadings = /\*\*（[一二三四五六七八九十]+）/.test(sec.body);
                  if (!hasSubHeadings) {
                    return <MarkdownPreview content={sec.body} citationLinkTopic={citationLinkTopic} emptyPlaceholder="" />;
                  }
                  const subs = parseSubSections(sec.body);
                  if (subs.length === 0) {
                    return <MarkdownPreview content={sec.body} citationLinkTopic={citationLinkTopic} emptyPlaceholder="" />;
                  }
                  return subs.map((sub, i) => {
                    const subId = `${sec.id}-sub-${i}`;
                    return (
                      <div key={subId} className="report-subsection mb-4 last:mb-0">
                        <button
                          type="button"
                          onClick={() => toggleCollapse(subId)}
                          className="report-section-heading flex w-full items-center gap-2 rounded-lg py-1.5 pr-2 -ml-1 text-left text-sm font-semibold text-[var(--text)] hover:bg-[var(--thu-purple-subtle)] transition-colors"
                          aria-expanded={!collapsed[subId]}
                        >
                          <span
                            className="shrink-0 transition-transform"
                            style={{ transform: collapsed[subId] ? "rotate(-90deg)" : "rotate(0deg)" }}
                            aria-hidden
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                          </span>
                          <span className="min-w-0 truncate">{sub.title}</span>
                        </button>
                        {!collapsed[subId] && sub.body ? (
                          <div className="report-subsection-body mt-1 pl-5 text-sm">
                            <MarkdownPreview content={sub.body} citationLinkTopic={citationLinkTopic} emptyPlaceholder="" />
                          </div>
                        ) : null}
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </section>
        ))}
        <ReferencesBlock topic={topic} />
      </div>
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
    </>
  );
}
