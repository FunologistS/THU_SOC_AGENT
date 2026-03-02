"use client";

import React, { createContext, useCallback, useRef, useState } from "react";

export type ConfirmThreeResult = "cancel" | "run_all" | "confirm";

type DialogState =
  | { type: "alert"; message: string }
  | { type: "confirm"; message: string }
  | {
      type: "confirm_three";
      message: string;
      cancelLabel?: string;
      runAllLabel?: string;
      confirmLabel?: string;
    }
  | null;

type ThUAlertConfirmContextValue = {
  alert: (message: string) => Promise<void>;
  confirm: (message: string) => Promise<boolean>;
  /** 三选项确认：取消运行 / 仍然按全部文章运行 / 确认（只用优质论文）。用于荟萃分析等场景。 */
  confirmThree: (
    message: string,
    options?: { cancelLabel?: string; runAllLabel?: string; confirmLabel?: string }
  ) => Promise<ConfirmThreeResult>;
};

const ThUAlertConfirmContext = createContext<ThUAlertConfirmContextValue | null>(null);

export function useThUAlertConfirm(): ThUAlertConfirmContextValue {
  const ctx = React.useContext(ThUAlertConfirmContext);
  if (!ctx) {
    return {
      alert: (msg: string) => {
        window.alert(msg);
        return Promise.resolve();
      },
      confirm: (msg: string) => Promise.resolve(window.confirm(msg)),
      confirmThree: () => Promise.resolve("cancel" as ConfirmThreeResult),
    };
  }
  return ctx;
}

export function ThUAlertConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DialogState>(null);
  const resolveRef = useRef<((value?: boolean | ConfirmThreeResult) => void) | null>(null);

  const alert = useCallback((message: string) => {
    return new Promise<void>((resolve) => {
      resolveRef.current = (value?: boolean) => {
        resolveRef.current = null;
        setState(null);
        resolve();
      };
      setState({ type: "alert", message });
    });
  }, []);

  const confirm = useCallback((message: string) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = (value?: boolean | ConfirmThreeResult) => {
        resolveRef.current = null;
        setState(null);
        resolve(value === true);
      };
      setState({ type: "confirm", message });
    });
  }, []);

  const confirmThree = useCallback(
    (
      message: string,
      options?: { cancelLabel?: string; runAllLabel?: string; confirmLabel?: string }
    ) => {
      return new Promise<ConfirmThreeResult>((resolve) => {
        resolveRef.current = (value?: boolean | ConfirmThreeResult) => {
          resolveRef.current = null;
          setState(null);
          resolve(
            value === "cancel" || value === "run_all" || value === "confirm"
              ? value
              : "cancel"
          );
        };
        setState({
          type: "confirm_three",
          message,
          cancelLabel: options?.cancelLabel ?? "取消运行",
          runAllLabel: options?.runAllLabel ?? "仍然按全部文章运行",
          confirmLabel: options?.confirmLabel ?? "确认",
        });
      });
    },
    []
  );

  const handleClose = useCallback(() => {
    if (resolveRef.current) {
      if (state?.type === "confirm") resolveRef.current(false);
      else if (state?.type === "confirm_three") resolveRef.current("cancel");
      else resolveRef.current(undefined);
    }
    setState(null);
  }, [state?.type]);

  const handleConfirmOk = useCallback(() => {
    if (resolveRef.current) resolveRef.current(true);
    setState(null);
  }, []);

  const handleConfirmCancel = useCallback(() => {
    if (resolveRef.current) resolveRef.current(false);
    setState(null);
  }, []);

  const handleConfirmThree = useCallback((choice: ConfirmThreeResult) => {
    if (resolveRef.current) {
      resolveRef.current(choice);
      resolveRef.current = null;
      setState(null);
    }
  }, []);

  const value: ThUAlertConfirmContextValue = { alert, confirm, confirmThree };

  return (
    <ThUAlertConfirmContext.Provider value={value}>
      {children}
      {state && (
        <div
          className="thu-modal-overlay fixed inset-0 z-[300] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="thu-dialog-title"
          onClick={handleClose}
        >
          <div
            className="thu-modal-card relative mx-4 w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" onClick={handleClose} className="thu-modal-close absolute right-4 top-4 p-1" aria-label="关闭">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h3 id="thu-dialog-title" className="thu-modal-title mb-3 text-base pr-8">
              {state.type === "alert"
                ? "提示"
                : state.type === "confirm_three"
                  ? "确认"
                  : "确认"}
            </h3>
            <p className="mb-5 whitespace-pre-wrap text-sm text-[var(--text)] leading-relaxed">
              {state.message}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              {state.type === "alert" ? (
                <button
                  type="button"
                  onClick={handleClose}
                  className="thu-modal-btn-primary px-4 py-2 text-sm"
                >
                  确定
                </button>
              ) : state.type === "confirm_three" ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleConfirmThree("cancel")}
                    className="thu-modal-btn-secondary px-4 py-2 text-sm"
                  >
                    {state.cancelLabel ?? "取消运行"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleConfirmThree("run_all")}
                    className="thu-modal-btn-secondary px-4 py-2 text-sm"
                  >
                    {state.runAllLabel ?? "仍然按全部文章运行"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleConfirmThree("confirm")}
                    className="thu-modal-btn-primary px-4 py-2 text-sm"
                  >
                    {state.confirmLabel ?? "确认"}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleConfirmCancel}
                    className="thu-modal-btn-secondary px-4 py-2 text-sm"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmOk}
                    className="thu-modal-btn-primary px-4 py-2 text-sm"
                  >
                    确定
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </ThUAlertConfirmContext.Provider>
  );
}
