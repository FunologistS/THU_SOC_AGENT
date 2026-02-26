"use client";

/**
 * 清华大学社会学系 logo：外围渐变光带；animate 为 true 时外圈持续旋转、悬停时内圈旋转
 */
export function ThuLogo({
  className = "",
  animate = true,
}: {
  className?: string;
  /** 首页未启动时不旋转，进入应用后再旋转 */
  animate?: boolean;
}) {
  return (
    <div
      className={`thu-logo-ring ${!animate ? "thu-logo-ring--static" : ""} ${className}`.trim()}
      aria-hidden
    >
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
