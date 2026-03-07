"use client";

import { useState, useEffect, useCallback } from "react";
import { useThUAlertConfirm } from "@/components/ThUAlertConfirm";

const ENV_KEYS = [
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "OPENAI_MODELS",
  "ZHIPU_API_KEY",
  "ZHIPU_BASE_URL",
  "ZHIPU_MODEL",
  "ZHIPU_MODELS",
  "FIRECRAWL_API_KEY",
  "OPENALEX_API_KEY",
  "OPENALEX_EMAIL",
] as const;

type EnvState = Record<(typeof ENV_KEYS)[number], string>;

const BASIC_KEYS = ["OPENAI_API_KEY", "ZHIPU_API_KEY"] as const;
const ADVANCED_KEYS = ["OPENAI_BASE_URL", "OPENAI_MODEL", "OPENAI_MODELS", "ZHIPU_BASE_URL", "ZHIPU_MODEL", "ZHIPU_MODELS", "FIRECRAWL_API_KEY", "OPENALEX_API_KEY", "OPENALEX_EMAIL"] as const;

const LABELS: Record<string, string> = {
  OPENAI_API_KEY: "OpenAI API Key",
  OPENAI_BASE_URL: "OpenAI Base URL",
  OPENAI_MODEL: "OpenAI Model（默认）",
  OPENAI_MODELS: "OpenAI 可选模型列表",
  ZHIPU_API_KEY: "智谱 API Key",
  ZHIPU_BASE_URL: "智谱 Base URL",
  ZHIPU_MODEL: "智谱 Model（默认）",
  ZHIPU_MODELS: "智谱可选模型列表",
  FIRECRAWL_API_KEY: "Firecrawl API Key",
  OPENALEX_API_KEY: "OpenAlex API Key",
  OPENALEX_EMAIL: "OpenAlex Email",
};

const HINTS: Record<string, string> = {
  OPENAI_API_KEY: "用于 GPT 模型调用。",
  OPENAI_BASE_URL: "可选，用于代理服务",
  OPENAI_MODEL: "可选，脚本默认模型，例如 gpt-5.2",
  OPENAI_MODELS: "可选，逗号分隔追加模型；默认 gpt-5.2 始终保留。仅填已支持的 id，否则运行时报错。",
  ZHIPU_API_KEY: "用于 GLM 模型调用",
  ZHIPU_BASE_URL: "可选",
  ZHIPU_MODEL: "可选，脚本默认模型，例如 glm-4.7-flash",
  ZHIPU_MODELS: "可选，逗号分隔追加模型；默认 glm-4.7-flash、glm-5 始终保留。仅填智谱已支持的 id，否则运行时报错。",
  FIRECRAWL_API_KEY: "可选，用于网页抓取",
  OPENALEX_API_KEY: "可选，批量检索用账号 $1/天 额度，否则易 429",
  OPENALEX_EMAIL: "可选，填写邮箱可获更宽松的请求限额",
};

function mask(value: string): string {
  const s = String(value ?? "").trim();
  if (!s) return "未设置";
  if (s.length <= 8) return "••••••••";
  return s.slice(0, 3) + "···" + s.slice(-4);
}

export function SettingsModal({
  open,
  onClose,
  onGitSaveSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onGitSaveSuccess?: () => void;
}) {
  const [env, setEnv] = useState<EnvState>(() => Object.fromEntries(ENV_KEYS.map((k) => [k, ""])) as EnvState);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verifyPrompt, setVerifyPrompt] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [storedPinHash, setStoredPinHash] = useState<string | null>(null);
  const [gitSavePrompt, setGitSavePrompt] = useState(false);
  const [gitSavePin, setGitSavePin] = useState("");
  const [gitSaveError, setGitSaveError] = useState<string | null>(null);
  const [gitSaving, setGitSaving] = useState(false);
  const [gitSavePinRequired, setGitSavePinRequired] = useState(false);
  const [versionName, setVersionName] = useState("");
  const [versionNaming, setVersionNaming] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyList, setHistoryList] = useState<{ hash: string; dateBeijing: string; tag?: string }[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [editingHash, setEditingHash] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [namingHash, setNamingHash] = useState<string | null>(null);
  const { alert: thuAlert } = useThUAlertConfirm();

  const fetchEnv = useCallback(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/settings/env")
      .then((r) => r.json())
      .then((d) => {
        if (d.env && typeof d.env === "object") {
          const next = Object.fromEntries(ENV_KEYS.map((k) => [k, d.env[k] != null ? String(d.env[k]) : ""])) as EnvState;
          setEnv(next);
        }
        setGitSavePinRequired(Boolean(d.gitSavePinRequired));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    fetchEnv();
  }, [fetchEnv]);

  useEffect(() => {
    if (typeof window === "undefined" || !open) return;
    setStoredPinHash(localStorage.getItem("settings_reveal_pin_hash"));
  }, [open]);

  const handleVerify = () => {
    if (storedPinHash) {
      setVerifyPrompt(true);
      setPinError(null);
      setPin("");
      return;
    }
    const p = window.prompt("设置查看密码（验证后可编辑并保存 .env，至少 4 位）：");
    if (p == null) return;
    if (p.length < 4) {
      thuAlert("密码至少 4 位");
      return;
    }
    hashPin(p).then((h) => {
      localStorage.setItem("settings_reveal_pin_hash", h);
      setStoredPinHash(h);
      setVerified(true);
    });
  };

  const checkPin = () => {
    if (!pin.trim()) {
      setPinError("请输入密码");
      return;
    }
    hashPin(pin).then((h) => {
      if (h === storedPinHash) {
        setVerified(true);
        setVerifyPrompt(false);
        setPin("");
        setPinError(null);
      } else {
        setPinError("密码错误");
      }
    });
  };

  const setEnvKey = (key: (typeof ENV_KEYS)[number], value: string) => {
    setEnv((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveEnv = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/env", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ env }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await thuAlert(data?.error || "保存失败");
        return;
      }
      await thuAlert("已保存到 .env");
    } catch (e) {
      await thuAlert(e instanceof Error ? e.message : "保存请求失败");
    } finally {
      setSaving(false);
    }
  };

  const hashPin = (p: string): Promise<string> => {
    if (typeof crypto !== "undefined" && crypto.subtle) {
      return crypto.subtle
        .digest("SHA-256", new TextEncoder().encode(p))
        .then((b) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join(""));
    }
    return Promise.resolve("hash_" + p.length);
  };

  const runGitSave = async (pinValue?: string) => {
    setGitSaving(true);
    try {
      const res = await fetch("/api/git-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pinValue != null ? { pin: pinValue } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 || data?.error === "密码错误") {
        setGitSaveError("密码错误");
        return;
      }
      if (!res.ok || !data?.ok) {
        const errMsg = data?.error || "Git 保存失败";
        let withDetail = data?.detail ? `${errMsg}\n\n${data.detail}` : errMsg;
        if (data?.hint) withDetail += `\n\n${data.hint}`;
        await thuAlert(withDetail);
        return;
      }
      const msg: string =
        data.message ||
        (data.committed ? "已完成 git 提交（未执行 push）。" : "当前没有需要保存的改动。");
      await thuAlert(msg);
      setGitSavePrompt(false);
      setGitSavePin("");
      onGitSaveSuccess?.();
      fetchHistory();
    } catch (e) {
      await thuAlert(e instanceof Error ? e.message : "Git 保存请求失败。");
    } finally {
      setGitSaving(false);
    }
  };

  const handleGitSaveConfirm = async () => {
    if (gitSavePinRequired) {
      const trimmed = gitSavePin.replace(/\D/g, "");
      if (trimmed.length !== 6) {
        setGitSaveError("请输入 6 位数字密码");
        return;
      }
      setGitSaveError(null);
      await runGitSave(trimmed);
    } else {
      await runGitSave();
    }
  };

  const handleGitSaveClick = () => {
    if (gitSavePinRequired) {
      setGitSavePrompt(true);
      setGitSavePin("");
      setGitSaveError(null);
    } else {
      runGitSave();
    }
  };

  const fetchHistory = useCallback(() => {
    setHistoryLoading(true);
    fetch("/api/git-history")
      .then((r) => r.json())
      .then((d) => (d?.ok ? setHistoryList(d.saves ?? []) : setHistoryList([])))
      .catch(() => setHistoryList([]))
      .finally(() => setHistoryLoading(false));
  }, []);

  const handleVersionNameSubmit = async () => {
    const name = versionName.trim();
    if (!name) {
      await thuAlert("请填写版本名称");
      return;
    }
    setVersionNaming(true);
    try {
      const res = await fetch("/api/git-tag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag: name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        await thuAlert(data?.error || "命名失败");
        return;
      }
      await thuAlert(`已命名为「${name}」`);
      setVersionName("");
      fetchHistory();
      onGitSaveSuccess?.();
    } catch (e) {
      await thuAlert(e instanceof Error ? e.message : "请求失败");
    } finally {
      setVersionNaming(false);
    }
  };

  const handleHistoryRowName = async (s: { hash: string; dateBeijing: string; tag?: string }) => {
    const name = editingName.trim();
    if (!name) {
      await thuAlert("请填写版本名称");
      return;
    }
    setNamingHash(s.hash);
    try {
      const res = await fetch("/api/git-tag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tag: name,
          hash: s.hash,
          replaceTag: s.tag || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        await thuAlert(data?.error || "命名失败");
        return;
      }
      setEditingHash(null);
      setEditingName("");
      fetchHistory();
      onGitSaveSuccess?.();
    } catch (e) {
      await thuAlert(e instanceof Error ? e.message : "请求失败");
    } finally {
      setNamingHash(null);
    }
  };

  if (!open) return null;

  return (
    <div
      className="thu-modal-overlay fixed inset-0 z-[200] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div
        className="thu-modal-card flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-soft)] px-5 py-4">
          <h2 id="settings-modal-title" className="thu-modal-title text-lg">
            基本变量与 API Key
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
        {verifyPrompt && (
          <div className="mb-4 rounded-lg border border-[var(--border-soft)] bg-[var(--bg-sidebar)] p-3">
            <p className="text-xs text-[var(--text-muted)] mb-2">输入查看密码以解锁编辑</p>
            <input
              type="password"
              value={pin}
              onChange={(e) => { setPin(e.target.value); setPinError(null); }}
              onKeyDown={(e) => e.key === "Enter" && checkPin()}
              placeholder="查看密码"
              className="thu-input w-full rounded-lg px-3 py-2 text-sm"
              autoFocus
            />
            {pinError && <p className="mt-1 text-xs text-[var(--accent)]">{pinError}</p>}
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={checkPin} className="thu-btn-primary rounded-lg px-3 py-1.5 text-xs">
                验证
              </button>
              <button type="button" onClick={() => { setVerifyPrompt(false); setPin(""); setPinError(null); }} className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-card)]">
                取消
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-[var(--text-muted)]">加载中…</p>
        ) : (
          <>
            {!verified && !verifyPrompt && (
              <div className="mb-4 flex items-center justify-between gap-2 rounded-lg border border-[var(--thu-purple)] bg-[var(--thu-purple-subtle)] px-3 py-2">
                <p className="text-xs text-[var(--text)]">当前为只读，点击下方按钮验证后可编辑并保存到 .env</p>
                <button
                  type="button"
                  onClick={handleVerify}
                  className="shrink-0 rounded-lg border border-[var(--thu-purple)] bg-[var(--bg-page)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:opacity-90"
                >
                  {storedPinHash ? "验证后编辑" : "设置查看密码"}
                </button>
              </div>
            )}

            <p className="text-xs font-medium text-[var(--text-muted)] mb-3">基础配置</p>
            <div className="space-y-4">
              {BASIC_KEYS.map((key) => (
                <div key={key} className="rounded-lg border border-[var(--border-soft)] bg-[var(--bg-page)] px-3 py-2">
                  <label className="block text-sm font-medium text-[var(--text)]">{LABELS[key]}</label>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{HINTS[key]}</p>
                  <input
                    type={verified ? (key.includes("KEY") ? "password" : "text") : "text"}
                    value={verified ? env[key] : mask(env[key])}
                    onChange={(e) => setEnvKey(key, e.target.value)}
                    placeholder={key.includes("KEY") ? "sk-…" : ""}
                    disabled={!verified}
                    readOnly={!verified}
                    className="thu-input mt-1.5 w-full rounded-lg px-3 py-2 text-sm font-mono disabled:opacity-80 disabled:cursor-not-allowed"
                  />
                </div>
              ))}
            </div>

            <div className="mt-4">
              <button
                type="button"
                onClick={() => setAdvancedOpen((o) => !o)}
                className="flex w-full items-center justify-between rounded-lg border border-[var(--border-soft)] bg-[var(--bg-page)] px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--bg-sidebar)]"
              >
                <span>Advanced Settings</span>
                <span className="text-[var(--text-muted)]">{advancedOpen ? "▲" : "▼"}</span>
              </button>
              {advancedOpen && (
                <div className="mt-2 space-y-4 rounded-lg border border-[var(--border-soft)] bg-[var(--bg-sidebar)] p-3">
                  {ADVANCED_KEYS.map((key) => (
                    <div key={key}>
                      <label className="block text-sm font-medium text-[var(--text)]">{LABELS[key]}</label>
                      <p className="text-[11px] text-[var(--text-muted)]">{HINTS[key]}</p>
                      <input
                        type="text"
                        value={verified ? env[key] : mask(env[key])}
                        onChange={(e) => setEnvKey(key, e.target.value)}
                        disabled={!verified}
                        readOnly={!verified}
                        className="thu-input mt-1 w-full rounded-lg px-3 py-2 text-sm font-mono disabled:opacity-80 disabled:cursor-not-allowed"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSaveEnv}
                disabled={saving || !verified}
                className="thu-btn-primary rounded-lg px-3 py-2 text-sm disabled:opacity-60"
              >
                {saving ? "保存中…" : "保存"}
              </button>
              <button type="button" onClick={fetchEnv} className="rounded-lg px-3 py-2 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-sidebar)]">
                刷新
              </button>
            </div>
          </>
        )}

        {/* 开发者：一键 Git 保存 */}
        <div className="mt-6 border-t border-[var(--border-soft)] pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-widest text-[var(--text-muted)]">
            开发者
          </p>
          {!gitSavePrompt ? (
            <button
              type="button"
              onClick={handleGitSaveClick}
              disabled={gitSaving}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--bg-page)] px-3 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--thu-purple-subtle)] hover:text-[var(--text)] transition-colors disabled:opacity-60"
              title={gitSavePinRequired ? "对当前仓库执行 git add + commit（不 push），需输入 6 位密码确认" : "对当前仓库执行 git add + commit（不 push）"}
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14" />
                <path d="M12 5v14" />
                <rect x="3" y="3" width="18" height="18" rx="2" />
              </svg>
              {gitSaving ? "Git 保存中…" : "一键 Git 保存"}
            </button>
          ) : (
            <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--bg-sidebar)] p-3">
              <p className="text-xs text-[var(--text-muted)] mb-2">请输入 6 位数字密码以确认</p>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={gitSavePin}
                onChange={(e) => {
                  setGitSavePin(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setGitSaveError(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && handleGitSaveConfirm()}
                placeholder="6 位密码"
                className="thu-input w-full rounded-lg px-3 py-2 text-sm font-mono tracking-widest"
                autoFocus
                disabled={gitSaving}
              />
              {gitSaveError && <p className="mt-1 text-xs text-[var(--accent)]">{gitSaveError}</p>}
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={handleGitSaveConfirm}
                  disabled={gitSaving}
                  className="thu-btn-primary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60"
                >
                  {gitSaving ? "保存中…" : "确认并保存"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGitSavePrompt(false);
                    setGitSavePin("");
                    setGitSaveError(null);
                  }}
                  disabled={gitSaving}
                  className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-card)] disabled:opacity-60"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {/* 为当前版本命名 */}
          <div className="mt-3">
            <p className="text-[11px] text-[var(--text-muted)] mb-1.5">为当前最新提交命名（打 tag）</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={versionName}
                onChange={(e) => setVersionName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleVersionNameSubmit()}
                placeholder="如 v1.0、初稿"
                className="thu-input flex-1 min-w-0 rounded-lg px-3 py-2 text-sm"
                disabled={versionNaming}
              />
              <button
                type="button"
                onClick={handleVersionNameSubmit}
                disabled={versionNaming || !versionName.trim()}
                className="thu-btn-primary rounded-lg px-3 py-2 text-xs whitespace-nowrap disabled:opacity-60"
              >
                {versionNaming ? "命名中…" : "命名"}
              </button>
            </div>
          </div>

          {/* 保存历史 */}
          <div className="mt-3">
            <button
              type="button"
              onClick={() => {
                setHistoryOpen((o) => !o);
                if (!historyOpen) fetchHistory();
              }}
              className="flex w-full items-center justify-between rounded-lg border border-[var(--border-soft)] bg-[var(--bg-page)] px-3 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--thu-purple-subtle)] hover:text-[var(--text)] transition-colors"
            >
              <span>保存历史（北京时间）</span>
              <svg className={`h-4 w-4 shrink-0 transition-transform ${historyOpen ? "" : "-rotate-90"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {historyOpen && (
              <div className="mt-1.5 max-h-48 overflow-y-auto rounded-lg border border-[var(--border-soft)] bg-[var(--bg-sidebar)] p-2">
                {historyLoading ? (
                  <p className="text-xs text-[var(--text-muted)] py-2">加载中…</p>
                ) : historyList.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)] py-2">暂无保存记录</p>
                ) : (
                  <ul className="space-y-1.5">
                    {historyList.map((s) => (
                      <li key={s.hash} className="rounded px-2 py-1.5 text-xs bg-[var(--bg-page)]">
                        {editingHash === s.hash ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[var(--text-muted)] shrink-0">{s.dateBeijing}</span>
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleHistoryRowName(s);
                                if (e.key === "Escape") { setEditingHash(null); setEditingName(""); }
                              }}
                              placeholder="版本名"
                              className="thu-input flex-1 min-w-0 max-w-[8rem] rounded px-2 py-1 text-xs"
                              autoFocus
                              disabled={namingHash !== null}
                            />
                            <button
                              type="button"
                              onClick={() => handleHistoryRowName(s)}
                              disabled={namingHash !== null || !editingName.trim()}
                              className="thu-btn-primary rounded px-2 py-1 text-xs disabled:opacity-60"
                            >
                              {namingHash === s.hash ? "命名中…" : "确认"}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setEditingHash(null); setEditingName(""); }}
                              disabled={namingHash !== null}
                              className="rounded px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-sidebar)] disabled:opacity-60"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[var(--text-muted)]">{s.dateBeijing}</span>
                            <div className="flex items-center gap-1.5 min-w-0">
                              {s.tag ? (
                                <span className="font-medium text-[var(--text)] truncate" title={s.tag}>{s.tag}</span>
                              ) : (
                                <span className="text-[var(--text-muted)] italic">未命名</span>
                              )}
                              <button
                                type="button"
                                onClick={() => { setEditingHash(s.hash); setEditingName(s.tag ?? ""); }}
                                disabled={namingHash !== null}
                                className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-[var(--thu-purple)] hover:bg-[var(--thu-purple-subtle)] disabled:opacity-60"
                              >
                                {s.tag ? "重命名" : "命名"}
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
