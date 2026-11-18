# 05 导出、打印与剪贴板

## 1. 渲染管线（导出用）

renderer 侧独立于编辑器装饰器：

```text
Markdown source
  -> markdown-it (html:false, linkify:true, typographer:false)
     plugins: footnote, task-lists, deflist, mark, sub, sup, anchor
  -> 自定义规则：
       $...$ / \(...\) / $$...$$ / \[...\] -> KaTeX HTML（失败则保留源码 + .math-error）
       ```mermaid -> 预渲染 SVG（renderer 内异步）或降级 <pre>
       ```lang -> highlight.js
       图片相对路径 -> 绝对 file:// 或内联 data:（导出单文件）
  -> DOMPurify 白名单净化（允许 KaTeX/Mermaid SVG 所需属性）
  -> 导出模板（内联 CSS + 主题变量 + 打印样式）
```

- 导出 HTML 默认自包含：CSS 内联；图片：
  - 本地图片 → data URI（≤ 5MB/张，总计 ≤ 50MB）；超限保留相对路径。
  - 远程图片 → 保留 URL。
- 代码高亮使用 highlight.js 的 GitHub 主题（浅色）与自定义深色主题。
- 数学用 KaTeX；不引入 MathJax。
- Mermaid 在导出时由 renderer 渲染为 SVG（同一 Mermaid 版本），失败则输出代码块并标注。

## 2. HTML 导出

- 选项：主题（light/dark/当前）、是否包含目录、追加 `<head>`/`<body>` 片段（P1）、字体大小。
- 文件名：文档名 + `.html`；保存对话框默认同目录。
- 成功后可「打开文件 / 打开所在文件夹」。

## 3. PDF 导出

- 主进程创建隐藏 `BrowserWindow`（`show:false`, `sandbox:true`, `nodeIntegration:false`, 宽度 900）。
- 加载 `data:text/html;charset=utf-8,` + 编码后的 HTML；等待 `did-finish-load` + `document.fonts.ready` + 500ms 稳定期。
- `webContents.printToPDF({ printBackground:true, pageSize:'A4', margins:{...} })`。
- 默认边距 20mm；页码/页眉页脚 P1。
- 深色主题：提示并默认使用浅色打印主题。
- 保存对话框；失败关闭隐藏窗口并返回错误。

## 4. 打印

- 同 PDF 管线，但调用 `webContents.print({ silent:false, printBackground:true })`。
- 打印前提示：背景、分页由系统驱动。

## 5. 导出图片（P1）

- 隐藏窗口截取 900px 宽内容 → `capturePage` → PNG；可选宽度/质量。
- 导出整页长图：先测量 `scrollHeight`，调整窗口高度（上限 16,384px）后分段拼接（P2）。

## 6. Pandoc 与 Word 导出

### 6.1 当前实现：DOCX

- 设置中配置 Pandoc 路径；未配置时从 PATH 调用 `pandoc`。
- 导出 Word 使用 `--from=markdown+...+tex_math_single_backslash --to=docx`，保留标题、列表、表格、代码、公式、图片和脚注。
- 图片通过 `--resource-path=<文档目录>` 解析；SVG 图片先用隐藏 Chromium 窗口栅格化为 PNG（上限 2048px / 10MB）并替换 Markdown 引用，再交给 Pandoc。
- 临时 Markdown、SVG PNG 与输出文件在系统临时目录生成，成功后原子写入用户选择路径，失败或结束后清理。
- 外部进程使用参数数组 `execFile(pandocPath, args)`，不使用 shell；超时 120s，stdout/stderr 有上限。
- Pandoc 缺失、参考样式无效或转换失败时返回可读错误；不会留下半成品目标文件。
- 尚未依赖 PowerShell/CMD，中文、空格路径均按参数传递。

### 6.2 Word 样式插件：reference.docx

- 设置项 `export.docx.referenceDoc` 指向一个 `.docx` 参考文档，作为 `--reference-doc` 传入。
- 参考文档定义 `Normal`、`Heading 1–6`、`Quote`、`Source Code`、表格、脚注、超链接等样式；主题包只需替换该文件，不执行 CSS 或 JS。
- 不允许 `.docm`、宏或脚本；参考文件必须是已存在的普通文件，大小限制 50MB。
- 参考样式路径会随设置在 settings.json 中保存；用户主题 CSS 不自动影响 Word。

### 6.3 其他 Pandoc 格式

- 已实现 ODT、RTF、EPUB 导出，复用同一 Pandoc 服务、保存对话框、临时文件和错误处理。
- RTF 使用 `--standalone` 生成完整 RTF 头；EPUB 自动补充文档标题元数据。
- 参考样式目前只支持 Word 的 `reference.docx`；ODT/EPUB 的样式模板后续扩展。
- LaTeX、RST、MediaWiki、Textile、OPML、native 继续复用同一服务。
- 导入：DOCX/EPUB/LaTeX 经 `pandoc -f <format> -t gfm` 生成 Markdown 后打开为未命名文档。

## 7. 自定义命令导出（P2）

- 用户显式配置命令模板，变量 `${outputPath}` `${currentFolder}` `${outputFolder}`。
- 执行前展示完整命令并要求确认；不使用 shell 拼接（参数化）。
- MVP 不实现。

## 8. 剪贴板

| 操作 | 行为 |
|---|---|
| 复制 | 标准复制选中文本 |
| 剪切 | 标准剪切 |
| 粘贴 | 纯文本；CM6 处理 |
| 粘贴为纯文本 | `Ctrl+Shift+V`：`navigator.clipboard.readText()` 插入 |
| 复制为 Markdown | 选区若在源码中已是 Markdown，直接复制 |
| 复制为 HTML | renderer 用导出管线渲染选区 → `clipboard.write({html, text})` (P1) |
| 复制代码/表格 | P1 块级菜单 |
| 复制图片 | P1 |
| 粘贴图片 | `navigator.clipboard.read()` → Blob → `file:importImage` → 插入 |
| HTML 智能粘贴 | P1：turndown 转 Markdown，失败回退纯文本 |

> Electron 中 `navigator.clipboard` 依赖权限；MVP 通过 main `clipboard:readImage` 与 `clipboard:writeText` 兜底。

## 9. 导出设置 Schema

```ts
interface ExportSettings {
  html: { theme: 'current'|'light'|'dark'; includeToc: boolean; fontSize?: number };
  pdf: { pageSize: 'A4'|'Letter'|'A5'|'custom'; marginMm: number;
         theme: 'light'; printBackground: boolean };
  general: { openAfterExport: boolean; defaultFolder: 'same'|'ask'|'custom';
             customFolder?: string };
  docx: { referenceDoc: string };
  pandoc: { path?: string };
}
```

- 设置持久化于 `settings.json`；导出对话框可临时覆盖（P1）。
- 文件名冲突：系统保存对话框处理；「导出并覆盖上次」P1。

## 10. 错误与边界

- 图片/字体加载失败不阻塞导出，模板中降级。
- HTML 超 50MB 拒绝 PDF 导出并提示。
- `printToPDF` 失败（Electron 版本差异）回退：生成 HTML 并提示用户浏览器打印。
- 导出过程中禁用重复点击，显示进度 toast。
- Word 导出缺少 Pandoc 时提示安装或在设置中填写路径；参考样式缺失时拒绝导出。
