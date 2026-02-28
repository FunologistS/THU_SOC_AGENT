# UI

前端与设计资源目录，与 `.claude/skills` 平行。

## 目录说明

| 目录 | 说明 |
|------|------|
| `app/` | 前端工程（Next.js App Router + TypeScript + Tailwind） |
| `public/` | 静态资源（logo、icon、默认图） |
| `design/` | 设计稿、Figma 导出、字体 license、色板 |
| `mock/` | Mock 数据（从 `outputs` 抽样复制一份） |
| `docs/` | UI 说明、交互规范、组件文档（含 ui-tokens.md、architecture.md） |
| `scripts/` | 可选：将 `outputs` 转为 UI 所需 JSON 的脚本 |

## 一键启动

**从项目根目录**执行（根目录 = 含 `ui` 与 `.claude` 的 THU_SOC_AGENT 目录）：

```bash
cd ui/app
npm install
npm run dev
```

若当前不在项目根，可先进入再启动：

```bash
cd "/path/to/THU_SOC_AGENT"   # 替换为你的仓库路径
cd ui/app
npm run dev
```

启动后在浏览器打开：**http://localhost:3001**。

本仓库 UI **默认端口为 3001**（可通过 `PORT=...` 覆盖）。仅当 3001 被占用时再改用「临时改端口」（见下）。

---

## 功能与管线

- **顶栏**：标题「社会科学文献处理综合智能体」；副标题为「批量检索 · 清洗规整 · 主题聚类 · 荟萃分析 · 文献简报」。
- **期刊数据库管理**（左侧上）  
  - 数据源：WOS SSCI 全库（3000+）/ 已解析 OpenAlex。  
  - 筛选：学科、分区（Q1–Q4）、出版社。  
  - 操作：「在选中期刊中检索」或「输入检索指令」→ 弹出对话框填写主题/关键词与年份，执行后写入 `outputs/<topic>/01_raw/`（并更新 `papers_latest.md`），同时建好 02_clean～06_review 目录树。
- **文档目录**（左侧中）  
  - 主题列表、阶段（01_raw～06_review）与文件列表；点击文件在右侧预览 Markdown。  
  - 每个文件旁有「删」按钮，点击确认后将该文件**移至系统废纸篓**（可恢复），不永久删除。
- **技能工作台**（左侧下）  
  - 当前主题、变更主题。  
  - 五步层层递进：**批量检索**（01_raw）→ **清洗规整**（02_clean + 03_summaries）→ **主题聚类**（04_meta）→ **荟萃分析**（05_report）→ **文献简报**（06_review）。  
  - 运行日志轮询显示；完成后可在文档目录查看对应 stage 下的 `*_latest.md`。
- **文档预览**（右侧）：展示所选文件的 Markdown 内容。

与 skills 的对应关系：`journal-search` → 01_raw；`paper-summarize` → 03_summaries；`literature-synthesis`（synthesize / concept_synthesize）→ 04_meta、05_report；`paper-writing`（writing_under_style）→ 06_review。详见 `.claude/skills/README.md`。

---

## 运行日志与归档

每次运行技能会在 `ui/app/.tmp/jobs/` 下生成 `{jobId}.log` 与 `{jobId}.meta.json`，长期会堆积。建议定期做**归档**或**清理**：

- **归档**：将超过 N 天（默认 3 天）的日志移动到 `ui/app/.tmp/jobs/archive/YYYY-MM/`，主目录只留近期日志；已归档任务仍可通过界面查看（接口会从 archive 回读）。
- **清理**：仅保留最近 N 条任务，或按“超过 N 天”删除；也可只清理 archive 下过期目录。

在界面中：展开底部 **运行日志** 面板，下方有「日志管理」：显示当前任务条数，按钮「归档 3 天前」「仅保留最近 30 条」。也可直接调 API：

- `GET /api/logs/jobs` — 列出当前目录下的任务及时间、大小
- `POST /api/logs/archive` — body `{ "olderThanDays": 3 }` 归档（默认 3 天）
- `POST /api/logs/cleanup` — body `{ "keepLast": 30 }` 或 `{ "deleteOlderThanDays": 30 }` 或 `{ "fromArchive": true, "deleteOlderThanDays": 90 }` 清理

---

## 端口与迁移

### 端口占用排查（macOS / Linux）

若提示端口被占用或无法访问 3001：

```bash
lsof -i :3001
kill -9 <PID>
```

之后重新执行 `npm run dev`。

### 临时改端口

```bash
PORT=3005 npm run dev
```

访问 **http://localhost:3005**。

### Windows（PowerShell）

```powershell
$env:PORT=3005; npm run dev
```

---

## 自检（doctor）

在 `ui/app` 目录执行：

```bash
npm run doctor
```

会检查 Node 版本、端口 3001、`.env`、`next` 安装等。

---

## 其它说明

- 若在 iCloud/云盘路径下遇到 `Failed to load SWC binary`，可将仓库克隆到本地非同步目录，或先执行一次 `npm run dev` 再 `npm run build`。
- URL 支持 `?topic=...&stage=...&file=...&source=mock|outputs`，刷新可复原视图。
