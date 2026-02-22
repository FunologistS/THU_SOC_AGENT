---
name: journal-catalog
description: 维护并治理期刊主注册表 references/system/journals.yml。当用户需要新增或更新期刊、刷新 OpenAlex Source ID、规范化期刊主页 URL（含 OUP 修复）、合并期刊列表或导出版本化清单时使用本 Skill。
---

# Journal Catalog（期刊数据治理层）

Journal Catalog 是 THU_SOC_AGENT 的**期刊源数据治理层**。

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
- 构建 SSCI / JCR / Sociology Q1 期刊库
- 合并多个期刊列表
- 导出 Markdown 版本期刊清单
- 明确提到 journals.yml

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
```

字段约束：

- openalex_source_id 必须为完整 URL（https://openalex.org/Sxxxx）
- site 必须为 https
- issn / eissn 不带连字符
- short 必须简洁且唯一
- 不得根据名称猜测 OpenAlex ID

---

# 执行模型

本 Skill 通过以下脚本分层执行：

```
scripts/
  normalize/
  synchronize/
  merge/
  export/
  utils/
```

各层职责独立。

---

# 操作映射表（Intent → Script）

新增或刷新 OpenAlex ID  
→ scripts/synchronize/resolve_sources.mjs

从 JCR 构建 Sociology Q1 列表  
→ scripts/synchronize/sync_ssci_sociology_q1.mjs

规范化期刊 site  
→ scripts/normalize/norm_journal_sites.mjs

修复 OUP 根路径  
→ scripts/normalize/norm_journal_sites.mjs --fix-oup-root

合并多个期刊列表  
→ scripts/merge/merge-journals.mjs

导出期刊 Markdown  
→ scripts/export/export-to-md.mjs journals

生成 JCR 报告  
→ scripts/export/export-to-md.mjs jcr

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

## 构建 Sociology Q1 期刊库

1. 运行 norm_WOS_JCR.mjs
2. 运行 sync_ssci_sociology_q1.mjs
3. 运行 resolve_sources.mjs
4. 运行 norm_journal_sites.mjs --fix-oup-root
5. 导出 Markdown

---

## 手动新增期刊

1. 编辑 journals.yml
2. 运行 resolve_sources.mjs
3. 运行 norm_journal_sites.mjs
4. 导出 Markdown

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
