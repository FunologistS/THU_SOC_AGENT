"use client";

import { useState, useEffect } from "react";
import { MarkdownPreview } from "@/components/MarkdownPreview";

export function TroubleshootingModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    fetch("/api/docs/troubleshooting")
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "文档未找到" : "加载失败");
        return r.json();
      })
      .then((data) => setContent(data?.content ?? ""))
      .catch((e) => setError(e?.message ?? "加载失败"))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="thu-modal-overlay fixed inset-0 z-[200] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="troubleshooting-modal-title"
    >
      <div
        className="thu-modal-card flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-soft)] px-5 py-4">
          <h2 id="troubleshooting-modal-title" className="thu-modal-title text-lg">
            常见错误与处理
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="thu-modal-close p-1"
            aria-label="关闭"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-4">
          {loading && (
            <p className="text-sm text-[var(--text-muted)]">加载中…</p>
          )}
          {error && (
            <p className="text-sm text-[var(--accent)]">{error}</p>
          )}
          {!loading && !error && content && (
            <div className="prose-output text-sm text-[var(--text)]">
              <MarkdownPreview content={content} emptyPlaceholder="暂无内容" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
