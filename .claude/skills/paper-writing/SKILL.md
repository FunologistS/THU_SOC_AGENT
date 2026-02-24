---
name: paper-writing
description: 当用户需要将 PDF/Word 转为 Markdown、管理写作样本（academic/colloquial），或将 outputs/<topic>/05_report 下的报告（优先 chunks）按指定学术写作风格改写成成段落综述（review）时使用。包含脚本 input_to_md.mjs（转录）与 writing_under_style.mjs（仿写改写、断点续跑、merge-only）。
---

# Paper Writing（写作管线：转录 → 风格化改写）

本 Skill 用于把外部文档（PDF / DOCX）纳入项目写作资源库，并基于写作样本把结构化报告改写为**成段落、可直接用于综述（review）的正文**。

覆盖两个核心动作：

1. **转录入库**：PDF / DOCX → Markdown（沉淀写作样本或原始材料）
2. **风格化改写**：按 `references/academic` 的样本文风，将 `05_report` 的报告（优先 chunks）改写并合并为综述

---

## 1）目录与命名约定

### 1.1 paper-writing 内部结构（推荐）

    .claude/skills/paper-writing/
    ├── SKILL.md
    ├── scripts/
    │   ├── input_to_md.mjs
    │   └── writing_under_style.mjs
    ├── assets/
    │   ├── academic/        # 学术写作样本原始输入（pdf/docx）
    │   └── colloquial/      # 口语/社交写作样本原始输入（pdf/docx）
    └── references/
        ├── academic/        # 学术写作样本的 Markdown（风格库）
        └── colloquial/      # 口语写作样本的 Markdown（风格库）

### 1.2 项目 outputs 相关结构（由上游流程生成/被本 Skill 消费）

- 报告输入（推荐：chunk 模式输入）：
  - `outputs/<topic>/05_report/chunks/*.md`

- 报告输入（回退：单文件模式输入）：
  - `outputs/<topic>/05_report/report_latest.md`

- 风格化改写输出（自动建目录）：
  - `outputs/<topic>/06_review/review_YYYYMMDD_vN.md`
  - `outputs/<topic>/06_review/review_latest.md`（自动更新，指向最新版本）
  - `outputs/<topic>/06_review/chunks_styled/*.md`（chunk 模式的中间产物，用于断点续跑/merge-only）

> 注：`writing_under_style.mjs` 会按日期生成版本号（vN），并同时维护 `review_latest.md`。

---

## 2）快速开始（两条命令搞定）

### 2.1 转录：PDF/Word → Markdown（input_to_md.mjs）

#### 情况 A：终端在项目根目录 THU_SOC_AGENT/

    node .claude/skills/paper-writing/scripts/input_to_md.mjs <输入> <输出.md>

#### 情况 B：终端在 paper-writing/scripts 下

    node input_to_md.mjs <输入> <输出.md>

---

## 3）input_to_md.mjs：路径规则（非常关键）

### 3.1 输入/输出参数解析规则

- 当 `<输入>` 或 `<输出>` 是绝对路径，或以 `./` 或 `../` 开头：相对当前 cwd 解析（或直接使用绝对路径）
- 否则：
  - `<输入>` 相对 `.claude/skills/paper-writing/assets/` 解析
  - `<输出>` 相对 `.claude/skills/paper-writing/references/` 解析

### 3.2 自动归档规则

脚本会根据“输入文件路径”自动决定输出目录：

- 输入路径包含 `/academic/` → 输出自动落入 `references/academic/`
- 输入路径包含 `/colloquial/` → 输出自动落入 `references/colloquial/`

> 这意味着：你即使把 `<输出>` 写成一个简单文件名，最终也会按输入来源自动归档到对应 references 子目录。

### 3.3 推荐用法示例

1）把 `assets/academic` 下的 docx 转成 `references/academic` 的 md（推荐）

    node .claude/skills/paper-writing/scripts/input_to_md.mjs academic/academic-2a-tsyzm.docx academic-2a-tsyzm.md

2）把 `assets/colloquial` 下的 docx 转成 `references/colloquial` 的 md

    node .claude/skills/paper-writing/scripts/input_to_md.mjs colloquial/wechat-style.docx wechat-style.md

3）绝对路径输入（若绝对路径不含 academic/colloquial 关键词，则不会触发自动归档）

    node .claude/skills/paper-writing/scripts/input_to_md.mjs "/Users/you/Desktop/sample.docx" "./sample.md"

---

## 4）风格化改写：05_report → 段落综述 review（writing_under_style.mjs）

### 4.1 两种模式（自动选择）

- **Chunk 模式（优先）**  
  条件：存在 `outputs/<topic>/05_report/chunks/*.md`  
  行为：逐 chunk 调用模型改写 → 写入 `06_review/chunks_styled/` → 再合并为最终综述  
  目的：降低超时/网关 520，支持断点续跑

- **Single-doc 模式（回退）**  
  条件：不存在 chunks，或你显式传入一个 `.md` 作为输入  
  行为：一次性把整篇报告改写成综述

> 规则：只要你显式传了 `<input.md>`，就**强制 single-doc**（避免“惊讶地走 chunk”）。

---

### 4.2 默认运行（不传参）

默认 topic 为 `artificial_intelligence`；优先 chunks，否则读 `report_latest.md`。

    node .claude/skills/paper-writing/scripts/writing_under_style.mjs

输出到：

- `outputs/artificial_intelligence/06_review/review_YYYYMMDD_vN.md`
- 并更新 `outputs/artificial_intelligence/06_review/review_latest.md`

---

### 4.3 指定 topic（推荐做法）

    node .claude/skills/paper-writing/scripts/writing_under_style.mjs <topic>

例如：

    node .claude/skills/paper-writing/scripts/writing_under_style.mjs artificial_intelligence

---

### 4.4 强制 single-doc：指定输入报告路径

    node .claude/skills/paper-writing/scripts/writing_under_style.mjs outputs/<topic>/05_report/report_latest.md

也可用绝对路径或 `./ ../` 相对路径（按脚本规则解析）。

---

### 4.5 覆盖风格样本（两种写法：旧兼容 + 新推荐）

**旧兼容**（位置参数追加风格文件名）：

    node .claude/skills/paper-writing/scripts/writing_under_style.mjs <topic> academic-2a-tsyzm.md academic-2b-qnyj.md

**新推荐**（显式 flag，避免误把其他参数当 style file）：

    node .claude/skills/paper-writing/scripts/writing_under_style.mjs <topic> --style academic-2a-tsyzm.md,academic-2b-qnyj.md

说明：

- 风格文件名默认在 `references/academic/` 下查找
- 若不传任何风格文件，默认加载：
  - `academic-2a-tsyzm.md`
  - `academic-2b-qnyj.md`

---

### 4.6 断点续跑（chunk 模式最关键的稳定性设计）

chunk 模式会将每个改写后的 chunk 写入：

- `outputs/<topic>/06_review/chunks_styled/chunk_*.md`

**再次运行时**：如果某个 chunk 已存在且非空，默认**跳过**（直接复用），避免重复调用 API。

强制重跑所有 chunks：

    node .claude/skills/paper-writing/scripts/writing_under_style.mjs <topic> --force

---

### 4.7 merge-only（只合并，不再调 N 次 chunk API）

适用场景：

- chunk 已经改写完成，但合并阶段 520/失败
- 你只想调整 `MERGE_MAX_CHARS` / `MERGE_MAX_TOKENS` / `FINAL_SMOOTH` 再试

命令：

    node .claude/skills/paper-writing/scripts/writing_under_style.mjs <topic> --merge-only

如果 `chunks_styled` 不在默认位置（例如你改了 OUTPUT_DIR），可指定：

    node .claude/skills/paper-writing/scripts/writing_under_style.mjs <topic> --merge-only --styled-dir outputs/<topic>/06_review/chunks_styled

---

## 5）环境变量（writing_under_style 必读）

### 5.1 必需

- `OPENAI_API_KEY`（必填）

### 5.2 可选（常用）

- `OPENAI_BASE_URL`（默认 `https://api.gptsapi.net/v1`）
- `OPENAI_MODEL`（默认 `gpt-5.2`）
- `TZ`（默认 `America/Los_Angeles`；用于输出文件的 YYYYMMDD，避免 UTC 跨日）
- `OUTPUT_DIR`（默认 `outputs/<topic>/06_review`）

最小可运行示例：

    export OPENAI_API_KEY="你的key"
    node .claude/skills/paper-writing/scripts/writing_under_style.mjs artificial_intelligence

### 5.3 稳定性/质量调参（建议保留默认，出问题再调）

- `MAX_STYLE_CHARS`（默认 1000）：风格样本总字符上限（脚本严格不超限）
- `CHUNK_MAX_CHARS`（默认 16000）：chunk 输入最大字符（超出截断；会补全 ``` 围栏避免结构破坏）
- `CHUNK_MAX_TOKENS`（默认 1800）：chunk 输出上限
- `MERGE_MAX_TOKENS`（默认 6000）：合并输出上限

**关键：MERGE_MAX_CHARS（默认 25000）**  
新版语义为：**合并/单文件阶段的“总 prompt 字符上限”**（style + draft + wrapper 都算），用于降低 520/网关限制概率。

可选：

- `FINAL_SMOOTH=1`：合并后再做一次轻量全局统一润色（额外一次调用）
- `CHUNK_TEMPERATURE`（默认 0.35）
- `MERGE_TEMPERATURE`（默认 0.25）
- `SMOOTH_TEMPERATURE`（默认 0.20）

---

## 6）推荐工作流（最稳、可复用）

1）准备写作样本（一次性沉淀）
- 把要模仿的文章/论文（PDF/DOCX）放入：
  - `.claude/skills/paper-writing/assets/academic/`
- 用 `input_to_md.mjs` 转成 Markdown，沉淀到：
  - `.claude/skills/paper-writing/references/academic/`

2）上游生成 report/chunks（由其他 skill 负责）
- 推荐确保存在：
  - `outputs/<topic>/05_report/chunks/*.md`
- 若没有 chunks，也至少要有：
  - `outputs/<topic>/05_report/report_latest.md`

3）风格化改写（优先 chunk）
- 运行 `writing_under_style.mjs <topic>`
- 在 `outputs/<topic>/06_review/` 取得：
  - `review_YYYYMMDD_vN.md` + `review_latest.md`

4）失败/520 的“最小代价恢复”
- 如果 chunk 阶段失败：重跑（会跳过已完成的 chunks）
- 如果 merge 阶段失败：用 `--merge-only`，并把 `MERGE_MAX_CHARS` 调小再试

---

## 7）常见坑（按这个排查，基本都能定位）

### 7.1 “找不到脚本 / Cannot find module …”
- 如果你已经 `cd .claude/skills/paper-writing/scripts`：
  - ✅ 正确：`node writing_under_style.mjs ...`
  - ❌ 错误：`node .claude/skills/paper-writing/scripts/writing_under_style.mjs ...`
  因为路径会重复。

### 7.2 review 日期不对（跨日/变成明天）
- 新版默认用 `TZ=America/Los_Angeles` 生成日期。
- 若你机器环境设置过别的 `TZ`，会影响输出命名。
- 解决：显式 `export TZ=America/Los_Angeles`。

### 7.3 merge-only 说找不到 chunks_styled
- 默认读取：`OUTPUT_DIR/chunks_styled`
- 如果你跑 chunk 时设置过 `OUTPUT_DIR`，merge-only 也要用同一个 OUTPUT_DIR
- 或者直接用：`--styled-dir <实际目录>`

### 7.4 输出目录不对
- 默认：`outputs/<topic>/06_review`
- 若你设置 `OUTPUT_DIR` 覆盖，则所有产物都会写到那里（包括 chunks_styled 与 review_latest）
- 排查：看脚本启动日志里的 `OUTPUT_DIR:` 行

### 7.5 520/504/429（网关/限流）
- 优先动作：
  1）chunk 模式跑（比 single-doc 稳定）
  2）合并阶段失败：`--merge-only` + 调小 `MERGE_MAX_CHARS`（例如 18000 或 12000）
  3）必要时把 `CHUNK_TEMPERATURE/MERGE_TEMPERATURE` 下调（更稳更一致）

---

## 8）触发建议（给智能体：什么时候应该用这个 Skill）

当用户提出以下需求，优先触发 paper-writing：

- “把这份 PDF/Word 转成 markdown / 变成可引用的 md”
- “把我的写作样本沉淀成 references/academic 里的风格库”
- “用我之前的文章风格，把 report/chunks 改写成综述段落”
- “不要列表，要成段落、像论文综述那样写”
- “我 merge 阶段 520 了，别重跑 chunks，帮我 merge-only”

---

## 9）可选扩展（不影响当前使用）

- 增加 `references/academic/index.yml`：把“风格组合”命名（如 `qnyj_combo: [a.md,b.md]`），并在脚本中按 `--style-set qnyj_combo` 读取
- 为 `input_to_md.mjs` 扩展：支持 `.md` 直接入库、`.txt` 清洗入库
- 对 `writing_under_style.mjs` 增加 `--concurrency N`（并发改写 chunks，限制 2/3 防止网关爆）