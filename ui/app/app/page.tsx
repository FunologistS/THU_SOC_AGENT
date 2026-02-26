import { redirect } from "next/navigation";

/**
 * 根路径直接进入应用；启动说明见项目根目录的 start.html（无需运行服务即可打开）
 */
export default function RootPage() {
  redirect("/app");
}
