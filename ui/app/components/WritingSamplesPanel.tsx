"use client";

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { MarkdownPreview } from "@/components/MarkdownPreview";

type SampleItem = { name: string; size?: number };
type SamplesList = { academic: SampleItem[]; colloquial: SampleItem[]; submitMd?: { academic: SampleItem[]; colloquial: SampleItem[] } };

const SAFE_NAME = /^[a-z0-9_.-]+\.(pdf|docx)$/i;
const SAFE_MD_NAME = /^[a-z0-9_.-]+\.md$/i;

export function WritingSamplesPanel({ hideTitle = false }: { hideTitle?: boolean }) {
  const [list, setList] = useState<SamplesList>({ academic: [], colloquial: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  /** 当前打开的下拉菜单信息，用于 Portal 渲染与定位 */
  const [openMenuInfo, setOpenMenuInfo] = useState<{ style: "academic" | "colloquial"; name: string; isMd: boolean } | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ style: "academic" | "colloquial"; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  /** 上传：类型 + 文件 + 用户命名；上传后刷新列表 */
  const [uploadStyle, setUploadStyle] = useState<"academic" | "colloquial">("academic");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  /** 正在转 Markdown 的 item key */
  const [transcribingKey, setTranscribingKey] = useState<string | null>(null);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  /** 查看预览：.md 在弹层内展示，.pdf/.docx 在新标签页打开 */
  const [viewState, setViewState] = useState<{ style: "academic" | "colloquial"; name: string; source: "submit" | "assets" } | null>(null);
  const [viewContent, setViewContent] = useState<string | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState<string | null>(null);

  const fetchList = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/writing-samples")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load"))))
      .then((data: SamplesList) => setList({ academic: data.academic ?? [], colloquial: data.colloquial ?? [], submitMd: data.submitMd ?? { academic: [], colloquial: [] } }))
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const deleteSample = async (style: "academic" | "colloquial", fileName: string) => {
    setMenuOpen(null);
    setOpenMenuInfo(null);
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
    setOpenMenuInfo(null);
    setRenameTarget({ style, name });
    setRenameValue(name);
  };

  const submitRename = async () => {
    if (!renameTarget) return;
    const isMd = renameTarget.name.toLowerCase().endsWith(".md");
    const valid = isMd ? SAFE_MD_NAME.test(renameValue) : SAFE_NAME.test(renameValue);
    if (!valid) return;
    const ext = renameValue.slice(renameValue.lastIndexOf("."));
    const newName = renameValue.endsWith(ext) ? renameValue : renameValue + (isMd ? ".md" : ext);
    if (newName === renameTarget.name) {
      setRenameTarget(null);
      return;
    }
    try {
      const body: { style: string; oldName: string; newName: string; source?: string } = {
        style: renameTarget.style,
        oldName: renameTarget.name,
        newName,
      };
      if (isMd) body.source = "submit";
      const res = await fetch("/api/writing-samples", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

  const exportUrl = (style: "academic" | "colloquial", fileName: string, source: "assets" | "submit" = "assets") =>
    `/api/writing-samples/download?style=${style}&fileName=${encodeURIComponent(fileName)}&source=${source}`;

  const closeView = useCallback(() => {
    setViewState(null);
    setViewContent(null);
    setViewError(null);
  }, []);

  const openView = useCallback(
    (style: "academic" | "colloquial", name: string, isMd: boolean, source: "submit" | "assets") => {
      setMenuOpen(null);
      setOpenMenuInfo(null);
      if (!isMd) {
        window.open(exportUrl(style, name, source), "_blank", "noopener");
        return;
      }
      setViewState({ style, name, source });
      setViewContent(null);
      setViewError(null);
      setViewLoading(true);
      const params = new URLSearchParams({ style, fileName: name, source });
      fetch(`/api/writing-samples/content?${params}`)
        .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(new Error(d.error || "加载失败")))))
        .then((data: { content?: string }) => {
          setViewContent(typeof data.content === "string" ? data.content : "");
          setViewError(null);
        })
        .catch((e) => {
          setViewError(e instanceof Error ? e.message : "加载失败");
          setViewContent(null);
        })
        .finally(() => setViewLoading(false));
    },
    [exportUrl]
  );

  const handleUpload = async () => {
    if (!uploadFile) return;
    setUploadError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", uploadFile);
      form.set("style", uploadStyle);
      if (uploadName.trim()) form.set("name", uploadName.trim());
      const res = await fetch("/api/upload-style-file", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "上传失败");
      setUploadFile(null);
      setUploadName("");
      fetchList();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const transcribeToMarkdown = async (style: "academic" | "colloquial", fileName: string) => {
    const key = `${style}:${fileName}`;
    setTranscribeError(null);
    setTranscribingKey(key);
    try {
      const res = await fetch("/api/transcribe-style-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ style, fileName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "转 Markdown 失败");
      fetchList();
    } catch (e) {
      setTranscribeError(e instanceof Error ? e.message : "转 Markdown 失败");
    } finally {
      setTranscribingKey(null);
    }
  };

  const contentProps = {
    list,
    loading,
    error,
    menuOpen,
    setMenuOpen,
    openMenuInfo,
    setOpenMenuInfo,
    renameTarget,
    renameValue,
    setRenameValue,
    setRenameTarget,
    deleteSample,
    startRename,
    submitRename,
    exportUrl,
    uploadStyle,
    setUploadStyle,
    uploadFile,
    setUploadFile,
    uploadName,
    setUploadName,
    uploading,
    uploadError,
    setUploadError,
    handleUpload,
    transcribingKey,
    transcribeError,
    transcribeToMarkdown,
    openView,
    closeView,
    viewState,
    viewContent,
    viewLoading,
    viewError,
  };

  if (!hideTitle) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-[var(--text)]">写作样例</h3>
        <WritingSamplesPanelContent {...contentProps} />
      </div>
    );
  }

  return <WritingSamplesPanelContent {...contentProps} />;
}

function WritingSamplesPanelContent({
  list,
  loading,
  error,
  menuOpen,
  setMenuOpen,
  openMenuInfo,
  setOpenMenuInfo,
  renameTarget,
  renameValue,
  setRenameValue,
  setRenameTarget,
  deleteSample,
  startRename,
  submitRename,
  exportUrl,
  uploadStyle,
  setUploadStyle,
  uploadFile,
  setUploadFile,
  uploadName,
  setUploadName,
  uploading,
  uploadError,
  setUploadError,
  handleUpload,
  transcribingKey,
  transcribeError,
  transcribeToMarkdown,
  openView,
  closeView,
  viewState,
  viewContent,
  viewLoading,
  viewError,
}: {
  list: SamplesList;
  loading: boolean;
  error: string | null;
  menuOpen: string | null;
  setMenuOpen: (v: string | null) => void;
  openMenuInfo: { style: "academic" | "colloquial"; name: string; isMd: boolean } | null;
  setOpenMenuInfo: (v: typeof openMenuInfo) => void;
  renameTarget: { style: "academic" | "colloquial"; name: string } | null;
  renameValue: string;
  setRenameValue: (v: string) => void;
  setRenameTarget: (v: typeof renameTarget) => void;
  deleteSample: (style: "academic" | "colloquial", fileName: string) => void;
  startRename: (style: "academic" | "colloquial", name: string) => void;
  submitRename: () => void;
  exportUrl: (style: "academic" | "colloquial", fileName: string, source?: "assets" | "submit") => string;
  uploadStyle: "academic" | "colloquial";
  setUploadStyle: (v: "academic" | "colloquial") => void;
  uploadFile: File | null;
  setUploadFile: (v: File | null) => void;
  uploadName: string;
  setUploadName: (v: string) => void;
  uploading: boolean;
  uploadError: string | null;
  setUploadError: (v: string | null) => void;
  handleUpload: () => void;
  transcribingKey: string | null;
  transcribeError: string | null;
  transcribeToMarkdown: (style: "academic" | "colloquial", fileName: string) => void;
  openView: (style: "academic" | "colloquial", name: string, isMd: boolean, source: "submit" | "assets") => void;
  closeView: () => void;
  viewState: { style: "academic" | "colloquial"; name: string; source: "submit" | "assets" } | null;
  viewContent: string | null;
  viewLoading: boolean;
  viewError: string | null;
}) {
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const renameRowRef = useRef<HTMLLIElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);

  useLayoutEffect(() => {
    if (!menuOpen || typeof document === "undefined") return;
    const el = menuTriggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }, [menuOpen]);

  useLayoutEffect(() => {
    if (renameTarget) renameRowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [renameTarget]);

  const closeMenu = useCallback(() => {
    setMenuOpen(null);
    setOpenMenuInfo(null);
    setMenuPosition(null);
  }, [setMenuOpen, setOpenMenuInfo]);
  const submitMd = list.submitMd ?? { academic: [], colloquial: [] };
  const transcribingLabel = transcribingKey ? (() => {
    const [s, n] = transcribingKey.split(":");
    return `${s === "academic" ? "学术型" : "通俗型"} · ${n}`;
  })() : null;

  const renderList = (style: "academic" | "colloquial", items: SampleItem[], label: string, isMd = false) => (
    <div key={style} className="mb-3">
      <p className="mb-1.5 text-[11px] font-medium text-[var(--text-muted)]">{label}</p>
      <ul className="space-y-1 rounded-lg border border-[var(--border-soft)] bg-[var(--bg-card)] p-2 max-h-40 overflow-y-auto">
        {items.length === 0 && <li className="px-2 py-1.5 text-xs text-[var(--text-muted)]">暂无</li>}
        {items.map(({ name }) => {
          const key = `${style}:${name}`;
          const isMenu = menuOpen === key;
          const isRenaming = renameTarget?.style === style && renameTarget?.name === name;
          const source: "submit" | "assets" = isMd ? "submit" : "assets";
          return (
            <li key={key} ref={isRenaming ? renameRowRef : undefined} className="group flex items-center gap-1">
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
                  <button
                    type="button"
                    onClick={() => openView(style, name, isMd, source)}
                    className="min-w-0 flex-1 truncate text-left text-xs text-[var(--text)] underline-offset-2 hover:underline hover:text-[var(--thu-purple)]"
                    title={isMd ? "查看" : "在新标签页打开"}
                  >
                    {name}
                  </button>
                  <div className="relative flex-shrink-0">
                    <button
                      ref={isMenu ? menuTriggerRef : undefined}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isMenu) {
                          setMenuOpen(null);
                          setOpenMenuInfo(null);
                        } else {
                          setMenuOpen(key);
                          setOpenMenuInfo({ style, name, isMd });
                        }
                      }}
                      className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--border-soft)] hover:text-[var(--text)] opacity-0 group-hover:opacity-100 focus:opacity-100"
                      aria-expanded={isMenu}
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></svg>
                    </button>
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
      {/* 上传文档：与一键综述内上传一致，保存到 assets/<style>，可再在此处点「转 Markdown」供综述使用 */}
      <div className="mb-3 rounded-lg border border-[var(--border-soft)] bg-[var(--bg-card)] p-2">
        <p className="mb-2 text-[11px] font-medium text-[var(--text-muted)]">上传文档</p>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setUploadStyle("academic")}
              className={`flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors ${uploadStyle === "academic" ? "bg-[var(--thu-purple-subtle)] text-[var(--thu-purple)]" : "bg-[var(--bg-page)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}
            >
              学术型
            </button>
            <button
              type="button"
              onClick={() => setUploadStyle("colloquial")}
              className={`flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors ${uploadStyle === "colloquial" ? "bg-[var(--thu-purple-subtle)] text-[var(--thu-purple)]" : "bg-[var(--bg-page)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}
            >
              通俗型
            </button>
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded border border-[var(--border-soft)] bg-[var(--bg-page)] px-2 py-1.5 text-xs text-[var(--text-muted)] hover:border-[var(--border)]">
            <span className="shrink-0">选择文件</span>
            <input
              type="file"
              accept=".pdf,.docx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setUploadFile(f ?? null);
                if (f && !uploadName) setUploadName(f.name.replace(/\.(pdf|docx)$/i, ""));
                setUploadError(null);
              }}
            />
            {uploadFile ? <span className="min-w-0 truncate text-[var(--text)]">{uploadFile.name}</span> : <span>仅支持 .pdf / .docx</span>}
          </label>
          <div>
            <label className="mb-0.5 block text-[11px] text-[var(--text-muted)]">保存为（文件名，选填；留空自动命名）</label>
            <input
              type="text"
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              placeholder="如 my_sample"
              className="thu-input w-full rounded border border-[var(--border-soft)] bg-[var(--bg-page)] px-2 py-1.5 text-xs text-[var(--text)]"
            />
          </div>
          {uploadError && <p className="text-[11px] text-[var(--accent)]">{uploadError}</p>}
          <button
            type="button"
            onClick={handleUpload}
            disabled={!uploadFile || uploading}
            className="thu-btn-primary rounded px-2 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            {uploading ? "上传中…" : "上传"}
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-[var(--text-muted)]">上传后可在列表中对该文件点「转 Markdown」，一键综述将自动使用。</p>
      </div>
      {transcribeError && <p className="mb-2 text-xs text-[var(--accent)]">{transcribeError}</p>}
      {transcribingLabel && (
        <p className="mb-2 rounded border border-[var(--thu-purple)] bg-[var(--thu-purple-subtle)] px-2 py-1.5 text-xs text-[var(--text)]">
          正在将「{transcribingLabel}」转为 Markdown…
        </p>
      )}
      {typeof document !== "undefined" && openMenuInfo && menuPosition && createPortal(
        <>
          <div className="fixed inset-0 z-[100]" aria-hidden onClick={closeMenu} />
          <ul
            className="fixed z-[101] min-w-[8rem] rounded-lg border border-[var(--border-soft)] bg-[var(--bg-card)] py-1 shadow-thu-soft"
            style={{ top: menuPosition.top, right: menuPosition.right }}
          >
            <li>
              <button type="button" onClick={() => { openView(openMenuInfo.style, openMenuInfo.name, openMenuInfo.isMd, openMenuInfo.isMd ? "submit" : "assets"); }} className="block w-full px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--thu-purple-subtle)]">
                {openMenuInfo.isMd ? "查看" : "在新标签页打开"}
              </button>
            </li>
            {!openMenuInfo.isMd && (
              <li>
                <button type="button" onClick={() => { closeMenu(); transcribeToMarkdown(openMenuInfo.style, openMenuInfo.name); }} disabled={transcribingKey === `${openMenuInfo.style}:${openMenuInfo.name}`} className="block w-full px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--thu-purple-subtle)] disabled:opacity-50">{transcribingKey === `${openMenuInfo.style}:${openMenuInfo.name}` ? "转 Markdown 中…" : "转 Markdown"}</button>
              </li>
            )}
            <li>
              <a href={exportUrl(openMenuInfo.style, openMenuInfo.name, openMenuInfo.isMd ? "submit" : "assets")} download={openMenuInfo.name} className="block px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--thu-purple-subtle)]" onClick={closeMenu}>导出</a>
            </li>
            <li>
              <button type="button" onClick={() => { startRename(openMenuInfo.style, openMenuInfo.name); closeMenu(); }} className="block w-full px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--thu-purple-subtle)]">修改名称</button>
            </li>
            {!openMenuInfo.isMd && (
              <li>
                <button type="button" onClick={() => { deleteSample(openMenuInfo.style, openMenuInfo.name); }} className="block w-full px-3 py-2 text-left text-sm text-[var(--accent)] hover:bg-[var(--thu-purple-subtle)]">删除</button>
              </li>
            )}
          </ul>
        </>,
        document.body
      )}
      {renderList("academic", list.academic, "学术型")}
      {renderList("colloquial", list.colloquial, "通俗型")}
      {(submitMd.academic.length > 0 || submitMd.colloquial.length > 0) && (
        <>
          <p className="mb-1.5 mt-2 text-[11px] font-medium text-[var(--text-muted)]">已转 Markdown（一键综述会使用）</p>
          {renderList("academic", submitMd.academic, "学术型", true)}
          {renderList("colloquial", submitMd.colloquial, "通俗型", true)}
        </>
      )}
      {viewState && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" role="dialog" aria-modal aria-labelledby="writing-sample-view-title">
          <div className="absolute inset-0 bg-black/50" aria-hidden onClick={closeView} />
          <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-[var(--border-soft)] bg-[var(--bg-card)] shadow-thu-soft">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border-soft)] px-4 py-2">
              <h2 id="writing-sample-view-title" className="truncate text-sm font-medium text-[var(--text)]">{viewState.name}</h2>
              <button type="button" onClick={closeView} className="shrink-0 rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--border-soft)] hover:text-[var(--text)]" aria-label="关闭">×</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {viewLoading && <p className="text-sm text-[var(--text-muted)]">加载中…</p>}
              {viewError && <p className="text-sm text-[var(--accent)]">{viewError}</p>}
              {!viewLoading && !viewError && viewContent !== null && (
                <div className="manual-view prose prose-sm max-w-none dark:prose-invert">
                  <MarkdownPreview content={viewContent} emptyPlaceholder="暂无内容" />
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
