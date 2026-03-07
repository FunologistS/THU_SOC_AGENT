# 归一化 JCR 分区文件

本目录下的 `WOS_JCR_*_{学科}_*_normalized.csv` 用于在 UI「期刊数据库管理」中按**学科**显示与筛选分区（Q1–Q4）。API 会按学科名自动匹配本目录下对应归一化文件（每学科取最新一份，日期可不同）。

归一化脚本会对 **category** 等含逗号的字段加引号（`csvEscape`），避免解析错位（如 `PSYCHOLOGY, SOCIAL`）。  
若**原始 JCR 导出**里 category 含逗号且未加引号（如 WOS 官方的 "Social Sciences, Interdisciplinary"、"Industrial Relations & Labor"），则 1_norm 读入时可能列错位，导致 2_sync 过滤后 count=0。此时需在归一化 CSV 中把 category 合并为一列并加引号，或从原始导出重新归一化并确保写出的 CSV 对含逗号的 category 做引号包裹。

## 已有学科文件

本目录按学科 slug 保留「最新一份」归一化 CSV，例如：Sociology、Anthropology、Economics、Psychology、Management、Communication、Environmental_Studies、Demography、Urban_Studies、Women_Studies、Public_Administration、Industrial_Relations_and_Labor、Area_and_Asian_Studies、Interdisciplinary 等。选对应学科时即可按分区筛选。

- **Area and Asian Studies**：一份导出包含 WOS 两个学科（AREA STUDIES + ASIAN STUDIES）。写入 `journals.yml` 时按**完整 86 本**（SSCI Q1–Q4），由 UI 按 Q1/Q2/Q3/Q4 分区筛选。
- **Interdisciplinary**：WOS 官方学科名为 **"Social Sciences, Interdisciplinary"**（含逗号）；本地文件名用 `Interdisciplinary` 为自定义简称。若归一化 CSV 中 category 被逗号拆成两列，需合并为一列并加引号后再跑 2_sync，否则会得到 count=0。

## 为其他学科增加分区

1. 在 Web of Science JCR 中按**学科（Category）**导出该学科的期刊列表（与现有 Sociology 导出方式一致）。
2. 用 `scripts/1_norm_WOS_JCR.mjs` 将导出 CSV 归一化为统一列结构（含 `jcr_year,schema,category,edition,journal_name,jcr_abbrev,publisher,issn_print,issn_e,total_citations,jif,quartile,jci,oa_citable_pct`），保存到本目录。
3. **文件名规则**：`WOS_JCR_{日期}_{学科名}_{日期}_normalized.csv`  
   - 学科名与 JCR 学科一致，空格、逗号等替换为下划线。  
   - 例如经济学：`WOS_JCR_260301_Economics_260301_normalized.csv`  
   - 例如 Business, Finance：`WOS_JCR_260301_Business_Finance_260301_normalized.csv`
4. 保存后，在 UI 中选择该学科即可按分区筛选。

参考现有归一化文件的表头与格式。

---

## 让学科参与「文献检索」（OpenAlex 解析期刊列表）

若要让各学科 SSCI 期刊（Q1–Q4）进入文献检索用的 `journals.yml`（带 OpenAlex source ID，可被 journal-search 使用），推荐一次性处理本目录下所有学科：

1. **Sync 全部学科（SSCI Q1–Q4）并 Merge**  
   ```bash
   node .claude/skills/journal-catalog/scripts/2_sync_ssci_q1q4.mjs
   ```
   会按本目录每个学科的最新归一化 CSV 生成 `references/sources/journals_ssci_{学科}_q1_*.yml`（仅 **SSCI + Q1–Q4**），并执行 merge 更新 `references/system/journals.yml`。sync 会从 CSV 带入 **quartile、jif、jci、oa_citable_pct、total_citations**，merge 会写入 journals.yml，故解析学科期刊在 journals.yml 中有完整 JCR 信息。加 `--no-merge` 则只跑 sync 不跑 merge。  
   **若某学科在 journals.yml 中只有 Q1**：说明该学科的归一化 CSV（或原始 JCR 导出）只含 Q1 行；要在 journals.yml 中拥有 Q1–Q4，需在 JCR 导出该学科时勾选全部四分位后再跑 1_norm → 2_sync → 3_merge。

2. **Resolve OpenAlex**（推荐）：为尚未解析的期刊补全 `openalex_source_id` 与 `site`  
   ```bash
   node .claude/skills/journal-catalog/scripts/4_resolve_openalex_sources.mjs
   ```
   之后若再次运行 3_merge（例如新增学科），**已有 OpenAlex 会保留**，不会被覆盖。

**单学科手动 Sync**（需 SSCI + Q1–Q4 且该 CSV 内所有 category 都保留时加 `--all-categories`）：  
```bash
node .claude/skills/journal-catalog/scripts/2_sync_ssci_q1q4.mjs \
  --input .claude/skills/journal-catalog/assets/02_normalize/WOS_JCR_260301_Anthropology_260306_normalized.csv \
  --prefix journals_ssci_anthropology_q1 \
  --all-categories
```

完成后，UI 中「OpenAlex解析…期刊目录」会包含对应学科，文献检索也会在这些期刊中搜论文。
