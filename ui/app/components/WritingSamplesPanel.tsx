"use client";

import { useState, useEffect, useCallback } from "react";

type SampleItem = { name: string; size?: number };
type SamplesList = { academic: SampleItem[]; colloquial: SampleItem[] };

const SAFE_NAME = /^[a-z0-9_.-]+\.(pdf|docx)$/i;

export function WritingSamplesPanel({ hideTitle = false }: { hideTitle?: boolean }) {
  const [list, setList] = useState<SamplesList>({ academic: [], colloquial: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ style: "academic" | "colloquial"; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const fetchList = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/writing-samples")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load"))))
      .then((data: SamplesList) => setList(data))
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const deleteSample = async (style: "academic" | "colloquial", fileName: string) => {
    setMenuOpen(null);
    try {
      const res = await fetch("/api/writing-samples", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ style, fileName }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "删除失败");
      }
      fetchList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  };

  const startRename = (style: "academic" | "colloquial", name: string) => {
    setMenuOpen(null);
    setRenameTarget({ style, name });
    setRenameValue(name);
  };

  const submitRename = async () => {
    if (!renameTarget || !SAFE_NAME.test(renameValue)) return;
    const ext = renameValue.slice(renameValue.lastIndexOf("."));
    if (renameValue === renameTarget.name) {
      setRenameTarget(null);
      return;
    }
    try {
      const res = await fetch("/api/writing-samples", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          style: renameTarget.style,
          oldName: renameTarget.name,
          newName: renameValue.endsWith(ext) ? renameValue : renameValue + ext,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "重命名失败");
      }
      setRenameTarget(null);
      fetchList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "重命名失败");
    }
  };

  const exportUrl = (style: "academic" | "colloquial", fileName: string) =>
    `/api/writing-samples/download?style=${style}&fileName=${encodeURIComponent(fileName)}`;

  if (!hideTitle) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-[var(--text)]">写作样例</h3>
        <WritingSamplesPanelContent
          list={list}
          loading={loading}
          error={error}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          renameTarget={renameTarget}
          renameValue={renameValue}
          setRenameValue={setRenameValue}
          setRenameTarget={setRenameTarget}
          deleteSample={deleteSample}
          startRename={startRename}
          submitRename={submitRename}
          exportUrl={exportUrl}
        />
      </div>
    );
  }

  return (
    <WritingSamplesPanelContent
      list={list}
      loading={loading}
      error={error}
      menuOpen={menuOpen}
      setMenuOpen={setMenuOpen}
      renameTarget={renameTarget}
      renameValue={renameValue}
      setRenameValue={setRenameValue}
      setRenameTarget={setRenameTarget}
      deleteSample={deleteSample}
      startRename={startRename}
      submitRename={submitRename}
      exportUrl={exportUrl}
    />
  );
}

function WritingSamplesPanelContent({
  list,
  loading,
  error,
  menuOpen,
  setMenuOpen,
  renameTarget,
  renameValue,
  setRenameValue,
  setRenameTarget,
  deleteSample,
  startRename,
  submitRename,
  exportUrl,
}: {
  list: SamplesList;
  loading: boolean;
  error: string | null;
  menuOpen: string | null;
  setMenuOpen: (v: string | null) => void;
  renameTarget: { style: "academic" | "colloquial"; name: string } | null;
  renameValue: string;
  setRenameValue: (v: string) => void;
  setRenameTarget: (v: typeof renameTarget) => void;
  deleteSample: (style: "academic" | "colloquial", fileName: string) => void;
  startRename: (style: "academic" | "colloquial", name: string) => void;
  submitRename: () => void;
  exportUrl: (style: "academic" | "colloquial", fileName: string) => string;
}) {
  const renderList = (style: "academic" | "colloquial", items: SampleItem[], label: string) => (
    <div key={style} className="mb-3">
      <p className="mb-1.5 text-[11px] font-medium text-[var(--text-muted)]">{label}</p>
      <ul className="space-y-1 rounded-lg border border-[var(--border-soft)] bg-[var(--bg-card)] p-2 max-h-40 overflow-y-auto">
        {items.length === 0 && <li className="px-2 py-1.5 text-xs text-[var(--text-muted)]">暂无</li>}
        {items.map(({ name }) => {
          const key = `${style}:${name}`;
          const isMenu = menuOpen === key;
          const isRenaming = renameTarget?.style === style && renameTarget?.name === name;
          return (
            <li key={key} className="group flex items-center gap-1">
              {isRenaming ? (
                <div className="flex flex-1 items-center gap-1">
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitRename();
                      if (e.key === "Escape") setRenameTarget(null);
                    }}
                    className="min-w-0 flex-1 rounded border border-[var(--border-soft)] bg-[var(--bg-page)] px-2 py-1 text-xs"
                    autoFocus
                  />
                  <button type="button" onClick={submitRename} className="rounded px-2 py-1 text-xs font-medium text-[var(--thu-purple)]">确定</button>
                  <button type="button" onClick={() => setRenameTarget(null)} className="rounded px-2 py-1 text-xs text-[var(--text-muted)]">取消</button>
                </div>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-xs text-[var(--text)]" title={name}>{name}</span>
                  <div className="relative flex-shrink-0">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setMenuOpen(isMenu ? null : key); }}
                      className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--border-soft)] hover:text-[var(--text)] opacity-0 group-hover:opacity-100 focus:opacity-100"
                      aria-expanded={isMenu}
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></svg>
                    </button>
                    {isMenu && (
                      <>
                        <div className="fixed inset-0 z-10" aria-hidden onClick={() => setMenuOpen(null)} />
                        <ul className="absolute right-0 top-full z-20 mt-0.5 min-w-[8rem] rounded-lg border border-[var(--border-soft)] bg-[var(--bg-card)] py-1 shadow-thu-soft">
                          <li>
                            <a href={exportUrl(style, name)} download={name} className="block px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--thu-purple-subtle)]" onClick={() => setMenuOpen(null)}>导出</a>
                          </li>
                          <li>
                            <button type="button" onClick={() => startRename(style, name)} className="block w-full px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--thu-purple-subtle)]">重命名</button>
                          </li>
                          <li>
                            <button type="button" onClick={() => deleteSample(style, name)} className="block w-full px-3 py-2 text-left text-sm text-[var(--accent)] hover:bg-[var(--thu-purple-subtle)]">删除</button>
                          </li>
                        </ul>
                      </>
                    )}
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );

  if (loading) return <p className="text-xs text-[var(--text-muted)]">加载中…</p>;
  return (
    <div>
      {error && <p className="mb-2 text-xs text-[var(--accent)]">{error}</p>}
      {renderList("academic", list.academic, "学术型")}
      {renderList("colloquial", list.colloquial, "通俗型")}
    </div>
  );
}
