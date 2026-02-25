import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import "./thu-theme.css";

export const metadata: Metadata = {
  title: "社会科学文献处理综合智能体",
  description: "批量检索 · 清洗规整 · 主题聚类 · 荟萃分析 · 文献简报 · 技能工作台与文献目录",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen antialiased">
        <Suspense fallback={<div className="p-4 text-[var(--text-muted)]">加载中…</div>}>
          {children}
        </Suspense>
      </body>
    </html>
  );
}
