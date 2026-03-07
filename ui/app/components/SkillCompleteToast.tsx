"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export type SkillCompleteToastOptions = {
  label: string;
  success: boolean;
  /** 点击弹窗时调用，通常用于跳转到对应产出页面 */
  onClick?: () => void;
};

type ContextValue = {
  notify: (opts: SkillCompleteToastOptions) => void;
};

const SkillCompleteToastContext = createContext<ContextValue | null>(null);

export function useSkillCompleteToast(): ContextValue {
  const ctx = useContext(SkillCompleteToastContext);
  if (!ctx) {
    return {
      notify: () => {},
    };
  }
  return ctx;
}

const TOAST_DURATION_MS = 5500;

export function SkillCompleteToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<SkillCompleteToastOptions | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((opts: SkillCompleteToastOptions) => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setToast(opts);
    hideTimerRef.current = setTimeout(() => {
      setToast(null);
      hideTimerRef.current = null;
    }, TOAST_DURATION_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  return (
    <SkillCompleteToastContext.Provider value={{ notify }}>
      {children}
      {/* 右上角固定通知：技能运行结束后提示用户可回来查看产出 */}
      {toast && (
        <div
          className={
            "fixed top-4 right-4 z-[100] flex max-w-sm rounded-xl shadow-lg " +
            (toast.onClick ? "cursor-pointer hover:opacity-95 active:scale-[0.98] transition-opacity" : "")
          }
          style={{
            animation: "skillToastIn 0.25s ease-out forwards",
          }}
          role={toast.onClick ? "button" : "status"}
          aria-live="polite"
          aria-label={
            toast.onClick
              ? `${toast.label} ${toast.success ? "已完成" : "运行失败"}，点击查看产出`
              : `${toast.label} ${toast.success ? "已完成" : "运行失败"}，请查看运行日志`
          }
          tabIndex={toast.onClick ? 0 : undefined}
          onClick={() => {
            if (toast.onClick) {
              toast.onClick();
              if (hideTimerRef.current) {
                clearTimeout(hideTimerRef.current);
                hideTimerRef.current = null;
              }
              setToast(null);
            }
          }}
          onKeyDown={(e) => {
            if (toast.onClick && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              toast.onClick();
              if (hideTimerRef.current) {
                clearTimeout(hideTimerRef.current);
                hideTimerRef.current = null;
              }
              setToast(null);
            }
          }}
        >
          <div
            className={
              "flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg " +
              (toast.success
                ? "border-[var(--border-soft)] bg-[var(--bg-card)] text-[var(--text)]"
                : "border-amber-500/40 bg-amber-500/10 text-[var(--text)]")
            }
          >
            {toast.success ? (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" aria-hidden>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </span>
            ) : (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400" aria-hidden>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </span>
            )}
            <div className="min-w-0 pt-0.5">
              <p className="font-medium">
                「{toast.label}」{toast.success ? "已完成" : "运行失败"}
              </p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                {toast.success
                  ? toast.onClick
                    ? "点击此处查看产出"
                    : "可回到本页查看产出"
                  : "请查看运行日志排查原因"}
              </p>
            </div>
          </div>
        </div>
      )}
    </SkillCompleteToastContext.Provider>
  );
}
