# THU_SOC_AGENT Skills 体系总览

本目录下的 5 个 Skill 构成一条**社会学文献管线**：从期刊治理 → 抓取 → 摘要 → 聚类与概念合成 → 风格化写作，数据与产出按 `outputs/<topic>/` 分层、版本化。

---

## 管线结构（数据流）

```
journal-catalog         期刊数据治理层
    │
    │  journals.yml (唯一权威)
    ▼
journal-search          数据采集层
    │
    │  outputs/<topic>/01_raw/papers_*.md
    │  (可选) 02_clean 由 paper-summarize/filter 产出
    ▼
paper-summarize         摘要与清洗层
    │
    │  outputs/<topic>/03_summaries/summaries_*.md
    ▼
literature-synthesis    文献合成层
    │  synthesize.mjs        → 04_meta (聚类、简报、统计)
    │  concept_synthesize_*  → 05_report (概念报告 + 附录)
    ▼
paper-writing           写作管线
    │  writing_under_style   → 06_review (段落综述、chunks_styled)
    │  input_to_md           → references (转录样本)
    ▼
  综述定稿 (06_review/review_*.md)
```

---

## 各 Skill 职责与触发场景

| Skill | 职责 | 何时使用 |
|-------|------|----------|
| **journal-catalog** | 维护 `references/system/journals.yml`；刷新 OpenAlex ID、规范化 URL、合并列表、导出版本化清单 | 新增/更新期刊、修 ISSN/站点、建 SSCI Q1 库、明确提到 journals.yml |
| **journal-search** | 按期刊清单在 OpenAlex 检索主题论文，可选补全摘要；输出 01_raw | 按社会学期刊抓某一主题、建文献库、监测期刊动态 |
| **paper-summarize** | 论文表格 → 结构化摘要；可选 02_clean 过滤后再摘要 | 生成摘要文档、为 synthesis 准备 03_summaries |
| **literature-synthesis** | 聚类 + 概念提炼；synthesize → 04_meta，concept_synthesize → 05_report | 做主题聚类、写概念报告与简报、为综述提供结构化报告 |
| **paper-writing** | PDF/DOCX→Markdown 转录；按学术样本文风将 05_report/chunks 改写为段落综述 → 06_review | 转录入库、把报告改写成可发表的综述段落 |

---

## 输出目录约定 (outputs/<topic>/)

| 目录 | 主要产出 | 负责 Skill |
|------|----------|------------|
| `01_raw/` | papers_YYYYMMDD_vN.md | journal-search |
| `02_clean/` | 过滤/清洗后的论文表（可选） | paper-summarize/filter |
| `03_summaries/` | summaries_*.md, summaries_latest.md | paper-summarize |
| `04_meta/` | meta_*, briefing_*, *_cluster_*.csv | literature-synthesis (synthesize.mjs) |
| `05_report/` | report_*.md, chunks/*.md, concept_appendix_*.md | literature-synthesis (concept_synthesize_*) |
| `06_review/` | review_*.md, chunks_styled/*.md | paper-writing |

---

## 依赖关系

- **journal-search** 强依赖 **journal-catalog** 的 `journals.yml` 及每条记录的 `openalex_source_id`。
- **paper-summarize** 输入来自 01_raw 或 02_clean。
- **literature-synthesis** 输入为 03_summaries + 04_meta 的上一阶段产出。
- **paper-writing** 输入为 05_report（优先 chunks，否则 report_latest.md），风格样本来自本 Skill 的 references。

---

## 推荐端到端流程

1. 维护期刊表：`journal-catalog`（按需）
2. 抓取论文：`journal-search <topicSlug>`
3. 摘要：`paper-summarize`（可选先 filter）
4. 聚类与概念报告：`literature-synthesis`（synthesize → concept_synthesize）
5. 风格化综述：`paper-writing`（writing_under_style）

整体上，**已经形成体系**：数据契约清晰（journals.yml → 01_raw → … → 06_review），上下游在各自 SKILL.md 中均有说明，可按上表与流程图按需选用或串联。
