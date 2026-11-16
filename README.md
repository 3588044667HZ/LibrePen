# LibrePen

一个本地优先、干净快速的 Markdown 桌面编辑器。

> 独立实现，不随包分发第三方编辑器的代码、图标、字体或主题资源；不隶属于任何第三方编辑器项目。

## 当前状态

`0.2.1`（P1 + 扁平化 UI）。块级编辑已加入：表格可视化面板、代码块/公式块/Mermaid/TOC/Front Matter 块组件、专注/打字机模式、快速打开、自定义主题目录。编辑界面采用顶栏菜单 + 居中内容列 + 扁平布局，无状态栏、无多余卡片。详见 `docs/spec/10-p1-acceptance.md` 与 `docs/spec/11-flat-ui.md`。

## 功能

- **实时预览**：隐藏 Markdown 标记，光标进入时还原；支持标题、粗体/斜体/删除线/高亮、行内代码、链接、图片、行内数学、任务列表、水平线。
- **块级编辑**：表格渲染 + 单元格内联 Markdown + 列宽/行高拖拽 + 行列表格/对齐面板；代码块点击进入内联动态高亮编辑（行号、实时语法高亮、点击外部提交、Esc 取消），也支持复制/编辑源码；KaTeX 公式块；Mermaid 懒渲染；TOC；Front Matter 元数据块；点击「编辑源码」回到 Markdown。
- **编辑**：CodeMirror 6、源码模式（顶栏图标 / Ctrl+/，状态持久化）、撤销/重做、查找替换、自动配对、列表续行、标题/引用/列表/表格/代码块命令、右键格式菜单、常用 Markdown 快捷键。
- **智能输入**：`:emoji` 补全、代码围栏语言补全。
- **文件**：打开/保存/另存为、未命名文档、最近文件、文件夹树、快速打开（Ctrl+P）、UTF-8/UTF-16/GBK 等编码检测、CRLF/LF 与末尾换行保持、2 MB 渲染上限、原子写、外部修改冲突提示。
- **导航**：侧栏文件树、实时大纲、文件夹全文搜索（大小写/整词/正则，有界结果）。
- **恢复**：自动保存（默认关闭）、失焦/关闭恢复草稿、关闭前保存确认、窗口与会话恢复。
- **导出**：自包含 HTML、Chromium PDF、Word（DOCX）、ODT、RTF、EPUB（均需外部 Pandoc）、打印。
- **界面**：顶部菜单（新建/打开/保存/导出/设置等）、Bootstrap Icons、居中内容列与扁平编辑区、浅色/深色/跟随系统、专注/打字机模式、自定义主题（`userData/themes`）、可拖拽侧栏；编辑界面只保留编辑器与可选侧栏。
- **安全**：`contextIsolation`、`sandbox`、无 Node 的渲染进程、CSP、`mdimg://` 图片白名单、导出 HTML 净化。

## 技术栈

| 层 | 选型 |
|---|---|
| 桌面 | Electron 45 |
| 构建 | electron-vite 6 + Vite 8 + TypeScript 5.9 |
| 壳层 UI | React 19 |
| 图标 | Bootstrap Icons |
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
themes/             用户主题 CSS（base.user.css / {theme}.user.css）
```

不写入其他编辑器安装目录；设置页提供兼容配置导入（字体、`keyBinding`）。

## 快捷键

常用：`Ctrl+S` 保存、`Ctrl+O` 打开、`Ctrl+P` 快速打开、`Ctrl+F/H` 查找/替换、`Ctrl+B/I` 粗体/斜体、`Ctrl+K` 链接、`Ctrl+1..6` 标题、`Ctrl+/` 源码模式、`Ctrl+Shift+L` 侧栏、`F8` 专注、`F9` 打字机。打印为 `Ctrl+Shift+P`。

完整列表见 `docs/spec/02-editor-engine.md`。

## 规格与路线图

- 产品与范围：`docs/spec/00-product.md`
- 架构与 IPC：`docs/spec/01-architecture.md`
- 编辑器引擎：`docs/spec/02-editor-engine.md`
- 文件与数据：`docs/spec/04-files-data.md`
- 导出：`docs/spec/05-export.md`
- 路线图：`docs/spec/07-roadmap.md`
- 功能矩阵：`docs/spec/09-feature-matrix.md`
- P1 验收：`docs/spec/10-p1-acceptance.md`
- 扁平化 UI：`docs/spec/11-flat-ui.md`
- 主题 API：`docs/spec/12-theme-api.md`

## 已知边界

- 表格行列重排、单元格内直接光标编辑、脚注悬浮、图片缩放/上传、块拖拽排序尚未包含。
- 不做授权/试用/遥测/云同步；不内置 Pandoc。Word 导出需要外部 Pandoc，可在设置中填路径并选择 `reference.docx`。
- 原始 HTML 块按源码显示，导出时净化。
- 用户主题目前只影响编辑器；导出使用内置主题 token，尚未注入用户 CSS。

## 许可证

MIT
