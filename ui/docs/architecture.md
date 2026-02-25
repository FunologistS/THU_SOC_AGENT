# UI 架构说明

## 目录与职责

- **ui/app/**：Next.js 前端工程（App Router + TypeScript + Tailwind）。
- **ui/public/**：静态资源。
- **ui/design/**：设计稿、色板、字体 license。
- **ui/mock/**：Mock 数据，用于 v1 开箱即用；结构与 `outputs/<topic>/` 对齐。
- **ui/docs/**：UI 说明、交互规范、组件文档、本文档。
- **ui/scripts/**：可选脚本，将 outputs 转为 UI 所需 JSON 等。

## 数据流：mock → outputs

- **v1（当前）**：默认使用 `ui/mock/`。每个 topic 有 `index.json` 描述 stages 与文件列表，MD 文件按 `outputs/<topic>/` 的层级放置（如 `03_summaries/summaries_latest.md`）。
- **v2**：可切换数据源为 `outputs/`。`/api/topics` 已支持 `source=outputs` 列出仓库内 `outputs/` 下目录；`/api/topic-meta` 在 outputs 下无 `index.json` 时会扫描 `01_raw`…`06_review` 目录并列出 `*_latest.md`；`/api/file` 支持 `source=outputs` 与 `path=<topic>/<stage>/<file>` 只读读取文件。
- **迁移**：从 mock 迁到 outputs 仅需在 UI 中把 `source` 从 `mock` 改为 `outputs`（如通过 URL `?source=outputs` 或将来设置项）。无需改 API 契约。

## 安全边界

- **Path traversal**：
  - `/api/file` 与 topic-meta 的路径解析均限制在约定 base 下（`outputs/` 或 `ui/mock/`）。
  - 禁止 `..`、绝对路径、非允许字符；`resolveUnder()` 与 `safeReadFile()` 在 `lib/pathSafety.ts` 中统一实现。
- **脚本执行**：
  - `/api/run` 仅接受白名单 `jobType`（如 `concept_synthesize`、`writing_under_style`），映射到固定脚本路径；禁止任意路径或用户传入脚本名。
  - 使用 `child_process.spawn("node", [scriptPath, ...args])`，参数为数组，无 shell 拼接。
- **Topic 校验**：`topic` 仅允许 `[a-z0-9_/-]`，长度上限 120，由 `isSafeTopic()` 校验。

## API 一览

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/topics?source=mock\|outputs` | GET | 列出 topic 列表 |
| `/api/topic-meta?topic=...&source=...` | GET | 返回 topic 的 stages + 文件列表（mock 用 index.json，outputs 可扫描） |
| `/api/file?source=...&path=<topic>/<stage>/<file>` | GET | 只读读取 MD/文本；path 限制在 base 内 |
| `/api/run` | POST | 执行白名单技能，body: `{ jobType, topic, args? }`，返回 `jobId` |
| `/api/logs?jobId=...` | GET | 轮询任务日志与完成状态（含 exitCode） |

## 技能工作台闭环

1. 用户在 UI 选择 topic，点击「运行」并选择 `jobType`（如概念合成）。
2. 前端 POST `/api/run`，服务端 spawn 对应脚本（cwd=仓库根），stdout/stderr 写入 `ui/.tmp/jobs/<jobId>.log`，结束时写入 `<jobId>.meta.json`。
3. 前端轮询 GET `/api/logs?jobId=...` 展示日志；完成后提示成功/失败，并提供「查看 outputs 预览」跳转（切到 `source=outputs` 并打开最新产物，如 `06_review/review_latest.md`）。

## 技术栈

- Next.js 14（App Router）、TypeScript、TailwindCSS。
- Markdown：react-markdown + remark-gfm。
- 状态：React state + URL 查询参数（topic / stage / file / source），无 Redux。
- 主题：清华紫 + 辅助色，见 `ui/docs/ui-tokens.md`。
