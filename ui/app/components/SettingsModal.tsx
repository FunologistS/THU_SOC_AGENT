"use client";

import { useState, useEffect, useCallback } from "react";

type EnvVar = { key: string; label: string; hint?: string; set: boolean; masked: string };

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [vars, setVars] = useState<EnvVar[]>([]);
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verifyPrompt, setVerifyPrompt] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [storedPinHash, setStoredPinHash] = useState<string | null>(null);

  const fetchEnv = useCallback(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/settings/env")
      .then((r) => r.json())
      .then((d) => {
        setVars(d.vars ?? []);
      })
      .catch(() => setVars([]))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    fetchEnv();
  }, [fetchEnv]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setStoredPinHash(localStorage.getItem("settings_reveal_pin_hash"));
  }, [open]);

  const handleVerify = () => {
    if (storedPinHash) {
      setVerifyPrompt(true);
      setPinError(null);
      setPin("");
      return;
    }
    const p = window.prompt("设置查看密码（用于今后验证后查看完整 Key 说明）：");
    if (p == null) return;
    if (p.length < 4) {
      alert("密码至少 4 位");
      return;
    }
    hashPin(p).then((h) => {
      localStorage.setItem("settings_reveal_pin_hash", h);
      setStoredPinHash(h);
      setVerified(true);
    });
  };

  const hashPin = (p: string): Promise<string> => {
    if (typeof crypto !== "undefined" && crypto.subtle) {
      return crypto.subtle
        .digest("SHA-256", new TextEncoder().encode(p))
        .then((b) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join(""));
    }
    return Promise.resolve("hash_" + p.length);
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ backgroundColor: "var(--overlay)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-dialog)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="settings-modal-title" className="text-lg font-semibold text-[var(--text)]">
            基本变量与 API Key
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--bg-sidebar)] hover:text-[var(--text)]"
            aria-label="关闭"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-[var(--text-muted)] mb-4">
          以下为各 skill 会用到的环境变量，仅展示是否已配置及脱敏值；完整 Key 不在此展示。
        </p>

        {verifyPrompt && (
          <div className="mb-4 rounded-lg border border-[var(--border-soft)] bg-[var(--bg-sidebar)] p-3">
            <p className="text-xs text-[var(--text-muted)] mb-2">输入查看密码以确认身份</p>
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

        {verified && (
          <p className="mb-3 rounded-lg border border-[var(--thu-purple)] bg-[var(--thu-purple-subtle)] px-3 py-2 text-xs text-[var(--text)]">
            已通过验证。为安全考虑，完整 Key 仅存于本机环境变量或 .env，此处不展示明文；可在此确认各变量是否已配置。
          </p>
        )}

        {loading ? (
          <p className="text-sm text-[var(--text-muted)]">加载中…</p>
        ) : (
          <ul className="space-y-2 max-h-64 overflow-y-auto">
            {vars.map((v) => (
              <li key={v.key} className="rounded-lg border border-[var(--border-soft)] bg-[var(--bg-page)] px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-[var(--text)]">{v.label}</span>
                  <span className={`text-xs font-mono ${v.set ? "text-[var(--text-muted)]" : "text-[var(--accent)]"}`}>
                    {v.set ? v.masked : "未设置"}
                  </span>
                </div>
                {v.hint && <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{v.hint}</p>}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {!verified && !verifyPrompt && (
            <button
              type="button"
              onClick={handleVerify}
              className="rounded-lg border border-[var(--thu-purple)] bg-[var(--thu-purple-subtle)] px-3 py-2 text-xs font-medium text-[var(--text)] hover:opacity-90"
            >
              {storedPinHash ? "验证后查看说明" : "设置查看密码"}
            </button>
          )}
          <button type="button" onClick={fetchEnv} className="rounded-lg px-3 py-2 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-sidebar)]">
            刷新
          </button>
        </div>
      </div>
    </div>
  );
}
