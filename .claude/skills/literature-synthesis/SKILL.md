---
name: literature-synthesis
description: >
  本工具用于文献合成，通过聚类分析和概念提炼，为社会学领域的研究生成结构化的研究报告和简报。通过整合聚类结果、文献摘要和简报内容，生成清晰的概念合成报告，支持进一步的文献综述和理论分析。
---

# Literature Synthesis（文献合成）

当用户希望进行基于聚类的文献合成、生成研究报告和简报时，可以使用本工具。本工具将对聚类结果进行概念性提炼，结合简报内容和论文摘要，为用户提供结构化的研究合成报告。

本 Skill 是“社会学智能体”的文献合成层（literature synthesis layer）。

它用于：

- 在聚类结果的基础上进行概念合成  
- 提炼聚类主题及研究空白  
- 输出结构化的概念报告  
- 输出附录，展示每篇论文的详细卡片信息（可选）  

---

## 一、synthesize.mjs 输入说明

`synthesize.mjs` 负责从文献摘要中生成聚类和简报，并进行初步的文本清理和特征提取，作为后续概念合成的输入。

### 1）summaries
- 输入文件：`outputs/<topic>/03_summaries/summaries_latest.md`
- 描述：包含每篇论文的结构化摘要，必须是Markdown格式。    
- 必需：是

### 2）输出说明
`synthesize.mjs` 将生成以下输出：

- `outputs/<topic>/04_meta/meta_table_YYYYMMDD_vN.csv` + `meta_table_latest.csv`    
- `outputs/<topic>/04_meta/meta_clusters_YYYYMMDD_vN.md` + `meta_clusters_latest.md`    
- `outputs/<topic>/04_meta/briefing_YYYYMMDD_vN.md` + `briefing_latest.md`    
- `outputs/<topic>/04_meta/qa_report_YYYYMMDD_vN.md` + `qa_report_latest.md`    
- `outputs/<topic>/04_meta/year_cluster_YYYYMMDD_vN.csv` + `year_cluster_latest.csv`    
- `outputs/<topic>/04_meta/journal_cluster_YYYYMMDD_vN.csv` + `journal_cluster_latest.csv`    
- `outputs/<topic>/04_meta/method_cluster_YYYYMMDD_vN.csv` + `method_cluster_latest.csv`    
- `outputs/<topic>/04_meta/data_cluster_YYYYMMDD_vN.csv` + `data_cluster_latest.csv`    
- （可选）`outputs/<topic>/04_meta/k_scan_YYYYMMDD_vN.md` + `k_scan_latest.md`    

---

## 二、concept_synthesize.mjs 输入说明

在 `synthesize.mjs` 输出的基础上，`concept_synthesize.mjs` 将进一步对聚类结果进行概念合成，生成更高层次的报告，聚焦于从聚类中提炼出有意义的主题和研究空白。此工具有两个变种，可以选择不同的模型进行合成：

### 1）meta-clusters
- 输入文件：`outputs/<topic>/04_meta/meta_clusters_latest.md`
- 描述：包含由 `synthesize.mjs` 生成的聚类文件，按主题对文献进行聚类。    
- 必需：是

### 2）briefing
- 输入文件：`outputs/<topic>/04_meta/briefing_latest.md`
- 描述：包含研究背景和聚类分析概览，为概念合成提供上下文信息。    
- 必需：是

### 3）summaries
- 输入文件：`outputs/<topic>/03_summaries/summaries_latest.md`
- 描述：包含每篇论文的结构化摘要，作为概念合成的基础信息。    
- 必需：是

---

## 三、概念合成脚本

### 1）synthesize.mjs

`synthesize.mjs` 是文献聚类的核心工具，负责处理文献摘要，进行文本清洗和聚类分析，生成包括聚类报告、简报和其他统计信息的输出文件。此步骤的输出为 `concept_synthesize.mjs` 提供输入。

基本用法：

```bash
node .claude/skills/literature-synthesis/scripts/synthesize.mjs <topicSlug> \
  --summaries outputs/<topicSlug>/03_summaries/summaries_latest.md \
  --date YYYYMMDD --v N
```

### 2）concept_synthesize.mjs

`concept_synthesize.mjs` 将根据 synthesize.mjs 输出的聚类结果，进一步提炼主题，生成结构化的概念性报告。此工具提供了两个模型选项：

使用 GPT-5.2 模型（默认）：通过 `concept_synthesize_gpt.mjs`，使用 OpenAI 的 GPT-5.2 模型进行概念合成，生成更加流畅和有创意的内容。

使用 GLM 系列模型（例如：glm-4.7-flash）：通过 `concept_synthesize_glm.mjs`，使用 Zhipu 的 GLM 系列模型进行概念合成，适合对中文处理有更好适配的需求。

3）模型选择：通过 --model 参数，用户可以在 `concept_synthesize.mjs` 中选择 GPT 或 GLM 模型。

默认模型为 gpt-5.2。

若需要使用 Zhipu GLM 系列模型（例如 glm-4.7-flash），需要明确指定。

通过这种方式，用户可以根据不同需求选择最适合的模型，并根据聚类结果生成结构化的概念性报告。