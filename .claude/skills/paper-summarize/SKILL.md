---
name: paper-summarize
description: 将 journal-search 或 filter 生成的论文表格文件转换为结构化摘要文档，用于后续文献分析与综合。
---

# Paper Summarize

## 一、功能说明

本 Skill 用于将 Markdown 表格格式的论文列表转换为结构化摘要文档。

典型输入来源：

- 管线中「清洗规整」会先运行 filter（01_raw → 02_clean），再运行 summarize；
- summarize 的输入优先使用 02_clean/papers_clean_latest.md，若不存在则回退至 01_raw/papers_latest.md。

文件命名格式：

papers_<YYYYMMDD>_vN.md

当用户希望：

- 生成结构化论文摘要
- 将论文表格转为研究笔记
- 为后续 synthesis 提供中间层数据
- 补抓缺失 abstract

应触发本 Skill。

---

## 二、输入格式要求

输入文件必须包含如下列结构：

| journal | year | title | DOI | OpenAlex | abstract |

若格式不符合，应提示用户重新运行 journal-search 或 filter。

---

## 三、执行流程

1. 确定输入文件：
   - 若提供 --in 参数 → 使用指定文件
   - 否则：
       - 优先使用 02_clean 目录下最新版本文件
       - 若不存在 → 回退至 01_raw

2. 读取输入文件

3. 解析每一行论文数据

4. 为每篇论文生成结构化模板：

   - Research question（默认占位）
   - Data / material（默认占位）
   - Method（默认占位）
   - Key findings（填入 abstract）
   - Contribution（占位）
   - Limitations（占位）

5. 写入输出目录：

   outputs/<topic>/03_summaries/

6. 自动生成版本号并更新 summaries_latest.md

---

## 四、可选功能：补抓摘要

若运行参数包含：

--fillAbstract true

则当 abstract 为空时：

1. 通过 DOI 访问出版商页面
2. 若失败，尝试 OpenAlex

⚠ 注意：此功能依赖外部 API（如 Firecrawl），可能受配额或访问控制限制。

---

## 五、输出结果

主要输出：

outputs/<topic>/03_summaries/summaries_<date>_vN.md

同时更新：

summaries_latest.md

---

## 六、使用示例

基础运行：

node .claude/skills/paper-summarize/scripts/summarize.mjs artificial_intelligence

指定输入文件：

node .claude/skills/paper-summarize/scripts/summarize.mjs artificial_intelligence \
  --in outputs/artificial_intelligence/02_clean/papers_clean_latest.md

补抓摘要：

node .claude/skills/paper-summarize/scripts/summarize.mjs artificial_intelligence --fillAbstract true

---

## 七、设计边界

本 Skill 不负责：

- 年份过滤
- 去重
- 主题分类
- 理论综合
- 聚类分析

其输出是供下游 literature-synthesis Skill 使用的中间层结构数据。

---

## 八、确定性说明

在相同输入文件和参数条件下，本 Skill 输出应保持一致。