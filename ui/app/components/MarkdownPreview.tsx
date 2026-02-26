"use client";

import { useState, useMemo } from "react";
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

export function MarkdownPreview({
  content,
  emptyPlaceholder = "暂无内容",
}: {
  content: string;
  emptyPlaceholder?: string;
}) {
  const [expandedCell, setExpandedCell] = useState<React.ReactNode>(null);

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
    }),
    []
  );

  if (!content.trim()) {
    return (
      <p className="text-[var(--text-muted)] text-sm">{emptyPlaceholder}</p>
    );
  }
  const toRender = unwrapMarkdownCodeBlock(content);
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
    </div>
  );
}
