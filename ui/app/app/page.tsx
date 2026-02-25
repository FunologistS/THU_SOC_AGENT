"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ThuLogo } from "@/components/ThuLogo";

export default function StartPage() {
  const [cmd, setCmd] = useState<{ command: string; oneShot: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/start-command")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setCmd({ command: d.command, oneShot: d.oneShot }))
      .catch(() => setCmd(null));
  }, []);

  const toCopy = cmd?.oneShot ?? cmd?.command ?? "";
  const copy = () => {
    if (!toCopy) return;
    navigator.clipboard.writeText(toCopy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-page)]">
      <header className="header-brand relative flex-shrink-0 border-b border-[var(--border-soft)]">
        <div className="gradient-thu-bar absolute inset-x-0 top-0" aria-hidden />
        <div className="relative flex items-center gap-5 px-6 py-4">
          <ThuLogo />
          <div className="min-w-0 flex-1">
            <h1 className="header-title text-[1.25rem] font-semibold leading-tight tracking-tight thu-title text-[var(--text)]">
              <span className="font-semibold text-[var(--text)]">社会科学文献处理</span>
              <span className="mx-2 text-[var(--text-muted)] font-normal" aria-hidden>｜</span>
              <span className="font-medium text-[var(--text-muted)]">综合智能体</span>
            </h1>
            <p className="mt-2 text-xs font-medium uppercase tracking-widest text-[var(--text-muted)]">
              批量检索 · 清洗规整 · 主题聚类 · 荟萃分析 · 文献简报
            </p>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-xl space-y-6">
          <p className="text-center text-sm leading-relaxed text-[var(--text-muted)]">
            首次使用或重新打开时，请在<strong className="text-[var(--text)]">本机终端</strong>执行下方命令以启动服务（已使用项目绝对路径，无需先 cd）。
          </p>

          {cmd ? (
            <>
              <div className="rounded-[var(--radius-lg)] border border-[var(--border-soft)] bg-[var(--bg-card)] p-4 shadow-thu-soft">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                  推荐：一条命令完成安装并启动（在项目根目录执行）
                </p>
                <pre className="overflow-x-auto rounded-lg bg-[var(--bg-sidebar)] px-3 py-2.5 text-sm text-[var(--text)]">
                  {cmd.oneShot}
                </pre>
              </div>
              <div className="rounded-[var(--radius-lg)] border border-[var(--border-soft)] bg-[var(--bg-card)] p-4 shadow-thu-soft">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                  或：先 cd 到 ui/app 再安装并启动
                </p>
                <pre className="overflow-x-auto rounded-lg bg-[var(--bg-sidebar)] px-3 py-2.5 text-sm text-[var(--text)]">
                  {cmd.command}
                </pre>
              </div>
            </>
          ) : (
            <div className="rounded-[var(--radius-lg)] border border-[var(--border-soft)] bg-[var(--bg-card)] p-4 text-center text-sm text-[var(--text-muted)] shadow-thu-soft">
              正在获取启动命令…
            </div>
          )}

          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={copy}
              disabled={!toCopy}
              className="rounded-[10px] bg-[var(--thu-purple)] px-5 py-2.5 text-sm font-medium text-white shadow-thu-soft transition hover:opacity-90 disabled:opacity-50"
            >
              {copied ? "已复制" : "一键复制推荐命令"}
            </button>
            <Link
              href="/app"
              className="rounded-[10px] border border-[var(--border-soft)] bg-[var(--bg-card)] px-5 py-2.5 text-sm font-medium text-[var(--text)] shadow-thu-soft transition hover:bg-[var(--thu-purple-subtle)]"
            >
              已启动，进入应用
            </Link>
          </div>

          <p className="text-center text-xs text-[var(--text-muted)]">
            复制命令后粘贴到终端执行；看到 “Ready” 或 “localhost:3001” 后，点击「已启动，进入应用」即可使用。
          </p>
        </div>
      </main>
    </div>
  );
}
