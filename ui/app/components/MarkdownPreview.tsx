"use client";

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
  if (!content.trim()) {
    return (
      <p className="text-[var(--text-muted)] text-sm">{emptyPlaceholder}</p>
    );
  }
  const toRender = unwrapMarkdownCodeBlock(content);
  return (
    <div className="prose-reader">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{toRender}</ReactMarkdown>
    </div>
  );
}
