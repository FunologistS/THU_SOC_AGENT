---
name: journal-search
description: 当用户希望按社会学或相关社会科学期刊清单批量抓取某一主题的论文、构建文献数据库或监测期刊研究动态时使用。本工具基于 OpenAlex 检索论文，并可选择性补全缺失摘要（支持网页抓取与 Firecrawl 兜底），输出为带日期版本号的 Markdown 数据集。
---

# Journal Search（社会学期刊定向文献抓取）

当用户提到以下意图时，优先调用本 Skill：

- 构建社会学主题文献数据库  
- 批量抓取某一主题在社会学期刊中的论文  
- 监测核心期刊的研究动态  
- 基于指定期刊清单抓取论文  
- 为下游摘要或主题分析准备结构化数据  

本 Skill 是“社会学智能体”的数据采集层（retrieval layer）。

它用于：

- 按“社会学核心期刊清单”检索某一主题的论文  
- 构建可复现的社会学主题文献数据库  
- 输出结构化 Markdown 数据集供下游技能使用  
- 在需要时补全缺失摘要（HTML 抓取 + Firecrawl 兜底）  

---

## 一、期刊清单说明

默认读取期刊清单路径：

.claude/skills/journal-catalog/references/system/journals.yml

该文件必须满足：

- 顶层字段为 `journals:`  
- 每条期刊包含 `openalex_source_id`（形如 https://openalex.org/Sxxxxx）  

OpenAlex 检索通过 `primary_location.source.id` 进行期刊过滤，确保抓取结果严格来自指定期刊集合。

---

## 二、调用方式

基本用法：

    node .claude/skills/journal-search/scripts/run.mjs <topicSlug>

示例：

    node .claude/skills/journal-search/scripts/run.mjs artificial_intelligence

说明：

- topicSlug 用于生成输出目录名（建议使用下划线，如 artificial_intelligence）  
- 实际检索 query 会自动将下划线替换为空格  

如需显式指定期刊清单路径：

    node .claude/skills/journal-search/scripts/run.mjs artificial_intelligence \
      --journals .claude/skills/journal-catalog/references/system/journals.yml

---

## 三、输出结构

每次运行会先搭建该 topic 的完整目录树（若不存在），再写入 01_raw：

    outputs/<topicSlug>/01_raw/
    outputs/<topicSlug>/02_clean/
    outputs/<topicSlug>/03_summaries/
    outputs/<topicSlug>/04_meta/
    outputs/<topicSlug>/05_report/
    outputs/<topicSlug>/06_review/

论文表写入 01_raw，并同步更新 `papers_latest.md` 供下游（如 paper-summarize）使用：

    outputs/<topicSlug>/01_raw/papers_<YYYYMMDD>_vN.md
    outputs/<topicSlug>/01_raw/papers_latest.md

文件命名规则：

    papers_<YYYYMMDD>_vN.md

示例：

    outputs/artificial_intelligence/01_raw/papers_20260220_v1.md

每次运行都会生成带版本号的新文件，不覆盖历史版本。

输出字段包括：

- journal（期刊简称 / 期刊名）  
- year  
- title  
- DOI  
- OpenAlex 链接  
- abstract  

---

## 四、摘要补全机制（两阶段模式）

本 Skill 支持两种运行模式：

### 1）默认模式（推荐第一轮使用）

- 仅使用 OpenAlex 提供的 abstract  
- 不抓取 publisher 页面  
- 速度快，适用于测试关键词召回情况与期刊响应分布  

运行方式：

    node .claude/skills/journal-search/scripts/run.mjs artificial_intelligence

---

### 2）补摘要模式（慢）

当 OpenAlex 未提供摘要时：

1. 尝试抓取期刊 landing page 的 abstract  
2. 若仍为空，且已配置 FIRECRAWL_API_KEY，则使用 Firecrawl 兜底  

开启方式：

    ABSTRACT_FALLBACK=1 node .claude/skills/journal-search/scripts/run.mjs artificial_intelligence

如需 Firecrawl 兜底，还需提前设置：

    export FIRECRAWL_API_KEY=你的key

推荐工作流程：

- 第一步：默认模式快速生成 raw 数据  
- 第二步：确认主题与期刊有效后，再开启 ABSTRACT_FALLBACK 进行摘要补全  

---

## 五、关键词建议

在社会学核心期刊中，以下关键词通常比泛泛的 “AI” 更容易召回有效文献：

- generative AI  
- large language model  
- algorithmic management  
- platform labor  
- automation  
- machine learning  

---

## 六、排错提示

1）若检索结果异常为 0，请检查日志中是否出现：

    filter=primary_location.source.id:Sxxxxx

若出现：

- SSxxxxx  
- https://openalex.org/Sxxxxx  

说明 source id 处理存在问题，应修正为单个 S 开头的纯 ID。

2）若运行速度异常缓慢，请确认是否开启了 ABSTRACT_FALLBACK。

默认模式应较快完成抓取。

---

## 七、与下游技能衔接

本 Skill 输出的 01_raw 数据通常作为：

- paper-filter 的输入  
- paper-summarize 的输入  
- 后续主题综合与理论分析的基础数据源  

推荐的整体流程：

journal-catalog → journal-search → paper-filter → paper-summarize → synth
