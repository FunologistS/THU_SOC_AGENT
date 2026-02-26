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
  - 数据源切换：「示例数据」（mock）/「我的产出」（outputs）。  
  - 主题列表、阶段（01_raw～06_review）与文件列表；点击文件在右侧预览 Markdown。  
  - 「我的产出」下每个文件旁有「删」按钮，点击确认后将该文件**移至系统废纸篓**（可恢复），不永久删除。
- **技能工作台**（左侧下）  
  - 当前主题、变更主题。  
  - 五步层层递进：**批量检索**（01_raw）→ **清洗规整**（02_clean + 03_summaries）→ **主题聚类**（04_meta）→ **荟萃分析**（05_report）→ **文献简报**（06_review）。  
  - 运行日志轮询显示；完成后可跳转「我的产出」查看对应 stage 下的 `*_latest.md`。
- **文档预览**（右侧）：展示所选文件的 Markdown 内容。

与 skills 的对应关系：`journal-search` → 01_raw；`paper-summarize` → 03_summaries；`literature-synthesis`（synthesize / concept_synthesize）→ 04_meta、05_report；`paper-writing`（writing_under_style）→ 06_review。详见 `.claude/skills/README.md`。

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
