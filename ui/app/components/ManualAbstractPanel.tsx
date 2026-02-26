"use client";

import { useCallback, useEffect, useState } from "react";

const DRAFT_KEY_PREFIX = "manual_abstracts_draft_";

type MissingEntry = {
  idx: number;
  title: string;
  year: string | null;
  authors: string;
  doi: string;
  openalex: string;
  keyFindings: string;
  isManual: boolean;
};

type ApiResponse =
  | {
      topic: string;
      total: number;
      sourceFile?: string;
      lastModified?: string;
      latestVersionFile?: string;
      missing: MissingEntry[];
    }
  | { error: string };

function loadDraft(topic: string): Record<number, string> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY_PREFIX + topic);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { entries?: { idx: number; abstract: string }[] };
    if (!Array.isArray(parsed?.entries)) return null;
    const out: Record<number, string> = {};
    for (const e of parsed.entries) {
      out[e.idx] = e.abstract ?? "";
    }
    return out;
  } catch {
    return null;
  }
}

function saveDraft(topic: string, entries: { idx: number; abstract: string }[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      DRAFT_KEY_PREFIX + topic,
      JSON.stringify({ entries, savedAt: new Date().toISOString() })
    );
  } catch {
    // ignore
  }
}

export function ManualAbstractPanel({
  topic,
  onSaved,
}: {
  topic: string;
  /** 手填保存成功后回调（如刷新 meta） */
  onSaved?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const fetchMissing = useCallback(() => {
    if (!topic) return;
    setLoading(true);
    setError(null);
    fetch(`/api/missing-abstracts?topic=${encodeURIComponent(topic)}`)
      .then((r) => r.json())
      .then((d: ApiResponse) => {
        setData(d);
        if ("missing" in d && Array.isArray(d.missing)) {
          const initial: Record<number, string> = {};
          const draft = loadDraft(topic);
          for (const m of d.missing) {
            initial[m.idx] = draft?.[m.idx] ?? m.keyFindings ?? "";
          }
          setEdits(initial);
        }
      })
      .catch((e) => {
        setError(e?.message || "请求失败");
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [topic]);

  useEffect(() => {
    fetchMissing();
  }, [fetchMissing]);

  const saveDraftOnly = useCallback(() => {
    if (!topic || !data || !("missing" in data) || !data.missing?.length) return;
    const entries = data.missing
      .map((m) => ({ idx: m.idx, abstract: (edits[m.idx] ?? m.keyFindings ?? "").trim() }))
      .filter((e) => e.abstract.length > 0);
    saveDraft(topic, entries);
    setSaveMessage(entries.length > 0 ? "已暂存，可稍后「保存为新版本」。" : "已清空暂存。");
    setTimeout(() => setSaveMessage(null), 3000);
  }, [topic, data, edits]);

  const save = useCallback(() => {
    if (!topic || !data || !("missing" in data) || !data.missing?.length) return;
    const entries = data.missing
      .map((m) => ({
        idx: m.idx,
        abstract: (edits[m.idx] ?? m.keyFindings ?? "").trim(),
      }))
      .filter((e) => e.abstract.length > 0);
    if (entries.length === 0) {
      setSaveMessage("请至少填写一条摘要后再保存为新版本。");
      return;
    }
    setSaving(true);
    setSaveMessage(null);
    fetch("/api/save-manual-abstracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, entries }),
    })
      .then((r) => r.json())
      .then((d: { ok?: boolean; message?: string; error?: string }) => {
        if (d.ok) {
          try {
            localStorage.removeItem(DRAFT_KEY_PREFIX + topic);
          } catch {
            // ignore
          }
          setSaveMessage("已保存为新版本（手动补录）。");
          onSaved?.();
          fetchMissing();
        } else {
          setSaveMessage(d.error || "保存失败");
        }
      })
      .catch((e) => setSaveMessage(e?.message || "请求失败"))
      .finally(() => setSaving(false));
  }, [topic, data, edits, onSaved, fetchMissing]);

  const missing = data && "missing" in data ? data.missing : [];
  const hasMissing = missing.length > 0;
  const sourceFile = data && "sourceFile" in data ? data.sourceFile : null;
  const lastModified = data && "lastModified" in data ? data.lastModified : null;
  const latestVersionFile = data && "latestVersionFile" in data ? data.latestVersionFile : null;

  function formatLastModified(iso: string) {
    try {
      const d = new Date(iso);
      return d.toLocaleString("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  return (
    <section className="border-t border-[var(--border-soft)] pt-4">
      <h2 className="section-head mb-3 text-sm">摘要空缺须手动补录</h2>
      <p className="mb-3 text-xs text-[var(--text-muted)]">
        以下条目缺摘要且无法自动爬取，请手填。暂存仅记录当前内容；保存为新版本会写入文件并标注（手动补录）。
      </p>
      <p className="mb-2 text-[11px] text-[var(--text-muted)]">
        若你刚运行过「批量检索」+「清洗规整」，此处缺摘要列表即来自此轮生成的结构化摘要（summaries_latest）。
      </p>
      {(sourceFile || lastModified || latestVersionFile) && (
        <div className="mb-2 space-y-0.5 text-[11px] text-[var(--text-muted)]">
          {sourceFile && (
            <p>
              当前依据：<span className="font-medium text-[var(--text)]">03_summaries / {sourceFile}</span>
            </p>
          )}
          {lastModified && (
            <p>该文件最后更新：{formatLastModified(lastModified)}</p>
          )}
          {latestVersionFile && (
            <p>与 latest 同步的版本文件：{latestVersionFile}</p>
          )}
        </div>
      )}
      {loading && (
        <p className="text-xs text-[var(--text-muted)]">加载中…</p>
      )}
      {error && (
        <p className="mb-2 text-xs text-[var(--accent)]">{error}</p>
      )}
      {!loading && !error && !hasMissing && (
        <p className="text-xs text-[var(--text-muted)]">
          当前主题暂无缺摘要条目；或请先运行「清洗规整」生成 03_summaries。
        </p>
      )}
      {!loading && hasMissing && (
        <>
          <p className="mb-2 text-xs text-[var(--text-muted)]">
            共 {missing.length} 条缺摘要，可在此填写后保存为新版本。
          </p>
          <ul className="max-h-64 overflow-y-auto space-y-3 rounded-[var(--radius-lg)] border border-[var(--border-soft)] bg-[var(--bg-card)] p-3 shadow-thu-soft">
            {missing.map((m) => (
              <li key={m.idx} className="space-y-1">
                <div className="text-xs font-medium text-[var(--text)]">
                  {m.idx}. {m.title}
                  {m.year && (
                    <span className="ml-1 text-[var(--text-muted)]">({m.year})</span>
                  )}
                  {m.authors && (
                    <span className="ml-1 text-[var(--text-muted)]">— {m.authors}</span>
                  )}
                </div>
                <textarea
                  className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--bg-page)] px-2 py-1.5 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--thu-purple)] focus:outline-none"
                  rows={3}
                  placeholder="在此填写摘要（手填后将标注 [MANUAL]）"
                  value={edits[m.idx] ?? m.keyFindings ?? ""}
                  onChange={(e) =>
                    setEdits((prev) => ({ ...prev, [m.idx]: e.target.value }))
                  }
                />
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={saveDraftOnly}
              className="rounded-[10px] border border-[var(--border-soft)] bg-[var(--bg-card)] px-3 py-2 text-xs font-medium text-[var(--text)] shadow-thu-soft transition hover:bg-[var(--thu-purple-subtle)]"
            >
              暂存
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-[10px] bg-[var(--thu-purple)] px-3 py-2 text-xs font-medium text-white shadow-thu-soft transition hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "保存中…" : "保存为新版本"}
            </button>
            {saveMessage && (
              <span className="text-xs text-[var(--text-muted)]">{saveMessage}</span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
