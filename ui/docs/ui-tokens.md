# UI Design Tokens

社会科学文献处理综合智能体 前端使用的设计变量与视觉规范，对齐 [清华大学视觉形象识别 · 色彩规范](https://vi.tsinghua.edu.cn/gk/xxbz/scgf.htm)。

## 主题色（标准色 + 辅助色）

| Token | 值 | 用途 |
|-------|-----|------|
| `--thu-purple` | `#660874` | **标准色** 清华紫：导航选中、主按钮、标题、关键标识 |
| `--thu-purple-light` | `#8b3d96` | 悬停/浅色背景 |
| `--thu-purple-dark` | `#4d0559` | 按下/深色强调 |
| `--accent` | `#d93379` | **辅助色** 玫红：渐变延伸、光感、次要 CTA 边框/悬停 |
| `--accent-light` | `#e85a9a` | 辅助色悬停 |
| `--gradient-thu-soft` | 紫→玫红 | 顶栏光感条等，克制使用 |

## 背景与边框

| Token | 值 | 用途 |
|-------|-----|------|
| `--bg-page` | `#f8f6f9` | 页面主背景（淡紫灰） |
| `--bg-sidebar` | `#f3f0f5` | 侧栏背景 |
| `--bg-card` | `#ffffff` | 卡片/面板背景 |
| `--border` | `#e8e4ec` | 边框 |
| `--border-soft` | `#eeeaf0` | 浅边框、分割线 |
| `--shadow-soft` | 见 globals.css | 轻阴影 |
| `--shadow-card` | 见 globals.css | 卡片阴影 |

## 文字

| Token | 值 | 用途 |
|-------|-----|------|
| `--text` | `#111827` | 正文 |
| `--text-muted` | `#6b7280` | 次要说明、占位 |

## Tailwind 扩展

在 `tailwind.config.ts` 中扩展了：

- `colors.thupurple` → `var(--thu-purple)`（含 `light` / `dark`）
- `colors.accent` → `var(--accent)`（含 `light`）

使用示例：`bg-thupurple`、`text-thupurple`、`hover:bg-thupurple-dark`。

## 风格原则（信达雅，功能第一）

- **校色紫、白**：主背景淡紫灰、卡片白，标准紫用于关键交互与品牌标题。
- **玫红辅助色**：用于渐变光感（如顶栏条）、次要按钮悬停等延伸，不抢主色。
- **克制清爽**：留白充足，不滥用强调色，确保可读性与操作清晰。
