# 12 主题 API 与样式插件契约

本文档定义 LibrePen 的主题 token、可覆盖选择器和加载顺序。主题插件应只改变视觉，不依赖内部 DOM 结构。

## 1. 加载层级

按以下顺序生效，后者覆盖前者（同优先级时）：

1. `src/renderer/src/styles/tokens.css`：基础 token 和浅/深色默认值。
2. `base.css`、`editor.css`、`table.css`、`code-math.css` 等组件样式。
3. `src/renderer/src/styles/themes/default.css`：内置默认主题。
4. `userData/themes/<selected>.css`：设置中选中的主题文件。
5. `userData/themes/base.user.css`：全局用户覆盖。
6. `userData/themes/<selected>.user.css`：当前主题的局部覆盖。

用户主题只能包含 CSS；不会执行 JS。渲染进程保持 `contextIsolation`、`sandbox` 和 CSP。

## 2. 稳定 token

主题应优先覆盖 token，而不是复制组件规则。以下是 v1 契约：

| Token | 用途 |
|---|---|
| `--bg` / `--bg-alt` | 页面与次级背景 |
| `--fg` / `--fg-muted` | 主文字与弱化文字 |
| `--border` | 通用边框 |
| `--accent` / `--accent-soft` | 交互强调色 |
| `--selection` | 文本选区 |
| `--link` | 正文与表格链接颜色 |
| `--quote-fg` | 引用文字颜色 |
| `--quote-border` / `--quote-border-width` | 引用竖线与宽度 |
| `--quote-padding-left` / `--quote-padding-right` | 引用左右内边距 |
| `--heading-divider` / `--heading-divider-width` | 标题下分割线 |
| `--heading-1-size` … `--heading-6-size` | 六级标题字号 |
| `--heading-1-line-height` … `--heading-6-line-height` | 六级标题行高 |
| `--heading-6-color` | 六级标题颜色 |
| `--heading-pad-top-1` … `--heading-pad-top-6` | 标题上方内边距 |
| `--heading-pad-bottom` | 标题与分割线之间的距离 |
| `--heading-gap-after` | 标题下方空白行的行高；默认 `1rem` |
| `--blank-line-height` | 实时预览空行行高；`1` 为不压缩，内置主题为 `0.8` |
| `--math-block-font-size` | 块级公式字号；内置主题为 `0.95rem`，对应参考样式的行盒 |
| `--mermaid-font-size` | Mermaid 文本字号；内置主题为 `15.2px` |
| `--code-font` / `--code-font-size` | 代码字体与字号 |
| `--code-border` | 代码块边框颜色 |
| `--mono` | 兼容别名，默认等于 `--code-font` |
| `--content-width` | 编辑内容列最大宽度；内置主题为 920px，≥1400px 为 1084px，≥1800px 为 1260px |
| `--content-padding-x` | 编辑内容左右内边距；内置主题为 30px |
| `--table-border` / `--table-header-bg` | 表格边框与表头背景 |
| `--table-code-bg` / `--table-code-border` | 表格内行内代码 |
| `--mark` | 高亮背景 |
| `--danger` | 错误状态 |

`--editor-font`、`--editor-font-size`、`--editor-line-height` 由设置页写入，主题不应强制覆盖；需要覆盖时使用 `!important` 并在文档中注明。

### 深色模式

主题通过 `html[data-theme='dark']` 覆盖 token：

```css
html[data-theme='dark'] {
  --link: #6ea8d8;
  --quote-border: #3b434b;
  --quote-fg: #b0b0b0;
  --heading-divider: #333333;
}
```

### 稳定性规则

- 只改变 token 值，不改变 token 名称。
- 删除、重命名或改变 token 语义属于破坏性变更，需要版本升级和迁移说明。
- 不在主题中写死 `--blue-1`、`--random-gray` 之类的实现色。
- 允许主题使用 `color-mix()`、`light-dark()` 等 Chromium 支持的标准 CSS。

## 3. 稳定选择器

以下选择器用于视觉覆盖，属于 v1 契约：

| 选择器 | 语义 |
|---|---|
| `.cm-md-h1` … `.cm-md-h6` | 标题行 |
| `.cm-md-blank` | 实时预览空行 |
| `.cm-md-strong` / `.cm-md-em` / `.cm-md-strike` | 粗体、斜体、删除线 |
| `.cm-md-inline-code` | 行内代码 |
| `.cm-md-highlight` | 高亮 |
| `.cm-md-link` | 链接 |
| `.cm-md-quote-line` | 引用行 |
| `.cm-md-list-line` / `.cm-md-list-bullet` | 列表行与项目符号 |
| `.cm-md-task-line` / `.cm-md-task` | 任务列表行与复选框容器 |
| `.cm-md-image` / `.cm-md-image img` | 行内图片 |
| `.cm-md-math` | 行内公式 |
| `.cm-md-hr` / `.cm-md-hr hr` | 分隔线 |
| `.cm-md-table-line` | 表格源码行 |
| `.cm-md-code-fence` | 代码围栏行 |
| `.cm-md-frontmatter` | Front Matter |
| `.cm-block` | 块组件根节点 |
| `.cm-code-block` | 代码块 |
| `.cm-table-block` | 表格块 |
| `.cm-math-block` | 公式块 |
| `.cm-mermaid-block` | Mermaid 块 |
| `.cm-toc-block` | TOC 块 |
| `.cm-frontmatter-block` | Front Matter 块 |
| `.cm-block-toolbar` | 块工具栏 |
| `.cm-block-action` | 块工具栏按钮 |
| `.cm-code-block .hljs-*` | 代码高亮 token，例如 `.hljs-keyword` |

### 不承诺稳定的选择器

- CodeMirror 生成类：`.cm-line`、`.cm-content`、`.ͼ...` 等。
- React 内部生成类或组件结构。
- `.cm-block-toolbar` 内部按钮顺序、`data-*` 私有属性。
- 表格控制面板的网格结构。

主题可以覆盖 `.cm-line` 的视觉属性，但不要依赖其 DOM 顺序；布局行为由核心负责。

## 4. 代码高亮

代码块通过 `--hljs-*` 变量控制高亮：

```css
.cm-code-block {
  --hljs-keyword: #d73a49;
  --hljs-string: #032f62;
  --hljs-comment: #6a737d;
}
```

内置主题保留 Bash 语法高亮，不采用纯灰显示。若要纯灰：

```css
.cm-code-block .hljs,
.cm-code-block .hljs * {
  color: var(--fg);
}
```

## 5. 导出边界与 Word 样式

Word 不加载 CSS 主题，使用 Pandoc 参考文档：

- 编辑器主题：CSS token / 选择器。
- Word 样式：`export.docx.referenceDoc` 指向的 `.docx`；设置页可选。
- 参考文档必须定义稳定样式名：`Normal`、`Heading 1–6`、`Quote`、`Source Code`、`Table`、`Footnote Text`。
- 参考文档只作为数据模板，不执行 JS；拒绝 `.docm` 和宏。
- 后续 ODT/EPUB/LaTeX 分别使用 `reference.odt`、主题 CSS、LaTeX 模板，不强行复用 CSS。

当前 HTML/PDF 导出使用独立的 `styles/export.css`，不会自动加载用户主题 CSS。导出已使用 `--link`、`--quote-border`、`--heading-divider` 等内置 token，但自定义主题的覆盖只影响编辑器。

后续若要让导出与编辑器完全一致，应在导出模板中注入 token 和用户主题 CSS，并继续走 DOMPurify 净化。

## 6. 样式来源边界

原始 DevTools 样式转储不进入仓库、不进入发行包，只作为本地测量记录。最终样式以独立 token 和选择器重写，不复制第三方主题文件、字体或图标。

## 7. 变更流程

1. 先判断能否用 token 解决。
2. 不能则新增稳定选择器或组件变量。
3. 更新本文档和内置主题。
4. 用 `samples/style-compare.md` 截图对比浅色/深色。
5. 运行 `npm run typecheck && npm test && npm run build`。