# 归一化 JCR 分区文件

本目录下的 `WOS_JCR_260218_*_260218_normalized.csv` 用于在 UI「期刊数据库管理」中按**学科**显示与筛选分区（Q1–Q4）。

## 已有文件

- **Sociology**：`WOS_JCR_260218_Sociology_260218_normalized.csv`  
  选学科「Sociology」时，可按分区筛选。

## 为其他学科（如 Economics）增加分区

1. 在 Web of Science JCR 中按**学科（Category）**导出该学科的期刊列表（与现有 Sociology 导出方式一致）。
2. 将导出 CSV 归一化为与 Sociology 相同的列结构（至少包含 `issn_print` / `issn_e`、`quartile` 等），保存到本目录。
3. **文件名规则**：`WOS_JCR_260218_{学科名}_260218_normalized.csv`  
   - 学科名与 SSCI 完整目录中的「学科」一致，空格、逗号等替换为下划线。  
   - 例如经济学：`WOS_JCR_260218_Economics_260218_normalized.csv`  
   - 例如 Business, Finance：`WOS_JCR_260218_Business_Finance_260218_normalized.csv`
4. 保存后，在 UI 中选择该学科即可按分区筛选。

参考现有 `WOS_JCR_260218_Sociology_260218_normalized.csv` 的表头与格式。
