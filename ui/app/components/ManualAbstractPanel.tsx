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

type FilledEntry = {
  idx: number;
  title: string;
  year: string | null;
  authors: string;
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
      filled?: FilledEntry[];
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
  topicLabel,
  availableTopics = [],
  onTopicChange,
  onSaved,
  hideTitle,
}: {
  topic: string;
  /** 当前主题的展示名 */
  topicLabel?: string;
  /** 可切换的主题列表（用于更换主题） */
  availableTopics?: { topic: string; label: string }[];
  /** 更换主题时回调 */
  onTopicChange?: (newTopic: string) => void;
  /** 手填保存成功后回调（如刷新 meta） */
  onSaved?: () => void;
  /** 为侧栏折叠时由父级统一渲染标题，隐藏组件内标题 */
  hideTitle?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [editsFilled, setEditsFilled] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [versionsList, setVersionsList] = useState<{ file: string; label: string }[]>([]);
  const [selectedVersion, setSelectedVersion] = useState("summaries_latest.md");

  const fetchVersions = useCallback(() => {
    if (!topic) return;
    fetch(`/api/summaries-versions?topic=${encodeURIComponent(topic)}`)
      .then((r) => r.json())
      .then((d: { versions?: { file: string; label: string }[] }) => {
        setVersionsList(Array.isArray(d.versions) ? d.versions : []);
      })
      .catch(() => setVersionsList([]));
  }, [topic]);

  const fetchMissing = useCallback((file?: string) => {
    if (!topic) return;
    const fileParam = file ?? "summaries_latest.md";
    setLoading(true);
    setError(null);
    const url = `/api/missing-abstracts?topic=${encodeURIComponent(topic)}&file=${encodeURIComponent(fileParam)}`;
    fetch(url)
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
        if ("filled" in d && Array.isArray(d.filled)) {
          const initialFilled: Record<number, string> = {};
          for (const f of d.filled) {
            initialFilled[f.idx] = f.keyFindings ?? "";
          }
          setEditsFilled(initialFilled);
        }
      })
      .catch((e) => {
        setError(e?.message || "请求失败");
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [topic]);

  useEffect(() => {
    if (!topic) return;
    setSelectedVersion("summaries_latest.md");
    fetchVersions();
  }, [topic, fetchVersions]);

  useEffect(() => {
    if (!topic) return;
    fetchMissing(selectedVersion);
  }, [topic, selectedVersion, fetchMissing]);

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
    if (!topic || !data || !("missing" in data)) return;
    const fromMissing =
      "missing" in data && Array.isArray(data.missing)
        ? data.missing
            .map((m) => ({
              idx: m.idx,
              abstract: (edits[m.idx] ?? m.keyFindings ?? "").trim(),
            }))
            .filter((e) => e.abstract.length > 0)
        : [];
    const fromFilled =
      "filled" in data && Array.isArray(data.filled)
        ? data.filled
            .map((f) => ({
              idx: f.idx,
              abstract: (editsFilled[f.idx] ?? f.keyFindings ?? "").trim(),
            }))
            .filter((e) => e.abstract.length > 0)
        : [];
    const entries = [...fromMissing, ...fromFilled];
    if (entries.length === 0) {
      setSaveMessage("请至少填写或保留一条摘要后再保存为新版本。");
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
          setSelectedVersion("summaries_latest.md");
          fetchVersions();
          fetchMissing("summaries_latest.md"); // 刷新当前使用内容
        } else {
          setSaveMessage(d.error || "保存失败");
        }
      })
      .catch((e) => setSaveMessage(e?.message || "请求失败"))
      .finally(() => setSaving(false));
  }, [topic, data, edits, editsFilled, onSaved, fetchMissing, fetchVersions]);

  const missing = data && "missing" in data ? data.missing : [];
  const filled = data && "filled" in data ? data.filled ?? [] : [];
  const hasMissing = missing.length > 0;
  const hasFilled = filled.length > 0;
  const hasData = data !== null && !("error" in data);
  const isViewingLatest = selectedVersion === "summaries_latest.md";
  const sourceFile = data && "sourceFile" in data ? data.sourceFile : null;
  const lastModified = data && "lastModified" in data ? data.lastModified : null;
  const latestVersionFile = data && "latestVersionFile" in data ? data.latestVersionFile : null;
  const displayLabel = topicLabel ?? topic.replace(/_/g, " ");

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
      {!hideTitle && (
        <h2 className="section-head mb-3 text-sm">手动补录空缺摘要</h2>
      )}
      {hideTitle && (
        <div className="mb-3 flex justify-end">
          {/* 占位，与有标题时对齐按钮位置 */}
        </div>
      )}

      {/* 当前主题 + 更换主题 */}
      <div className="mb-3 space-y-2">
        <p className="text-xs text-[var(--text-muted)]">
          当前主题：<span className="font-medium text-[var(--text)]">{displayLabel}</span>
        </p>
        {onTopicChange && availableTopics.length > 0 && (
          <div>
            <label className="mb-1 block text-[11px] text-[var(--text-muted)]">更换主题</label>
            <select
              value={topic}
              onChange={(e) => {
                const v = e.target.value;
                if (v && v !== topic) {
                  onTopicChange(v);
                  setData(null);
                  setError(null);
                  setEdits({});
                  setEditsFilled({});
                  setSelectedVersion("summaries_latest.md");
                }
              }}
              className="thu-input w-full rounded-lg border border-[var(--border-soft)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text)]"
            >
              {availableTopics.map((t) => (
                <option key={t.topic} value={t.topic}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* 查看版本（当前使用 + 历史版本） */}
      {versionsList.length > 0 && (
        <div className="mb-3">
          <label className="mb-1 block text-[11px] text-[var(--text-muted)]">查看版本</label>
          <select
            value={selectedVersion}
            onChange={(e) => setSelectedVersion(e.target.value)}
            className="thu-input w-full rounded-lg border border-[var(--border-soft)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text)]"
          >
            {versionsList.map((v) => (
              <option key={v.file} value={v.file}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 查询摘要空缺情况（选择主题后会自动查询，也可手动刷新） */}
      <div className="mb-3">
        <button
          type="button"
          onClick={() => fetchMissing(selectedVersion)}
          disabled={loading}
          className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--bg-card)] px-3 py-2 text-xs font-medium text-[var(--text)] shadow-thu-soft transition hover:bg-[var(--thu-purple-subtle)] disabled:opacity-50"
          title="重新拉取当前版本缺摘要与已补录情况"
        >
          {loading ? "查询中…" : "查询摘要空缺情况"}
        </button>
      </div>

      {error && (
        <p className="mb-2 text-xs text-[var(--accent)]">{error}</p>
      )}

      {!hasData && !loading && !error && (
        <p className="text-xs text-[var(--text-muted)]">
          选择主题后将自动加载；也可点击「查询摘要空缺情况」刷新。
        </p>
      )}

      {hasData && (
        <>
          {!isViewingLatest && (
            <p className="mb-2 rounded-lg border border-[var(--border-soft)] bg-[var(--thu-purple-subtle)] px-2 py-1.5 text-[11px] text-[var(--text)]">
              当前为历史版本，仅可查看；要修改或保存请切换为「当前使用」。
            </p>
          )}
          <p className="mb-2 text-xs text-[var(--text-muted)]">
            {isViewingLatest
              ? "以下条目缺摘要且无法自动爬取，可手填；已补录条目可在此查看、修改后保存为新版本。"
              : "以下为该版本的缺摘要与已补录条目（只读）。"}
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

          {!hasMissing && !hasFilled && (
            <p className="text-xs text-[var(--text-muted)]">
              当前主题暂无缺摘要条目，且尚无已补录条目；或请先运行「清洗规整」生成 03_summaries。
            </p>
          )}

          {hasMissing && (
            <>
              <p className="mb-2 text-xs font-medium text-[var(--text)]">
                缺摘要（{missing.length} 条）
              </p>
              <ul className="max-h-48 overflow-y-auto space-y-3 rounded-[var(--radius-lg)] border border-[var(--border-soft)] bg-[var(--bg-card)] p-3 shadow-thu-soft">
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
                      readOnly={!isViewingLatest}
                      className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--bg-page)] px-2 py-1.5 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--thu-purple)] focus:outline-none disabled:opacity-80 disabled:cursor-not-allowed"
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
            </>
          )}

          {hasFilled && (
            <>
              <p className="mt-3 mb-2 text-xs font-medium text-[var(--text)]">
                已补录 / 当前使用（{filled.length} 条，可修改后保存为新版本）
              </p>
              <ul className="max-h-48 overflow-y-auto space-y-3 rounded-[var(--radius-lg)] border border-[var(--border-soft)] bg-[var(--bg-card)] p-3 shadow-thu-soft">
                {filled.map((f) => (
                  <li key={f.idx} className="space-y-1">
                    <div className="text-xs font-medium text-[var(--text)]">
                      {f.idx}. {f.title}
                      {f.year && (
                        <span className="ml-1 text-[var(--text-muted)]">({f.year})</span>
                      )}
                      {f.authors && (
                        <span className="ml-1 text-[var(--text-muted)]">— {f.authors}</span>
                      )}
                      {f.isManual && (
                        <span className="ml-1 text-[10px] text-[var(--thu-purple)]">[MANUAL]</span>
                      )}
                    </div>
                    <textarea
                      readOnly={!isViewingLatest}
                      className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--bg-page)] px-2 py-1.5 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--thu-purple)] focus:outline-none disabled:opacity-80 disabled:cursor-not-allowed"
                      rows={3}
                      placeholder="已补录摘要，可修改后保存为新版本"
                      value={editsFilled[f.idx] ?? f.keyFindings ?? ""}
                      onChange={(e) =>
                        setEditsFilled((prev) => ({ ...prev, [f.idx]: e.target.value }))
                      }
                    />
                  </li>
                ))}
              </ul>
            </>
          )}

          {(hasMissing || hasFilled) && isViewingLatest && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {hasMissing && (
                <button
                  type="button"
                  onClick={saveDraftOnly}
                  className="rounded-[10px] border border-[var(--border-soft)] bg-[var(--bg-card)] px-3 py-2 text-xs font-medium text-[var(--text)] shadow-thu-soft transition hover:bg-[var(--thu-purple-subtle)]"
                >
                  暂存
                </button>
              )}
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
          )}
        </>
      )}
    </section>
  );
}
