"use client";

/**
 * 清华大学社会学系 logo：悬停旋转 + 外围清华标准色/辅助色渐变光带（持续动画）
 */
export function ThuLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`thu-logo-ring ${className}`.trim()} aria-hidden>
      <div className="thu-logo-inner">
        <img
          src="/thu-soc-logo.png"
          alt="清华大学社会学系"
          className="h-full w-full object-contain"
        />
      </div>
    </div>
  );
}
