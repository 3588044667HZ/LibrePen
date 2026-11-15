# LibrePen

一个本地优先、干净快速的 Typora 风格 Markdown 桌面编辑器。

> Clean-room 重写，不包含 Typora 的代码、图标或主题资源；与 Typora 官方无关联。

## 当前状态

`0.1.0`（MVP）。行内实时预览、文件工作流、侧栏、恢复草稿、导出 HTML/PDF 已可用；表格/代码块/公式块的块级可视化编辑在 Phase 2。

## 功能

- **实时预览**：隐藏 Markdown 标记，光标进入时还原；支持标题、粗体/斜体/删除线/高亮、行内代码、链接、图片、行内数学、任务列表、水平线。
- **编辑**：CodeMirror 6、源码模式、撤销/重做、查找替换、自动配对、列表续行、标题/引用/列表/表格/代码块命令、Typora 常用快捷键。
- **文件**：打开/保存/另存为、未命名文档、最近文件、文件夹树、UTF-8/UTF-16/GBK 等编码检测、CRLF/LF 与末尾换行保持、2 MB 渲染上限、原子写、外部修改冲突提示。
- **导航**：侧栏文件树、实时大纲、文件夹全文搜索（大小写/整词/正则，有界结果）。
- **恢复**：自动保存（默认关闭）、失焦/关闭恢复草稿、关闭前保存确认、窗口与会话恢复。
- **导出**：自包含 HTML、Chromium PDF、打印。
- **界面**：浅色/深色/跟随系统、可调字号与内容宽度、可拖拽侧栏、状态栏字数/光标/编码统计。
- **安全**：`contextIsolation`、`sandbox`、无 Node 的渲染进程、CSP、`mdimg://` 图片白名单、导出 HTML 净化。

## 技术栈

| 层 | 选型 |
|---|---|
| 桌面 | Electron 45 |
| 构建 | electron-vite 6 + Vite 8 + TypeScript 5.9 |
| 壳层 UI | React 19 |
| 编辑器 | CodeMirror 6 + Lezer |
| 渲染/导出 | markdown-it、KaTeX、highlight.js、DOMPurify |
| 测试 | Vitest |

React 只负责侧栏、设置、对话框等壳层状态；编辑器由 CodeMirror 6 独立管理，避免 React 重渲染干扰输入。

## 快速开始

需要 Node.js 22+（Vite 8 要求），Windows 优先。

```bash
npm install
npm run dev        # 开发模式（Vite HMR + Electron）
npm run build      # 生产构建到 out/
npm start          # 运行已构建版本
npm test           # Vitest 单元测试
npm run typecheck  # 主进程 + 渲染层类型检查
```

若 Electron 二进制下载失败，可设置镜像或代理后再执行 `npm install`：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
```

## 数据目录

Windows：`%APPDATA%\LibrePen\`

```text
settings.json       设置
recent.json         最近文件/文件夹
session.json        上次文件/文件夹
draftsRecover/      恢复草稿（*.md + index.json）
logs/               运行日志
themes/             用户主题（P1）
```

不写入 Typora 安装目录；设置页提供「从 Typora 导入」兼容子集（字体、`keyBinding`）。

## 快捷键

常用：`Ctrl+S` 保存、`Ctrl+O` 打开、`Ctrl+F/H` 查找/替换、`Ctrl+B/I` 粗体/斜体、`Ctrl+K` 链接、`Ctrl+1..6` 标题、`Ctrl+/` 源码模式、`Ctrl+Shift+L` 侧栏。

完整列表见 `docs/spec/02-editor-engine.md`。

## 规格与路线图

- 产品与范围：`docs/spec/00-product.md`
- 架构与 IPC：`docs/spec/01-architecture.md`
- 编辑器引擎：`docs/spec/02-editor-engine.md`
- 文件与数据：`docs/spec/04-files-data.md`
- 导出：`docs/spec/05-export.md`
- 路线图：`docs/spec/07-roadmap.md`
- 功能矩阵：`docs/spec/09-feature-matrix.md`

## 已知边界

- 表格、代码围栏、公式块、Mermaid、TOC 目前是「源码 + 样式」，不是完全块级可视化编辑（Phase 2）。
- 不做授权/试用/遥测/云同步；不内置 Pandoc（后续检测外部安装）。
- 原始 HTML 块按源码显示，导出时净化。

## 许可证

MIT
