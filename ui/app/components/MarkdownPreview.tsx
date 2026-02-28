"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** 若整段内容被包在 ```markdown ... ``` 中，则取出内部 Markdown 以便正确渲染 */
function unwrapMarkdownCodeBlock(raw: string): string {
  const t = raw.trim();
  if (!t.startsWith("```markdown") && !t.startsWith("```md")) return raw;
  const end = t.indexOf("```", 10);
  if (end === -1) return raw;
  const inner = t.slice(t.indexOf("\n", 10) + 1, end).trim();
  return inner || raw;
}

/** 将正文中尚未成链接的纯文字引用 (Author, Year) 转为 [(Author, Year)](#paper-id)，以便点击查看 */
function linkifyPlainCitations(
  content: string,
  citations: { id: number; inTextCitation: string }[]
): string {
  if (!citations.length) return content;
  const sorted = [...citations].sort((a, b) => b.inTextCitation.length - a.inTextCitation.length);
  let out = content;
  for (const { id, inTextCitation } of sorted) {
    const escaped = inTextCitation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const linkForm = `[${inTextCitation}](#paper-${id})`;
    const re = new RegExp(`(^|[^\\[])(${escaped})`, "g");
    out = out.replace(re, (_, before) => (before === "" ? linkForm : `${before}${linkForm}`));
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
}: {
  content: string;
  emptyPlaceholder?: string;
  /** 当为 05_report 等展示报告时传入 topic，则 #paper-<id> 链接会变为可点击并弹出论文详情 */
  citationLinkTopic?: string;
}) {
  const [expandedCell, setExpandedCell] = useState<React.ReactNode>(null);
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
      td: ({ children, ...props }: React.ComponentPropsWithoutRef<"td">) => (
        <td {...props}>
          <div className="prose-cell-scroll">
            {children}
          </div>
          <button
            type="button"
            className="prose-cell-expand"
            onClick={() => setExpandedCell(children)}
            title="点击放大查看"
          >
            展开
          </button>
        </td>
      ),
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
    [citationLinkTopic, handleCitationClick]
  );

  if (!content.trim()) {
    return (
      <p className="text-[var(--text-muted)] text-sm">{emptyPlaceholder}</p>
    );
  }
  const unwrapped = unwrapMarkdownCodeBlock(content);
  const toRender =
    citationLinkTopic && papersCitations.length > 0
      ? linkifyPlainCitations(unwrapped, papersCitations)
      : unwrapped;
  return (
    <div className="prose-reader">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {toRender}
      </ReactMarkdown>
      {expandedCell != null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="放大查看"
          onClick={() => setExpandedCell(null)}
        >
          <div
            className="prose-expand-modal max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[var(--border-soft)] bg-[var(--bg-card)] p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="prose-reader text-sm">{expandedCell}</div>
            <button
              type="button"
              className="mt-4 rounded-lg bg-[var(--thu-purple)] px-4 py-2 text-sm font-medium text-white"
              onClick={() => setExpandedCell(null)}
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {/* 引用论文详情弹窗 */}
      {(citationLoading || citationPaper != null) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="论文详情"
          onClick={() => !citationLoading && setCitationPaper(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[var(--border-soft)] bg-[var(--bg-card)] p-5 shadow-lg text-sm"
            onClick={(e) => e.stopPropagation()}
          >
            {citationLoading && (
              <p className="text-[var(--text-muted)]">加载中…</p>
            )}
            {!citationLoading && citationPaper && (
              <>
                <h3 className="text-base font-semibold text-[var(--text)] border-b border-[var(--border-soft)] pb-2 mb-3">
                  {citationPaper.title ?? "（无标题）"}
                </h3>
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
              </>
            )}
            <button
              type="button"
              className="mt-4 rounded-lg bg-[var(--thu-purple)] px-4 py-2 text-sm font-medium text-white"
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
