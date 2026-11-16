> 0.2.1 起 UI 以 `11-flat-ui.md` 为准；本文早期布局/尺寸描述部分已过时。

# 03 UI / UX

## 1. 窗口与布局

```text
┌──────────────────────────────────────────────────────────────┐
│ TitleBar 36px  [☰] 文件名*                  [–] [□] [×]      │
├───────────────┬──────────────────────────────────────────────┤
│ Sidebar 260px │ Editor (CM6, 居中 720–860px 内容宽)            │
│ ┌───────────┐ │                                              │
│ │文件 大纲 搜索│ │  # 标题                                      │
│ │           │ │  正文……                                      │
│ │ tree/list │ │  $$ 公式 $$                                   │
│ │           │ │                                              │
│ └───────────┘ │                                              │
├───────────────┴──────────────────────────────────────────────┤
│ StatusBar 28px  字数 · 字符 · 行 · 阅读时间    Ln,Col  UTF-8  LF  源码 │
└──────────────────────────────────────────────────────────────┘
```

- 无原生标题栏（`frame:false`），自绘 TitleBar；保留系统缩放/拖拽区（`-webkit-app-region: drag`，按钮 `no-drag`）。
- Sidebar 可折叠（`Ctrl+Shift+L`），宽度可拖拽（240–400px，持久化）。
- 编辑区最大宽度 860px，随窗口居中；设置可切「全宽」。
- 空状态/欢迎页：新建、打开文件、打开文件夹、最近文件、恢复草稿。

### 1.1 尺寸与色板

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#ffffff` | `#1e1e1e` |
| `--bg-alt` | `#f7f7f7` | `#252526` |
| `--fg` | `#24292f` | `#d4d4d4` |
| `--fg-muted` | `#6e7781` | `#9d9d9d` |
| `--border` | `#e5e7eb` | `#3c3c3c` |
| `--accent` | `#3b82f6` | `#4ea1ff` |
| `--selection` | `#cfe3ff` | `#264f78` |
| `--code-bg` | `#f6f8fa` | `#2d2d2d` |
| `--sidebar-bg` | `#f7f7f7` | `#252526` |
| `--hover` | `#eef1f4` | `#2a2d2e` |
| `--mark` | `#fff3a3` | `#5c4b00` |

字号：正文 16px（设置 12–24）；代码 0.9em；行高 1.75；标题 1.6/1.4/1.25/1.15/1.05/1em。

## 2. 标题栏

- 左：菜单按钮（☰，打开原生菜单同款下拉，P1；P0 用原生菜单栏）。
- 中：文件名 + 修改标记 `*`；无路径时显示「未命名」。
- 右：最小化/最大化(还原)/关闭。
- 双击标题栏切换最大化。
- 关闭时未保存：系统级 Save/Discard/Cancel 对话框（见 01 关闭流程）。

## 3. 侧栏

### 3.1 标签

`文件` / `大纲` / `搜索`，图标 + 文本，活动项高亮；`Ctrl+Shift+1/2/3` 切换（P1）。

### 3.2 文件树

- 根：打开的文件夹名称；节点缩进 12px/层；文件图标按扩展名。
- 展开/折叠（目录懒加载）；单击打开，活动文件高亮。
- 右键菜单：新建文件、新建文件夹、重命名、删除（移入回收站）、在资源管理器中显示、刷新。
- 顶部工具条：新建文件、刷新、折叠全部。
- 隐藏 `.git`、`node_modules`、`.obsidian`，其他隐藏文件可设置显示。

### 3.3 大纲

- 由 Markdown 标题实时生成（防抖 200ms）；层级缩进，点击跳转。
- 当前光标所在标题高亮（scrollspy）。
- 过滤输入框；空文档显示「无标题」。

### 3.4 搜索

- 输入：关键词；选项：大小写、整词、正则。
- 结果按文件分组，显示命中行与行号；点击跳转并选中。
- 限制：单次 5,000 命中；超出显示「结果过多，请细化」。
- 搜索在 main 进程执行，支持 200ms 防抖取消旧请求（请求 id + Abort）。

## 4. 编辑区

- 内边距：上 24px、下 40vh（打字机模式）。
- 标题 hover 显示级别淡标（P1）；块 hover 显示操作菜单（P1）。
- 链接 Ctrl+Click 打开；图片 Ctrl+Click 打开原图；右键菜单（P1）。
- 拖入图片显示插入位置指示；拖入文件夹/文件按规则打开。
- 查找替换面板悬浮于右上角，半透明背景。

## 5. 状态栏

左：字数、字符、行数、阅读时间（200 wpm 可设置）。
右：光标 `Ln, Col`、编码（UTF-8）、换行（LF/CRLF）、保存状态（已保存/未保存）、源码模式按钮。
点击字数打开统计浮层（选中统计、段落数）；点击换行切换（P1）。

## 6. 菜单

```text
File     New, New Window, Open…, Open Folder…, Open Recent ▸, Save, Save As…,
         Export ▸ (HTML, PDF, Word, ODT, RTF, EPUB), Print…, Close, Exit
Edit     Undo, Redo, Cut, Copy, Paste, Paste as Plain Text,
         Find…, Replace…, Select All
Paragraph Heading 1..6, Paragraph, Increase/Decrease Heading,
         Quote, Code Fences, Math Block, Table, Horizontal Rule, TOC
Format   Bold, Italic, Underline, Strikethrough, Highlight, Inline Code,
         Superscript, Subscript, Link…, Image…, Clear Format
View     Toggle Sidebar, Source Code Mode, Focus Mode(P1), Typewriter(P1),
         Theme ▸ (Light, Dark, System), Zoom In/Out/Reset, Toggle DevTools
Help     Quick Start, Markdown Reference, About LibrePen
```

- 菜单命令统一映射为 `app:command` 事件；renderer 未知命令忽略并记录。
- 菜单项状态（可用/勾选）通过 `menu:update` 由 renderer 推送（P1）；P0 静态。
- 原生菜单 accelerator 与 02 快捷键表一致；`keyBinding` 覆盖 P1。

## 7. 对话框与浮层

| 组件 | 行为 |
|---|---|
| 设置 | 模态；左侧分类（通用/编辑器/文件/外观/导出/高级），右侧表单；即时生效；恢复默认 |
| 关于 | 版本、Electron/Chrome/Node 版本、开源许可链接 |
| 恢复草稿 | 启动检测到草稿时列出：文件名、时间、预览；恢复/丢弃 |
| 未保存确认 | 原生 message box（保存/不保存/取消） |
| 导出 | 保存对话框 + 成功后「打开文件/打开所在文件夹」 |
| Toast | 右下角，3s 自动消失；错误 6s 可手动关闭 |

## 8. 主题

- `data-theme="light|dark"` 挂在 `<html>`；跟随系统用 `prefers-color-scheme`。
- CSS 变量契约见 06 与 `styles/tokens.css`；用户主题 P1：读取 `userData/themes/*.css`，按文件名展示。
- 编辑器主题通过 `EditorView.theme` 与 token 同步；KaTeX/代码高亮配色随主题切换。
- 打印/导出始终使用浅色打印样式（深色主题提示）。

## 9. 可访问性

- 所有按钮有 `aria-label`；焦点环可见（2px accent）。
- 侧栏/对话框支持 Esc 关闭、Tab 循环。
- 对比度 ≥ WCAG AA；不依赖颜色单独传达状态（脏标记同时用 `*`）。
- 支持系统缩放 80%–200%（`webFrame.setZoomFactor`）。

## 10. 响应式

- 宽度 < 720px：自动隐藏侧栏；标题栏文件名截断。
- 高度 < 500px：隐藏状态栏可选。
- 侧栏覆盖模式下点击遮罩关闭。

## 11. 空状态文案

```text
LibrePen
一个干净、快速、本地优先的 Markdown 编辑器

[新建文件] [打开文件] [打开文件夹]

最近文件
- README.md            H:\project\README.md
- 笔记.md              2026-11-14 21:03

发现 2 个未保存草稿 → 恢复
```
