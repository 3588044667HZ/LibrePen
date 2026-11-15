# 02 编辑器引擎

## 1. 模型

- 单一数据源：CodeMirror 6 `EditorState.doc`（Markdown 原文）。
- 语法树：`@codemirror/lang-markdown`（Lezer）。不另建文档树；装饰与 Widget 全部由语法树 + 正则补丁驱动。
- 保存/导出始终序列化 `state.doc.toString()`，不经 HTML 往返。
- 选择范围、撤销历史、IME 全部交给 CM6。

### 1.1 扩展清单

| 扩展 | 来源 | 用途 |
|---|---|---|
| `markdown({ codeLanguages: languages })` | @codemirror/lang-markdown + language-data | GFM 块/行内解析、代码围栏语言 |
| `history()` | @codemirror/commands | 撤销/重做 |
| `drawSelection`, `dropCursor`, `highlightActiveLine` | @codemirror/view | 基础编辑体验 |
| `keymap.of(defaultKeymap + customKeymap)` | commands | 快捷键 |
| `closeBrackets()` | @codemirror/autocomplete | 自动配对 |
| `search({ top: true })` | @codemirror/search | 查找替换 |
| `EditorView.lineWrapping` | view | 软换行（可设置） |
| `livePreview()` | 自研 ViewPlugin | 标记折叠、Widget、光标还原 |
| `typoraTheme` | 自研 | 排版与主题变量 |
| `syntaxHighlighting` | @codemirror/language | 代码块高亮 |

### 1.2 Markdown 方言

CommonMark + GFM（表格、任务列表、删除线、自动链接）+ Typora 扩展：

- 标题（ATX/setext 解析兼容；编辑只生成 ATX）
- 围栏代码（含语言、`math`/`mermaid` 特判）
- 表格、任务列表、脚注、TOC `[toc]`、YAML front matter
- 行内数学 `$...$`（可关闭）、块数学 `$$...$$`
- 高亮 `==text==`、上标 `^text^`、下标 `~text~`（与删除线歧义时按设置）
- `[^note]` 脚注引用、emoji 短代码（P1）
- 原始 HTML：编辑区按源码显示；导出前 DOMPurify 白名单（P1 内嵌预览）

## 1.3 块级 Widget 的 CM6 约束

CM6 禁止 ViewPlugin 提供的装饰替换换行；因此表格/代码/公式/Mermaid/TOC/Front Matter 的块级装饰由 **StateField** 提供（`src/renderer/src/editor/blocks/blockState.ts`）。

- `blockState` 收集块范围，按 `blockEdit` 状态决定渲染或显示源码。
- 点击块内「编辑源码」或 `revealPosition` 时，派发 `setBlockEdit`，块 Widget 移除、源码展开；选择移出后自动恢复。
- 行内装饰仍由 ViewPlugin 处理，并跳过已渲染的块范围，避免重叠。

## 2. 实时预览（Live Preview）

### 2.1 原则

1. 光标/选择未触及的 token 折叠标记并渲染；触及则显示原文。
2. 折叠只影响显示，不改变文档；Widget 使用 `Decoration.replace`。
3. `atomicRanges` 让光标跳过已折叠 range，避免选中不可见字符。
4. 仅处理 `view.visibleRanges`（外加 100 行缓冲）。
5. 防抖：docChanged/selectionSet/viewportChanged 后 `requestAnimationFrame` 重建；同一帧只重建一次。

### 2.2 规则表

| 语法 | 未触碰时 | 光标进入时 | 实现 |
|---|---|---|---|
| 标题 `# ` | 隐藏 `#`，放大加粗 | 显示 `#`，淡色 | line decoration + `Decoration.replace` on marker |
| 粗体 `**x**` | 隐藏星号，加粗 | 显示星号 | mark decoration |
| 斜体 `*x*` / `_x_` | 隐藏标记，斜体 | 显示 | mark |
| 删除线 `~~x~~` | 隐藏标记，删除线 | 显示 | mark |
| 行内代码 `` `x` `` | 隐藏反引号，等宽底色 | 显示 | mark |
| 高亮 `==x==` | 隐藏标记，黄底 | 显示 | mark（设置开关） |
| 链接 `[t](u)` | 隐藏 `[`、`](u)`，t 变色 | 显示全文 | replace + mark |
| 自动链接/裸 URL | 变蓝，可 Ctrl+Click | – | mark + click handler |
| 图片 `![a](s)` | 渲染图片 Widget | 显示源码 | replace widget，原子 |
| 行内数学 `$x$` | KaTeX Widget | 显示 `$x$` | replace widget，原子 |
| 块数学 `$$...$$` | 块级 KaTeX Widget，点击进入 | 源码 + 行号 | block widget（P0 用行装饰 + 折叠 fence） |
| 代码围栏 | 渲染只读高亮块；点击进入内嵌 CM6 动态高亮编辑 | 显示 fence 行 | 内嵌 EditorView + language-data；点击外部提交 |
| 表格 | 渲染 `TableWidget`；单元格内联 Markdown（code/strong/em/link）；面板编辑 | – | P1 |
| 任务列表 `- [x]` | 可点击复选框，隐藏 `- [x]` | 显示源码 | replace widget |
| 水平线 `---` | 渲染 `<hr>` Widget | 显示源码 | replace widget |
| 引用 `> ` | 左侧竖线 + 缩进，保留 `>` 淡显 | 正常 | line decoration（不隐藏，Typora 同款） |
| 列表 `- ` / `1. ` | 保留符号，样式化 | 正常 | line decoration |
| 行内 HTML | 源码（P0），P1 沙箱预览 | – | 不做替换 |
| Front matter | 折叠为「元数据」条（P1） | 展开 | P1 |
| `[toc]` | 生成目录 Widget（P1） | 显示源码 | P1 |

### 2.3 折叠算法

```ts
// 对每个可见语法节点：
const tok = nodeFromSyntaxTree(...);           // emphasis/strong/link/image/...
const ranges = markerRanges(tok);               // 返回需要隐藏的 [from,to]
const active = selectionTouches(tok.from, tok.to) || view.hasFocus && caretInside(tok);
if (!active) {
  ranges.forEach(r => builder.add(r.from, r.to, Decoration.replace({})));
  builder.add(tok.from, tok.to, Decoration.mark({ class: 'cm-md-strong' }));
}
```

- 行内 token 的标记定位优先用语法树子节点（`EmphasisMark`、`CodeMark`、`LinkMark`、`URL`），找不到再回退正则。
- 嵌套 token：由内向外添加；重叠 replace 时跳过外层，避免 CM 断言。
- 表格/代码等块级：使用 line class + `Decoration.replace` 隐藏 fence 行需谨慎（不能跨行 replace 可见内容）；P0 只加样式。

### 2.4 Widgets

| Widget | 数据 | 交互 | 资源 |
|---|---|---|---|
| `ImageWidget` | src, alt, docDir | 点击定位源码；Ctrl+Click 打开；加载失败占位 | `mdimg://` |
| `MathInlineWidget` | tex | 点击定位源码；hover 显示 TeX | KaTeX lazy |
| `MathBlockWidget`（P1） | tex | 点击编辑；更新回写 | KaTeX |
| `TaskWidget` | checked, from | 点击切换 `[ ]`↔`[x]` | 无 |
| `HrWidget` | – | 点击定位 | 无 |
| `MermaidWidget`（P1） | code | 点击编辑；异步渲染 + 缓存 | Mermaid lazy |
| `TableWidget`（P1） | model | 单元格编辑/行列操作 | 自研 |

**Widget 规则**：

- `eq(other)` 比较数据，避免无谓重建。
- `ignoreEvent(event)`：复选框返回 false（可点击），其余 true（让 CM 处理定位）。
- `estimatedHeight` 提供以减少滚动跳动。
- 图片/公式渲染异步完成后 `view.requestMeasure()`。

### 2.5 图片路径解析

优先级：绝对路径 / `data:` / `https:` 原样 → 相对文档目录 → `typora-root-url`（front matter，P1）→ 失败占位。

```ts
resolveImageSrc(raw, docDir) => {
  if (/^(https?:|data:|mdimg:)/.test(raw)) return raw;
  const abs = path.resolve(docDir, decodeURI(raw));
  return `mdimg://local/${base64url(abs)}?v=${mtime}`;
}
```

> renderer 无法直接 `path.resolve`，由 preload 暴露 `api.path.resolveImage(docDir, raw)`（纯字符串计算在 preload 完成或 main IPC 批量解析）。P0 在 preload 内用 POSIX/Windows 规则实现。

## 3. 命令

命令 ID 与菜单/快捷键解耦：`{id, label, run(view), enabled?}`。

| 分类 | 命令 |
|---|---|
| 文件 | new, open, openFolder, save, saveAs, close, exportHtml, exportPdf, print |
| 编辑 | undo, redo, cut, copy, paste, selectAll, find, replace |
| 段落 | paragraph, heading1..6, increaseHeading, decreaseHeading, quote, codeFence, mathBlock, table, hr, toc |
| 列表 | orderedList, bulletList, taskList, indent, outdent |
| 格式 | bold, italic, underline(`<u>`), strike, highlight, inlineCode, superscript, subscript, link, image, clearFormat |
| 视图 | toggleSidebar, toggleSourceMode, toggleFocusMode(P1), toggleTypewriter(P1), zoomIn/Out/Reset, toggleTheme |
| 其他 | settings, about, wordCount |

### 3.1 文本命令语义

- 行级命令（标题/引用/列表/代码块）：对选区内每一行加/去前缀；再次执行同命令取消。
- 行内命令（粗体等）：有选区则包裹；无选区插入成对标记并把光标放中间；已包裹则移除。
- 链接：有选区作为文本；无选区插入 `[text](url)` 并选中 `url`。
- 图片：弹文件选择；插入 `![alt](relative)`。
- 表格：插入 `| a | b |\n| --- | --- |\n|   |   |`，光标落在首格。
- 代码块：若选区跨行，包裹为 ````` ```lang ... ``` `````。
- 清格式：去除选区内的行内标记与行首块标记（不触碰代码块内容）。

### 3.2 快捷键（Windows/Linux）

| 功能 | 键 |
|---|---|
| 新建 / 打开 / 打开文件夹 | Ctrl+N / Ctrl+O / Ctrl+Shift+O |
| 保存 / 另存为 | Ctrl+S / Ctrl+Shift+S |
| 快速打开 / 查找 / 替换 | Ctrl+P / Ctrl+F / Ctrl+H |
| 粗体 / 斜体 / 下划线 / 行内代码 | Ctrl+B / Ctrl+I / Ctrl+U / Ctrl+Shift+` |
| 删除线 / 高亮 | Alt+Shift+5 / Ctrl+Shift+H |
| 标题 1..6 / 正文 | Ctrl+1..6 / Ctrl+0 |
| 升级 / 降级标题 | Ctrl+= / Ctrl+- |
| 引用 / 代码块 / 数学块 | Ctrl+Shift+Q / Ctrl+Shift+K / Ctrl+Shift+M |
| 有序 / 无序 / 任务列表 | Ctrl+Shift+[ / Ctrl+Shift+] / Ctrl+Shift+T |
| 缩进 / 反缩进 | Tab / Shift+Tab（列表内） |
| 链接 / 图片 | Ctrl+K / Ctrl+Shift+I |
| 表格 / 水平线 | Ctrl+T / Ctrl+Shift+R |
| 源码模式 / 侧栏 | Ctrl+/ / Ctrl+Shift+L |
| 专注 / 打字机 | F8 / F9 |
| 打印 | Ctrl+Shift+P |
| 设置 | Ctrl+, |
| 放大 / 缩小 / 重置 | Ctrl+Shift+= / Ctrl+Shift+- / Ctrl+Shift+0 |

快捷键可在设置中覆盖（P1 提供 UI；P0 支持 `settings.keybindings` 映射）。

## 4. 输入体验

- **自动配对**：`closeBrackets`；Markdown 符号（`* _ ~ ` $`）由设置控制（P1）。
- **列表续行**：`insertNewlineContinueMarkdown`；空列表项回车退出列表（lang-markdown 自带，需验证）。
- **粘贴**：纯文本粘贴默认；粘贴 HTML 时转为 Markdown（P1，使用 turndown）。
- **拖拽**：图片文件 → 复制到 `assets` 并插入；Markdown 文件 → 打开（主窗口）或插入链接（按住 Shift，P1）。
- **IME**：不拦截 `compositionstart/update/end`；装饰重建在 composition 结束后进行，避免打断候选。
- **智能标点**：默认关闭（设置可开，P1）。
- **Tab**：列表/引用内缩进；代码块内插入 2/4 空格（由 indentUnit 决定）；普通段落 Tab 插入缩进（设置）。

## 5. 源码模式

- 顶栏 `bi-code-slash` 图标或 `Ctrl+/` 切换；图标 active 表示当前为源码模式。
- 关闭 `livePreview` 与块级 Widget，保留原生 Markdown 源码、语法高亮与等宽字体。
- 切换不改变文档与撤销历史；再次切回恢复块渲染。
- 状态写入 `localStorage('librepen:source-mode')`，重启保持；打开新文件不强制退出源码模式。

## 6. 查找替换

- 使用 `@codemirror/search` 面板，注入主题样式。
- 支持大小写、正则、整词；显示命中数（上限 5,000，超出提示）。
- 替换全部为单次 CM transaction（可撤销）。

## 7. 专注 / 打字机（P1）

- 专注：`EditorView.decorations` 为非当前块加 `cm-dimmed`，CSS 降低透明度并模糊。
- 打字机：滚动时保持光标在视口 40% 位置；通过 `EditorView.scrollIntoView(pos, {y:'center'})` 实现，顶部/底部加 padding。

## 8. 性能策略

- 装饰器只遍历视口；语法树查询用 `syntaxTree(state).iterate({from,to})`。
- KaTeX/Mermaid/图片按需加载；渲染结果 LRU 缓存（key = 源码 + 主题）。
- Widget 高度稳定，避免布局抖动。
- 大文档（>2MB）主进程拒绝加载并提示；>500KB 默认关闭部分 Widget（设置）。
- 搜索/导出在 main 或隐藏窗口执行，避免阻塞编辑。

## 9. 可测试纯函数（Vitest）

`src/shared/markdown.ts`：

- `extractOutline(markdown): OutlineItem[]`（跳过代码块/数学块）。
- `countWords(text, cjkAware): WordStats`。
- `detectEol`, `applyEol`, `applyFinalNewline`。
- `parseImageRef`, `isImagePath`.
- `normalizeHeading`, `applyHeading(markdown, level)`、`toggleLinePrefix`、`wrapInline`.
- `sanitizeFileName`, `relativeAssetPath`.
