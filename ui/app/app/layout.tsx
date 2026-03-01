import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import "./thu-theme.css";
import { ThUAlertConfirmProvider } from "@/components/ThUAlertConfirm";

export const metadata: Metadata = {
  title: "THU_SOC_AGENT · 社会科学文献综合处理｜智能体",
  description: "THU_SOC_AGENT：社会科学文献综合处理智能体。期刊查询、文献检索与整理、主题聚类与荟萃分析、一键生成文献综述。访问地址为 http://localhost:9301，请勿与其它项目共用端口。",
  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen antialiased">
        <ThUAlertConfirmProvider>
          <Suspense fallback={<div className="p-4 text-[var(--text-muted)]">加载中…</div>}>
            {children}
          </Suspense>
        </ThUAlertConfirmProvider>
      </body>
    </html>
  );
}
