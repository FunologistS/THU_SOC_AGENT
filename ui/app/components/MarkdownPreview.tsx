"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * 若内容以围栏代码块开头（``` 任意语言或无语言），则取出第一块内部文字并按段落渲染，
 * 避免整段被渲染成 <pre> 导致不能换行、难以复制。也支持 ```markdown/```md 整段包裹。
 */
function unwrapMarkdownCodeBlock(raw: string): string {
  const t = raw.trim();
  if (!t.startsWith("```")) return raw;
  const firstLineEnd = t.indexOf("\n");
  const rest = firstLineEnd === -1 ? "" : t.slice(firstLineEnd + 1);
  const closeIdx = rest.indexOf("```");
  if (closeIdx === -1) return raw;
  const inner = rest.slice(0, closeIdx).trim();
  const after = rest.slice(closeIdx + 3).trim();
  return after ? `${inner}\n\n${after}` : inner || raw;
}

/** 去掉链接外的多余括号，避免“（[(Padovani & Pavan, 2016)](#paper-1)）”这种双层括号，只保留链接本身 */
function stripOuterParensAroundLinks(content: string): string {
  return content.replace(
    /[（(]\s*(\[[^\]]+\]\(#paper-\d+\))\s*[）)]/g,
    (_, link) => link
  );
}

/** 使「（一）该主题的主要内容 1、」中「1、」另起一行显示：括号后若紧跟数字+、则前插换行；并保证「**（三）研究方法**」与「1、」之间有空行（避免 Markdown 单换行被合并成一段） */
function ensureLineBreakBeforeNumberedItem(content: string): string {
  let out = content.replace(/）\s*(\d+)、/g, "）\n\n$1、");
  out = out.replace(/(\*\*|）)\n(\d+)、/g, "$1\n\n$2、");
  return out;
}

/** 去掉小标题/表头后残留的提示语（如 2-4句话、必须覆盖所有论文 等），展示更简洁。适用于文献简报(05_report)、一键综述(06_review)及所有经本组件渲染的 Markdown。 */
function stripHeadingHintParens(content: string): string {
  return content
    .replace(/（2-4句话）/g, "")
    .replace(/（2-5个要点）/g, "")
    .replace(/（2-4个要点）/g, "")
    .replace(/（必须覆盖所有论文；用表格；使用文内引用）/g, "")
    .replace(/（必须覆盖所有论文；按年份降序；用表格）/g, "")
    .replace(/（必须覆盖所有论文；用表格）/g, "")
    .replace(/（基于卡片中的[^）]+2-4个要点）/g, "");
}

/** 从 Markdown 表格中移除 OpenAlex 列，节省空间给期刊名和作者；表头含 OpenAlex 时生效。 */
function removeOpenAlexColumnFromTables(content: string): string {
  const lines = content.split(/\r?\n/);
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim().startsWith("|")) {
      out.push(line);
      i++;
      continue;
    }
    const tableStart = i;
    const tableLines: string[] = [];
    while (i < lines.length && lines[i]!.trim().startsWith("|")) {
      tableLines.push(lines[i]!);
      i++;
    }
    if (tableLines.length < 2) {
      out.push(...tableLines);
      continue;
    }
    const parseRow = (row: string): string[] => {
      const parts = row.split("|").map((s) => s.trim());
      if (parts[0] === "" && parts.length > 1) return parts.slice(1, -1);
      return parts.filter((_, idx) => idx > 0 || parts[0] !== "");
    };
    const headerCells = parseRow(tableLines[0]!);
    const openAlexIdx = headerCells.findIndex((c) => /openalex/i.test(c));
    if (openAlexIdx === -1) {
      out.push(...tableLines);
      continue;
    }
    const writeRow = (cells: string[]): string => "| " + cells.join(" | ") + " |";
    for (const row of tableLines) {
      const cells = parseRow(row);
      if (cells.length > openAlexIdx) {
        const removed = cells.slice(0, openAlexIdx).concat(cells.slice(openAlexIdx + 1));
        out.push(writeRow(removed));
      } else {
        out.push(row);
      }
    }
  }
  return out.join("\n");
}

/** 从 React 子节点递归取出纯文本，用于主题总览表单元格解析 */
function getTextContent(node: React.ReactNode): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(getTextContent).join("");
  if (typeof node === "object" && "props" in node && node.props && typeof node.props === "object" && "children" in node.props)
    return getTextContent((node.props as { children?: React.ReactNode }).children);
  return "";
}

/**
 * 将正文中尚未成链接的纯文字引用转为 [(Author, Year)](#paper-id)，以便点击查看。
 * API 返回的 inTextCitation 带括号，如 (Pinchevski, 2022)；正文可能写为 Pinchevski, 2022，需两种都匹配。
 * 替换后链接文字统一带括号，符合文中注规范。
 */
function linkifyPlainCitations(
  content: string,
  citations: { id: number; inTextCitation: string }[]
): string {
  if (!citations.length) return content;
  const sorted = [...citations].sort((a, b) => b.inTextCitation.length - a.inTextCitation.length);
  let out = content;
  for (const { id, inTextCitation } of sorted) {
    const withParens = inTextCitation;
    const linkForm = `[${withParens}](#paper-${id})`;
    const escapedWith = withParens.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const reWith = new RegExp(`(^|[^\\[])(${escapedWith})`, "g");
    out = out.replace(reWith, (_, before) => (before === "" ? linkForm : `${before}${linkForm}`));
    const withoutParens =
      withParens.startsWith("(") && withParens.endsWith(")")
        ? withParens.slice(1, -1).trim()
        : "";
    if (withoutParens) {
      const escapedNo = withoutParens.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const reNo = new RegExp(`(^|[^\\[（(])(${escapedNo})`, "g");
      out = out.replace(reNo, (_, before) => (before === "" ? linkForm : `${before}${linkForm}`));
    }
  }
  return out;
}

export type PaperDetail = {
  id: number;
  title: string | null;
  year: number | null;
  journal: string | null;
  doi: string | null;
  openalex: string | null;
  authors: string | null;
  abstract: string | null;
  rq: string | null;
  method: string | null;
  findings: string | null;
  contribution: string | null;
};

export function MarkdownPreview({
  content,
  emptyPlaceholder = "暂无内容",
  citationLinkTopic,
  themeOverviewCellStyle = false,
}: {
  content: string;
  emptyPlaceholder?: string;
  /** 当为 05_report 等展示报告时传入 topic，则 #paper-<id> 链接会变为可点击并弹出论文详情 */
  citationLinkTopic?: string;
  /** 主题总览表「主题」列：括号内关键词另起一行、灰色小字 */
  themeOverviewCellStyle?: boolean;
}) {
  const safeContent = typeof content === "string" ? content : "";
  const [citationPaper, setCitationPaper] = useState<PaperDetail | null>(null);
  const [citationLoading, setCitationLoading] = useState(false);
  const [papersCitations, setPapersCitations] = useState<{ id: number; inTextCitation: string }[]>([]);

  useEffect(() => {
    if (!citationLinkTopic) {
      setPapersCitations([]);
      return;
    }
    fetch(`/api/papers-citations?topic=${encodeURIComponent(citationLinkTopic)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => (Array.isArray(list) ? list : []))
      .then(setPapersCitations)
      .catch(() => setPapersCitations([]));
  }, [citationLinkTopic]);

  const handleCitationClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
      const m = href.match(/^#paper-(\d+)$/);
      if (!citationLinkTopic || !m) return;
      e.preventDefault();
      const id = m[1];
      setCitationLoading(true);
      setCitationPaper(null);
      fetch(`/api/paper-by-id?topic=${encodeURIComponent(citationLinkTopic)}&id=${id}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => data && setCitationPaper(data as PaperDetail))
        .catch(() => setCitationPaper(null))
        .finally(() => setCitationLoading(false));
    },
    [citationLinkTopic]
  );

  const markdownComponents = useMemo(
    () => ({
      table: ({ children, ...props }: React.ComponentPropsWithoutRef<"table">) => (
        <div className="prose-table-wrap" role="region" aria-label="表格可左右滑动">
          <table className="prose-output-table" {...props}>
            {children}
          </table>
        </div>
      ),
      td: ({ children, ...props }: React.ComponentPropsWithoutRef<"td">) => {
        if (themeOverviewCellStyle) {
          const text = getTextContent(children).trim();
          const lastOpen = text.lastIndexOf("（");
          const lastClose = text.lastIndexOf("）");
          if (lastOpen !== -1 && lastClose > lastOpen) {
            const title = text.slice(0, lastOpen).trim();
            const keywords = text.slice(lastOpen + 1, lastClose).trim();
            if (title && keywords) {
              return (
                <td {...props}>
                  <div className="prose-cell-scroll">
                    <span>{title}</span>
                    <br />
                    <span className="text-[11px] text-[var(--text-muted)]">{keywords}</span>
                  </div>
                </td>
              );
            }
          }
        }
        return (
          <td {...props}>
            <div className="prose-cell-scroll">
              {children}
            </div>
          </td>
        );
      },
      a: ({ href, children, ...props }: React.ComponentPropsWithoutRef<"a">) => {
        const isPaperAnchor = typeof href === "string" && /^#paper-\d+$/.test(href);
        if (citationLinkTopic && isPaperAnchor && href) {
          return (
            <a
              {...props}
              href={href}
              role="button"
              className="cursor-pointer text-[var(--thu-purple)] underline decoration-[var(--thu-purple)]/40 hover:decoration-[var(--thu-purple)]"
              onClick={(e) => handleCitationClick(e, href)}
            >
              {children}
            </a>
          );
        }
        return (
          <a {...props} href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        );
      },
    }),
    [citationLinkTopic, handleCitationClick, themeOverviewCellStyle]
  );

  if (!safeContent.trim()) {
    return (
      <p className="text-[var(--text-muted)] text-sm">{emptyPlaceholder}</p>
    );
  }
  const unwrapped = unwrapMarkdownCodeBlock(safeContent);
  const noHint = stripHeadingHintParens(unwrapped);
  const withBreak = ensureLineBreakBeforeNumberedItem(noHint);
  const withoutOpenAlex = removeOpenAlexColumnFromTables(withBreak);
  const cleaned = stripOuterParensAroundLinks(withoutOpenAlex);
  const toRender =
    citationLinkTopic && papersCitations.length > 0
      ? linkifyPlainCitations(cleaned, papersCitations)
      : cleaned;
  return (
    <div className="prose-reader">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {toRender}
      </ReactMarkdown>
      {/* 引用论文详情弹窗 */}
      {(citationLoading || citationPaper != null) && (
        <div
          className="thu-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="论文详情"
          onClick={() => !citationLoading && setCitationPaper(null)}
        >
          <div
            className="thu-modal-card relative max-h-[85vh] w-full max-w-2xl flex flex-col p-5 text-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" onClick={() => !citationLoading && setCitationPaper(null)} className="thu-modal-close absolute right-4 top-4 z-10 p-1" aria-label="关闭">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            {citationLoading && (
              <p className="text-[var(--text-muted)]">加载中…</p>
            )}
            {!citationLoading && citationPaper && (
              <>
                <h3 className="text-base font-semibold text-[var(--text)] border-b border-[var(--border-soft)] pb-2 mb-3 pr-8 shrink-0">
                  {citationPaper.title ?? "（无标题）"}
                </h3>
                <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
                <dl className="grid gap-2 [&_dt]:font-medium [&_dt]:text-[var(--text-muted)] [&_dt]:mt-2 first:[&_dt]:mt-0 [&_dd]:text-[var(--text)]">
                  {(citationPaper.authors != null && citationPaper.authors !== "") && (
                    <>
                      <dt>作者</dt>
                      <dd>{citationPaper.authors}</dd>
                    </>
                  )}
                  {citationPaper.year != null && (
                    <>
                      <dt>年份</dt>
                      <dd>{citationPaper.year}</dd>
                    </>
                  )}
                  {(citationPaper.journal != null && citationPaper.journal !== "") && (
                    <>
                      <dt>期刊</dt>
                      <dd>{citationPaper.journal}</dd>
                    </>
                  )}
                  {(citationPaper.doi != null && citationPaper.doi !== "") && (
                    <>
                      <dt>DOI</dt>
                      <dd>
                        <a
                          href={citationPaper.doi.startsWith("http") ? citationPaper.doi : `https://doi.org/${citationPaper.doi}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--thu-purple)] underline"
                        >
                          {citationPaper.doi}
                        </a>
                      </dd>
                    </>
                  )}
                  {(citationPaper.abstract != null && citationPaper.abstract !== "") && (
                    <>
                      <dt>摘要</dt>
                      <dd className="whitespace-pre-wrap">{citationPaper.abstract}</dd>
                    </>
                  )}
                  {(citationPaper.rq != null && citationPaper.rq !== "") && (
                    <>
                      <dt>研究问题</dt>
                      <dd className="whitespace-pre-wrap">{citationPaper.rq}</dd>
                    </>
                  )}
                  {(citationPaper.method != null && citationPaper.method !== "") && (
                    <>
                      <dt>方法</dt>
                      <dd>{citationPaper.method}</dd>
                    </>
                  )}
                  {(citationPaper.findings != null && citationPaper.findings !== "") && (
                    <>
                      <dt>主要发现</dt>
                      <dd className="whitespace-pre-wrap">{citationPaper.findings}</dd>
                    </>
                  )}
                  {(citationPaper.contribution != null && citationPaper.contribution !== "") && (
                    <>
                      <dt>贡献</dt>
                      <dd className="whitespace-pre-wrap">{citationPaper.contribution}</dd>
                    </>
                  )}
                </dl>
                </div>
              </>
            )}
            <button
              type="button"
              className="mt-4 shrink-0 rounded-lg bg-[var(--thu-purple)] px-4 py-2 text-sm font-medium text-white"
              onClick={() => setCitationPaper(null)}
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
