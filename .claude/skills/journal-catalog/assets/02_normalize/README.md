# 归一化 JCR 分区文件

本目录下的 `WOS_JCR_*_{学科}_*_normalized.csv` 用于在 UI「期刊数据库管理」中按**学科**显示与筛选分区（Q1–Q4）。API 会按学科名自动匹配本目录下对应归一化文件（日期可不同，如 260218、260301）。

## 已有文件

- **Sociology**：`WOS_JCR_260218_Sociology_260218_normalized.csv`  
  选学科「Sociology」时，可按分区筛选。
- **Anthropology**：`WOS_JCR_260301_Anthropology_260301_normalized.csv`  
  选学科「Anthropology」时，可按分区筛选。
- **Economics**：`WOS_JCR_260301_Economics_260301_normalized.csv`  
  选学科「Economics」时，可按分区筛选。

## 为其他学科（如 Economics）增加分区

1. 在 Web of Science JCR 中按**学科（Category）**导出该学科的期刊列表（与现有 Sociology 导出方式一致）。
2. 将导出 CSV 归一化为与 Sociology 相同的列结构（至少包含 `issn_print` / `issn_e`、`quartile` 等），保存到本目录。
3. **文件名规则**：`WOS_JCR_{日期}_{学科名}_{日期}_normalized.csv`  
   - 学科名与 SSCI 完整目录中的「学科」一致，空格、逗号等替换为下划线。  
   - 例如经济学：`WOS_JCR_260301_Economics_260301_normalized.csv`  
   - 例如 Business, Finance：`WOS_JCR_260301_Business_Finance_260301_normalized.csv`
4. 保存后，在 UI 中选择该学科即可按分区筛选。

参考现有归一化文件的表头与格式。

---

## 让新学科参与「文献检索」（OpenAlex 解析期刊列表）

若要让某学科（如 Anthropology、Economics）的期刊也进入文献检索用的 `journals.yml`（带 OpenAlex source ID，可被 journal-search 使用），需执行：

1. **Sync**：从本目录的归一化 CSV 生成 `references/sources/journals_ssci_{学科小写}_q1_*.yml`（仅 SSCI + Q1）  
   ```bash
   node .claude/skills/journal-catalog/scripts/synchronize/sync_ssci_sociology_q1.mjs \
     --input .claude/skills/journal-catalog/assets/02_normalize/WOS_JCR_260301_Anthropology_260301_normalized.csv \
     --prefix journals_ssci_anthropology_q1 \
     --category ANTHROPOLOGY
   ```
2. **Merge**：将 sources 合并进主表  
   ```bash
   node .claude/skills/journal-catalog/scripts/merge/merge_journals.mjs
   ```
3. **Resolve OpenAlex**：为尚未解析的期刊补全 `openalex_source_id`  
   ```bash
   node .claude/skills/journal-catalog/scripts/synchronize/resolve_openalex_sources.mjs
   ```

完成后，UI 中「OpenAlex解析…期刊目录」会包含该学科，文献检索也会在这些期刊中搜论文。
