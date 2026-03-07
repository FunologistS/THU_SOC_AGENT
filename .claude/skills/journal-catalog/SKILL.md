---
name: journal-catalog
description: 维护并治理多学科社会科学期刊主注册表 references/system/journals.yml（社会学、经济学、传播学等）。当用户需要新增或更新期刊、基于新上传的 normalized 与解析过的 sources 自动补充到 journals.yml、刷新 OpenAlex Source ID、规范化期刊主页 URL（含 OUP 修复）、合并期刊列表或导出版本化清单时使用本 Skill。
---

# Journal Catalog（期刊数据治理层）

Journal Catalog 是 THU_SOC_AGENT 的**期刊源数据治理层**，面向**多学科社会科学**（社会学、经济学、传播学、管理学、心理学等），维护统一期刊主表供下游文献检索与综合使用。

它管理唯一权威文件：

```
.claude/skills/journal-catalog/references/system/journals.yml
```

所有下游模块（journal-search、paper-summarize）必须仅依赖该文件。

---

# 何时使用本 Skill

当用户出现以下意图时，必须调用本 Skill：

- 新增期刊
- 修改或更新期刊信息
- 刷新 / 解析 OpenAlex Source ID
- 根据 ISSN / eISSN 匹配期刊
- 规范化期刊主页 URL
- 修复 academic.oup.com 根路径问题
- 构建 SSCI / JCR 多学科期刊库（社会学、经济学、传播学等）
- 合并多个期刊列表
- 导出 Markdown 版本期刊清单
- 明确提到 journals.yml
- 新上传了归一化期刊（02_normalize 下 CSV）或解析过的学科列表（references/sources 下 YAML），需要让智能体/新增检索接上

当用户只是：

- 抓取论文
- 总结论文
- 做数据分析

不要使用本 Skill。

---

# 核心数据契约

## 主文件

```
references/system/journals.yml
```

该文件是唯一 source of truth。

任何修改必须：

- 保持结构稳定
- 不破坏字段语义
- 不随意删除已有字段

---

# 数据结构规范

```yaml
journals:
  - name: string
    short: string
    issn: string
    eissn: string
    site: string
    notes: string
    openalex_source_id: string
    openalex_source_display_name: string
    # 以下由 2_sync 从归一化 CSV 带入，3_merge 保留，解析学科期刊应有完整信息
    quartile: string          # 单学科时的分区；多学科时以最后一次合并来源为准，仅作参考
    jif: string               # 期刊影响因子
    jci: string               # 期刊引证指标
    oa_citable_pct: string    # OA 可引用占比
    total_citations: string   # 总被引
    source_categories: []     # 按学科的分区，如 ["Sociology Q1", "Economics Q2"]，同刊多学科时各学科分区不同可在此完整展示
```

字段约束：

- openalex_source_id 必须为完整 URL（https://openalex.org/Sxxxx）
- site 必须为 https
- issn / eissn 不带连字符
- short 必须简洁且唯一
- 不得根据名称猜测 OpenAlex ID

**多学科分区展示**：同一期刊在不同 WOS 学科下分区可能不同（如社会学 Q1、经济学 Q2）。合并时 `source_categories` 会汇总各学科的「学科名 + 分区」（如 `["Sociology Q1", "Economics Q2"]`）。API（journals-by-discipline）与 6_export_to_md 导出均会暴露/使用该字段，便于按学科显示分区。

---

# 命名约定（本地 vs WOS）

本仓库中**学科/文件名**有时用自定义简称，与 WOS/JCR 官方学科名不一致。处理数据或排查 count=0、重复 prefix 时，以本节为准。

| 本地命名（文件名/slug/prefix） | 规范展示名（统一用于脚本、数据库、检索选项） | 说明 |
|-------------------------------|---------------------------------------------|------|
| **Interdisciplinary** | Interdisciplinary | **Social Sciences, Interdisciplinary**（含逗号）。归一化 CSV 若未对含逗号字段加引号，会列错位导致 2_sync 得到 0 条。 |
| **industrial_relations_labor** | **Industrial Relations and Labor** | WOS 为 Industrial Relations & Labor。脚本、3_merge、API、UI 一律用规范名，避免 0 条。 |
| **area_asian_studies** / Area_and_Asian_Studies | **Area and Asian Studies** | 一份导出包含 AREA STUDIES + ASIAN STUDIES；统一展示名避免多处表述不一。 |
| **environmental_studies** | **Environmental Studies** | 与 WOS 一致，统一书写。 |
| **public_administration** | **Public Administration** | 与 WOS 一致，统一书写。 |
| **urban_studies** | **Urban Studies** | 与 WOS 一致，统一书写。 |
| **women_studies** | **Women's Studies** | 文件名/slug 无撇号；API/UI 展示与匹配均用 “Women's Studies”。 |

**六学科统一**：Industrial Relations and Labor、Area and Asian Studies、Environmental Studies、Public Administration、Urban Studies、Women's Studies 在脚本（2_sync、3_merge）、journals.yml 的 source_categories、API 学科列表、检索选项中**全部使用上述规范名**，避免检索失败与期刊数为 0。

**多学科一致、避免 0 条**：UI 与 API 以 `journals.yml` 的 `meta.inputs`（count>0）为**新增检索**学科列表来源，并对 WOS 名与规范名做规范化匹配。

**建议**：新增学科或改用自定义文件名时，在本表或 `assets/02_normalize/README.md` 中补一笔「本地名 ↔ WOS 名」，避免后续 sync/merge 或排查时误解。

---

# 执行模型

本 Skill 的脚本均在 `scripts/` 下，按数字顺序对应主流程步骤（项目根或 journal-catalog 根执行）：

| 步骤 | 脚本 | 作用 |
|------|------|------|
| 1 | `scripts/1_norm_WOS_JCR.mjs` | JCR 原始 CSV → 归一化 CSV（02_normalize） |
| 2 | `scripts/2_sync_ssci_q1q4.mjs` | 归一化 CSV → 各学科 source YAML（references/sources） |
| 3 | `scripts/3_merge_journals.mjs` | sources + manual → journals.yml + 合并快照 |
| 4 | `scripts/4_resolve_openalex_sources.mjs` | 为 journals.yml 补全 openalex_source_id / site |
| 5 | `scripts/5_norm_journal_sites.mjs` | 规范化 journals.yml 中的 site（可选） |
| 6 | `scripts/6_export_to_md.mjs` | 导出 Markdown（可选） |

**执行后 journals.yml 的预期**：

- **解析学科期刊的完整信息**：2_sync 从归一化 CSV 带入 quartile、jif、jci、oa_citable_pct、total_citations，3_merge 写入 journals.yml，故解析学科中的期刊应带 JIF、分区、OA 等。
- **OpenAlex**：由 4_resolve 按 ISSN 请求 OpenAlex 写回；**重跑 3_merge 时会保留已有 journals.yml 中的 openalex_source_id / openalex_source_display_name / site**，不会因再次合并而清空。
- **Q1–Q4 全有**：2_sync 只保留 SSCI 且 quartile 为 Q1–Q4 的行；若 journals.yml 里某学科只有 Q1，说明该学科的**归一化 CSV（或原始 JCR 导出）本身只含 Q1**。要在 journals.yml 中拥有 Q1–Q4，需在 JCR 导出该学科时勾选/导出全部四分位，再跑 1_norm → 2_sync → 3_merge。

---

# 操作映射表（Intent → Script）

新增或刷新 OpenAlex ID  
→ scripts/4_resolve_openalex_sources.mjs

从 JCR 构建 SSCI Q1–Q4 学科列表（单学科或多学科）  
→ scripts/2_sync_ssci_q1q4.mjs [--input <csv>] [--no-merge]

规范化期刊 site  
→ scripts/5_norm_journal_sites.mjs

修复 OUP 根路径  
→ scripts/5_norm_journal_sites.mjs --fix-oup-root

合并多个期刊列表（将 references/sources 与可选的 references/manual 合并进 journals.yml）  
→ scripts/3_merge_journals.mjs

导出期刊 Markdown  
→ scripts/6_export_to_md.mjs journals

生成 JCR 报告  
→ scripts/6_export_to_md.mjs jcr

---

# URL 规范化策略

对 journals[].site 执行：

- 强制 https
- 删除 fragment (#)
- 删除大部分 query 参数
- 对 Cambridge / Taylor & Francis / Sage 保留必要参数
- 统一 hostname
- 统一 trailing slash 规则
- 处理 OUP legacy 域名：
  `<slug>.oxfordjournals.org`
  → `https://academic.oup.com/<slug>`

---

# OUP 根路径修复机制

若 site 为：

```
https://academic.oup.com/
```

（无法区分具体期刊）

尝试使用：

1. OpenAlex source.homepage_url
2. DOI 结构 fallback（10.1093/<slug>/...）

自动修复为：

```
https://academic.oup.com/<slug>
```

---

# 典型工作流

## 基于新上传的 normalized 与解析内容自动补充 journals.yml

当用户新上传了学科归一化 CSV（放入 `assets/02_normalize`）或已有解析结果（`references/sources` 下 `journals_ssci_*_q1_*.yml`），需要让 **journals.yml** 接上、使智能体/新增检索能用到这些期刊时，按顺序执行：

1. **归一化（若尚未做）**  
   若只有 raw JCR 导出，先运行 `scripts/1_norm_WOS_JCR.mjs`，使 `assets/02_normalize` 下出现对应学科的 `*_normalized.csv`。

2. **同步生成/更新 sources**  
   运行 `scripts/2_sync_ssci_q1q4.mjs`（多学科默认；或 `--input <csv>` 单学科），从 02_normalize 的 CSV 生成或更新 `references/sources/journals_ssci_<学科>_q1_<日期>_vN.yml`（含期刊列表；OpenAlex 由 resolve 后续补全）。

3. **合并进主表**  
   运行 **`scripts/3_merge_journals.mjs`**（在 journal-catalog 技能根目录或项目根执行）。该脚本会：
   - 读取 `references/sources`（按 prefix 取每学科最新一份）、可选的 `references/manual`；
   - 按 ISSN/eISSN/name 去重合并，manual 覆盖 sources（有则优先）；
   - 将结果写回 **`references/system/journals.yml`**，并生成版本快照 `journals_merged_<YYYYMMDD>_vN.yml`。

4. **补全 OpenAlex 与 URL**  
   - 运行 `scripts/4_resolve_openalex_sources.mjs`，为 journals.yml 中缺失的 `openalex_source_id` 按 ISSN/eISSN 解析并回写；
   - 视需要运行 `scripts/5_norm_journal_sites.mjs`（及 `--fix-oup-root`），规范化 `site`。

5. **导出（可选）**  
   需要 Markdown 清单时运行 `scripts/6_export_to_md.mjs journals`（第 6 步，可选）。

完成后，`references/system/journals.yml` 即包含新学科/新期刊，下游（如 UI 新增检索、journal-search）即可按学科与分区使用这些期刊。

---

## 构建多学科社会科学期刊库

本 Skill 维护的是**多学科** SSCI/JCR 期刊主表（社会学、经济学、传播学、管理学、心理学、人口学、公共行政、环境/城市/妇女研究等），不是单一「Sociology Q1」库。典型流程：

1. 运行 1_norm_WOS_JCR.mjs
2. 运行 2_sync_ssci_q1q4.mjs（多学科则无参数；单学科则 --input <csv>）
3. 运行 **3_merge_journals.mjs**（将 sources 合并进 journals.yml）
4. 运行 4_resolve_openalex_sources.mjs
5. 运行 5_norm_journal_sites.mjs --fix-oup-root（可选，规范化 site）
6. 导出 Markdown（可选）

---

# 数据流与脚本说明

**数据流**：`assets/01_raw/*.csv` → **1_norm_WOS_JCR** → `assets/02_normalize/*_normalized.csv` → **2_sync_ssci_q1q4** → `references/sources/*.yml` →（+ 可选 `references/manual`）**3_merge_journals** → `references/system/journals.yml`；随后可运行 **4_resolve_openalex_sources**（补全 OpenAlex）、**5_norm_journal_sites**（规范化 site，可选）、**6_export_to_md**（导出 Markdown，可选）。下游（journal-search、UI）只读 `references/system/journals.yml`。

**各脚本简要**：  
- **1_norm_WOS_JCR.mjs**：JCR 原始 CSV → 统一列名的归一化 CSV（输入 01_raw，输出 02_normalize）。  
- **2_sync_ssci_q1q4.mjs**：归一化 CSV → 每学科一份 source YAML（SSCI Q1–Q4）；可 `--no-merge` 不跑 merge。  
- **3_merge_journals.mjs**：sources + 可选 manual → 去重合并写回 journals.yml 并打快照。  
- **4_resolve_openalex_sources.mjs**：读 journals.yml，按 ISSN 调 OpenAlex 补全 openalex_source_id、site，写回原文件。  
- **5_norm_journal_sites.mjs**：读 journals.yml，规范化每条 site（https、OUP 映射等），写回；可选 `--fix-oup-root`。  
- **6_export_to_md.mjs**：只读，导出 journals 或 JCR 报告为 Markdown（可选）。

**推荐执行顺序（从 JCR 更新）**：1_norm_WOS_JCR（每学科一次）→ 2_sync_ssci_q1q4 → 3_merge_journals → 4_resolve_openalex_sources → 5_norm_journal_sites（可选）→ 6_export_to_md journals（可选）。若只改 manual 或少量期刊：改 manual 或 journals.yml 后运行 3_merge_journals（若动了 manual）、4_resolve、5_norm_sites（可选）。

**不对齐时排查**：确认下游只读 `references/system/journals.yml`；缺 OpenAlex ID 时跑 4_resolve 看 MISS/ERR；同刊重复或合并错时查 sources/manual 中 issn/eissn/name 是否一致；site 或 OUP 根路径问题跑 5_norm_journal_sites --fix-oup-root。

---

## 手动新增期刊

1. 编辑 journals.yml
2. 运行 4_resolve_openalex_sources.mjs
3. 运行 5_norm_journal_sites.mjs（可选）
4. 导出 Markdown（可选）

---

# 输出规则

所有修改型操作必须：

- 保持 YAML 结构完整
- 不进行隐式删除
- 在适用场景下生成版本化快照
- 保证重复运行结果不变（幂等性）

---

# 错误处理规则

OpenAlex 查询失败时：

- 不删除已有 openalex_source_id
- 输出 warning
- 保留原数据

ISSN 不匹配时：

- 优先精确匹配
- 不允许仅凭名称猜测

---

# 幂等性原则

重复运行同一规范化或解析脚本，不应产生额外变化。

---

# 下游依赖

```
journal-catalog
    ↓
journal-search
    ↓
paper-summarize
```

journal-search 强依赖：

```
openalex_source_id
```

若该字段缺失或错误，下游抓取将失败。

---

# 期刊数据库与新增检索（UI 约定）

本 Skill 对应的 UI 有两处入口，数据范围必须区分清楚：

| 入口 | 数据范围 | 说明 |
|------|----------|------|
| **期刊数据库** | **完整 SSCI 期刊（约 3540 本）** | **列表**始终参考 `assets/01_raw/WOS_SSCI_260216.csv` 全量；有 raw 时必须用 raw 全量，不得用 journals.yml 替代列表。学科下拉为 raw 涉及的完整 SSCI 学科。**点击**某刊时：若该刊属于已解析的 14 个学科（在 `references/system/journals.yml` 中有记录），则详情与分区等使用 journals.yml 的详细数据（各学科分区 source_categories、OpenAlex、JIF 等）；否则仅展示 raw 带来的基本信息。 |
| **新增检索 / 技能工作台「重新检索」** | **仅已解析学科** | 学科下拉与期刊列表仅来自「已解析」学科（journals.yml meta.inputs 中 count>0 的 source）。用户只能在这些学科下选刊并开始检索，以保证检索使用 openalex_source_id。 |

实现要点：

- **期刊数据库**：列表与学科来源为 `/api/journals-wos`。**有 raw（WOS_SSCI_260216.csv）时**必须用 raw 全量列表（约 3540 本），API 内部按 ISSN 用 journals.yml 补充已解析期刊的 source_categories、JCR 等；无 raw 时才退化为 journals.yml 全量或单学科 CSV。
- 新增检索：学科列表与期刊列表仅来自 `/api/journals-by-discipline`（即 meta.inputs 中的 source），不展示未解析学科。

---

# 设计原则

- 单一权威注册表
- 明确分层职责
- 精确匹配优先
- URL 是治理对象，不是装饰字段
- 输出可版本化、可审计
- 操作必须可复现

---

# 边界声明

本 Skill 仅负责期刊元数据治理。

不负责：

- 抓取论文
- 论文摘要
- 数据分析
- 下游模块逻辑

---

# 核心职责

Journal Catalog 解决的问题不是“找论文”。

它保证：

在找论文之前，  
期刊集合是准确、稳定、可追溯的。
