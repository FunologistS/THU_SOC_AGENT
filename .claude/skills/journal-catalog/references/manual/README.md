# manual（可选覆盖）

本目录为**可选**。3_merge_journals.mjs 会读取此处所有 `.yml` / `.yaml`，与 sources 合并时**优先采用 manual 中的字段**（同刊按 ISSN/eISSN/name 匹配后覆盖）。

- **留空**：不放入任何文件即可，merge 照常只合并 sources。
- **需要时**：放入期刊列表 yml（结构同 sources，含 `journals:` 数组），用于：
  - 添加不在 JCR 中的期刊
  - 覆盖某刊的 site、notes、openalex_source_id 等
