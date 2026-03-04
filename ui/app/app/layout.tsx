import type { Metadata } from "next";
import Script from "next/script";
import { Suspense } from "react";
import "./globals.css";
import "./thu-theme.css";
import { ThUAlertConfirmProvider } from "@/components/ThUAlertConfirm";

export const metadata: Metadata = {
  title: "THU_SOC_AGENT · 社会科学文献综合处理｜智能体",
  description: "THU_SOC_AGENT：社会科学文献综合处理智能体。期刊查询、批量检索与整理、荟萃分析与文献简报、一键生成文献综述。访问地址为 http://localhost:9301，请勿与其它项目共用端口。",
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
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){var s=document.location.search;var m=s.match(/[?&]theme=(dark|light)/);var t=m?m[1]:localStorage.getItem('thu_soc_theme');if(t==='dark'||t==='light'){try{localStorage.setItem('thu_soc_theme',t);}catch(e){}document.documentElement.setAttribute('data-theme',t);}})();`,
          }}
        />
        <ThUAlertConfirmProvider>
          <Suspense fallback={<div className="p-4 text-[var(--text-muted)]">加载中…</div>}>
            {children}
          </Suspense>
        </ThUAlertConfirmProvider>
      </body>
    </html>
  );
}
