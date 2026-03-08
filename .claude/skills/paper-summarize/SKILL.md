---
name: paper-summarize
description: 将 journal-search 或 filter 生成的论文表格文件转换为结构化摘要文档，用于后续文献分析与综合。
---

# Paper Summarize

## 一、功能说明

本 Skill 用于将 Markdown 表格格式的论文列表转换为结构化摘要文档。

典型输入来源：

- 管线中「清洗规整」由入口脚本 1_command.mjs 依次执行：2_clean（01_raw → 02_clean，仅格式规整）、3_summarize（表格 → 03_summaries）；
- 3_summarize 的输入优先使用 02_clean/papers_clean_latest.md，若不存在则回退至 01_raw/papers_latest.md。

文件命名格式：

papers_<YYYYMMDD>_vN.md

当用户希望：

- 生成结构化论文摘要
- 将论文表格转为研究笔记
- 为后续 synthesis 提供中间层数据

应触发本 Skill。

注：补抓缺失摘要请在「批量检索」步骤勾选「摘要补全」；本 Skill 仅基于表格中已有的 abstract 列生成结构化摘要，不在此处再请求外部 API 补抓。

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

## 四、关于补抓摘要

本 Skill 当前**不实现**补抓缺失摘要（即不提供 DOI/OpenAlex/Firecrawl 等请求）。若表格中 abstract 为空，输出中会显示 “No usable abstract.”。需补摘要在**批量检索**（journal-search）时勾选「摘要补全」，由检索脚本写入 01_raw。

---

## 五、输出结果

主要输出：

outputs/<topic>/03_summaries/summaries_<date>_vN.md

同时更新：

summaries_latest.md

---

## 六、使用示例

清洗规整一步到位（入口，仅格式规整 + 生成摘要）：

node .claude/skills/paper-summarize/scripts/1_command.mjs artificial_intelligence

仅生成结构化摘要（需先有 02_clean 或 01_raw）：

node .claude/skills/paper-summarize/scripts/3_summarize.mjs artificial_intelligence \
  --in outputs/artificial_intelligence/02_clean/papers_clean_latest.md

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