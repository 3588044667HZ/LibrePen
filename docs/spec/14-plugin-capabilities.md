# 14 插件能力：从工作流推导

状态：设计草案，未实现。  
原则：参考进程模型、加载方式和安全设计；**具体能力不从 Obsidian/VS Code 照搬，而是从 LibrePen 自己的工作流推导**。

## 1. 方法

按以下顺序做，不先列 API：

```text
工作流 -> 阶段 -> 宿主状态 -> 可扩展点 -> 能力 -> 信任层级 -> Loader 支持
```

一个问题决定一个能力是否成立：

1. 这个能力对应哪个真实工作流？
2. 该工作流当前由谁持有状态？
3. 插件能安全地看到什么、修改什么？
4. 失败、撤销、保存冲突时谁负责？
5. 需要代码、DOM、文件、网络还是外部进程？
6. 能否用声明式插件完成？

## 2. 工作流总表

| 编号 | 工作流 | 关键阶段 | 插件可介入点 | 建议层级 |
|---|---|---|---|---|
| W1 | 启动与恢复 | 设置/最近文件 -> 窗口 -> 会话/草稿 | 启动激活、设置页、状态栏、菜单 | L0/L1 |
| W2 | 打开与导入 | 选择文件 -> 解码 -> 建文档 | 导入 provider、打开事件 | L1/L2 |
| W3 | 编辑与选择 | 输入 -> 命令 -> 事务 -> 撤销 | 命令、文本转换、选区操作、编辑器扩展 | L1/L2 |
| W4 | 实时预览与渲染 | Markdown -> token -> Widget/HTML | Markdown 扩展、块渲染、后处理 | L0/L2 |
| W5 | 保存与恢复 | 序列化 -> 编码/换行 -> 原子写 -> 草稿 | 保存前格式化、保存后事件 | L1/L2 |
| W6 | 搜索、大纲与导航 | 扫描/索引 -> 命中 -> 跳转 | 搜索 provider、大纲 provider | L1 |
| W7 | 导出与打印 | 渲染 -> provider -> 外部进程 -> 落盘 | 导出 provider、前后处理、资源解析 | L0/L1 |
| W8 | 设置、主题与 UI | 配置 -> 主题 -> 状态/面板 | 设置 schema、主题、状态栏、面板 | L0/L1 |
| W9 | 图片与资源 | 粘贴/拖拽 -> 资源写入 -> 引用 | 上传适配器、资源解析器、导入 | L1 |
| W10 | 关闭与会话 | 脏检查 -> 保存 -> 会话落盘 | 关闭前事件、状态清理 | L1 |

## 3. 逐条工作流

### W1 启动与恢复

当前实现：`src/main/index.ts` 读取 `settings.json`/`session.json`/`recent.json`，创建窗口；`App.tsx` 恢复最近文件或草稿。

可扩展点：

- `onStartup`：插件初始化，不做重活；
- 设置页条目、状态栏项、菜单项；
- 启动时读取插件自己的配置。

能力：

- `app.info`、`app.getPath('pluginData')`；
- `commands.register`、`ui.addStatusBarItem`、`settings.register`；
- `lifecycle.onStartup`。

不建议开放：任意窗口控制、替换启动流程、阻塞启动的同步任务。

### W2 打开与导入

当前实现：`App.tsx` 通过 `window.api.files.read` 得到 `DocPayload`，包含内容、编码、换行、mtime；文件来源包括对话框、最近文件、文件树、快速打开、CLI、拖拽和草稿。

可扩展点：

- 打开后的 `onDocumentOpen` 通知；
- 导入 provider（Markdown、DOCX、EPUB、PDF 等）；
- 打开前的格式识别/转换；
- 最近文件/文件树的展示增强（后续）。

能力：

- `documents.current`：只读元数据和内容快照；
- `documents.onOpen`、`documents.onClose`；
- `import.registerProvider`（L1/L2，受权限控制）；
- `files.read` 只能读取用户显式选择的文件，不能扫描任意目录。

边界：编码检测、BOM、mtime、最近文件和草稿仍由宿主负责；插件不能直接改写打开流程的结果。

### W3 编辑、选择与命令

当前实现：`Editor.tsx` 持有 CodeMirror 6 状态；命令通过 `handleCommand` 和 `EditorHandle.command` 分发；实时预览由 `livePreview.ts` 计算装饰。

可扩展点：

- 命令/快捷键/右键菜单；
- 对选区做文本转换；
- 文档变更和光标事件；
- L2：CodeMirror 扩展、自动补全、Widget、自定义块。

能力（L1）：

- `editor.getSelection`、`editor.replaceSelection`；
- `editor.applyTransaction`：所有修改进入撤销栈；
- `editor.onSelectionChange`、`editor.onDocumentChange`；
- `commands.register`，ID 必须命名空间化；
- `ui.addContextMenuItem`。

能力（L2）：

- `editor.registerExtension`；
- `editor.registerAutocomplete`；
- `editor.registerBlockWidget`。

边界：插件不能直接修改文件，也不能绕过 CodeMirror 事务；插件改动必须可撤销，保存仍由宿主完成。

### W4 实时预览与渲染

当前实现：编辑区由 `livePreview.ts` 处理；导出由 `exportHtml.ts` 用 markdown-it、KaTeX、Mermaid、highlight.js 和 DOMPurify 渲染。

可扩展点：

- 声明式：主题 CSS、导出模板；
- L2：markdown-it 插件、语法/围栏渲染器、HTML 后处理、自定义 Widget；
- L1：纯文本 Markdown 预处理器（Worker）。

能力：

- `render.transformMarkdown`（L1 Worker，纯文本输入/输出）；
- `render.registerMarkdownPlugin`（L2）；
- `render.registerFenceRenderer`（L2）；
- `render.postProcessHtml`（L2，输出仍过 DOMPurify）；
- `themes.register`（L0）。

边界：插件输出不能绕过 DOMPurify、CSP 和图片协议白名单；渲染失败不能阻塞导出。

### W5 保存与恢复

当前实现：`App.tsx` 序列化当前文本；main 处理编码、EOL、末尾换行、原子写、mtime 冲突；草稿服务独立恢复。

可扩展点：

- 保存前格式化/规范化（例如 Prettier）；
- 保存后通知、索引、同步；
- 加密/压缩等高风险转换（默认不做）。

能力：

- `documents.onWillSave`：只读，返回可选的文本转换建议；
- `editor.format`：通过编辑事务应用格式化；
- `documents.onDidSave`、`documents.onDidSaveError`；
- `storage` 写插件自己的数据。

边界：插件不能直接写用户文档；不能改变编码、BOM、换行和原子写语义；不能吞掉保存错误。

### W6 搜索、大纲与导航

当前实现：main 的 `SearchService` 做全文搜索；`Sidebar` 展示大纲和搜索结果；`shared/markdown` 提取标题。

可扩展点：

- 搜索 provider（例如语义搜索、引用搜索、远程知识库）；
- 大纲 provider；
- 跳转命令。

能力：

- `search.registerProvider`：接收 query/root，返回标准化 `SearchHit[]`；
- `outline.registerProvider`；
- `ui.navigateTo`。

边界：结果数量和扫描时间由宿主限制；插件不能静默上传文档内容。

### W7 导出与打印

当前实现：`App.tsx` 生成 HTML；main 的 `ExportService` 处理 HTML/PDF/打印和 Pandoc 文档导出；Word 还支持 reference doc。

可扩展点：

- 导出 provider：声明式 Pandoc（L0）或沙箱命令（L1）；
- Markdown 预处理、HTML 后处理；
- 资源解析器；
- LaTeX/Typst/EPUB/幻灯片等格式。

能力：

- `export.registerProvider`；
- `export.onBeforeRender`、`export.onAfterRender`；
- `assets.registerResolver`；
- `process.spawn`：仅白名单程序、参数数组、无 shell（L1/L2）。

边界：保存对话框、临时文件、超时、错误、清理和大小限制仍由宿主负责；插件不能直接决定最终写入路径。

### W8 设置、主题与 UI

当前实现：`SettingsDialog` 管理设置；`ThemeService` 读取用户主题目录；`StatusBar` 展示状态；`Sidebar` 有固定标签页。

可扩展点：

- 设置 schema 表单；
- 主题包；
- 状态栏项、侧栏面板、通知；
- 命令面板/菜单项。

能力：

- `settings.register`：JSON Schema 或字段描述；
- `themes.register`；
- `ui.addStatusBarItem`、`ui.addPanel`（sandbox iframe）、`ui.showToast`；
- `settings.get` 仅返回插件自己的配置。

边界：插件不能修改核心设置；不能注入任意 DOM 到主窗口；面板必须在 sandbox iframe 中。

### W9 图片、剪贴板与资源

当前实现：粘贴/拖拽通过 `file.importImage` 写入 `assets/` 或指定目录；渲染用 `mdimg://`。

可扩展点：

- 图片上传适配器（PicGo/图床）；
- 资源解析器；
- 导入和 OCR。

能力：

- `assets.registerResolver`；
- `clipboard.readImage`/`writeText`；
- `files.write` 仅限用户授权的目录；
- `network.https`（需权限）。

边界：资源路径和扩展名仍由宿主校验；不允许任意路径覆盖。

### W10 关闭与会话

当前实现：main 拦截窗口关闭，检查 dirty，保存或丢弃；renderer 保存会话状态。

可扩展点：

- `onShutdown`：flush 插件状态、取消任务；
- 会话恢复回调；
- 导出/同步任务取消。

能力：

- `lifecycle.onShutdown`；
- `app.onSessionRestore`；
- `storage.flush`。

边界：插件不能阻止关闭、不能修改关闭确认结果；超时后宿主强制结束插件。

## 4. 推导出的能力域

### 4.1 宿主/生命周期

```ts
app.info
app.getPath('pluginData')
lifecycle.onStartup
lifecycle.onShutdown
lifecycle.onDocumentOpen
lifecycle.onDocumentClose
lifecycle.onSettingsChange
```

### 4.2 命令与 UI

```ts
commands.register
commands.execute
ui.addStatusBarItem
ui.addContextMenuItem
ui.addPanel        // sandbox iframe
ui.showToast
ui.navigateTo
settings.register
```

### 4.3 文档与编辑器

```ts
documents.current
documents.onOpen
documents.onSave
documents.onWillSave
editor.getSelection
editor.replaceSelection
editor.applyTransaction
editor.onSelectionChange
editor.onDocumentChange
editor.format
editor.registerExtension      // L2
editor.registerAutocomplete   // L2
editor.registerBlockWidget    // L2
```

### 4.4 渲染与导出

```ts
render.transformMarkdown      // L1 worker
render.registerMarkdownPlugin // L2
render.registerFenceRenderer  // L2
render.postProcessHtml        // L2
export.registerProvider
export.onBeforeRender
export.onAfterRender
assets.registerResolver
```

### 4.5 搜索与数据

```ts
search.registerProvider
outline.registerProvider
storage.get / storage.set / storage.remove
files.read / files.write       // 用户授权范围
network.https                  // 权限
clipboard.readImage / writeText
process.spawn                  // 白名单、L2
```

## 5. 激活事件

激活事件由 Loader 统一调度，插件只在需要时加载：

```text
onStartup
onCommand:<command-id>
onDocumentOpen
onDocumentSave
onExport:<provider-id>
onSearch
onView:<panel-id>
onSettings
onThemeChange
onShutdown
```

L0 声明式插件不需要激活事件，启动时直接注册主题/导出菜单/片段。

## 6. 信任层级与能力对应

| 能力 | L0 声明式 | L1 沙箱 | L2 可信 |
|---|---|---|---|
| 主题、模板、片段 | 是 | 是 | 是 |
| 静态命令映射 | 是 | 是 | 是 |
| 导出 provider（Pandoc 描述） | 是 | 是 | 是 |
| 命令处理、状态栏 | 否 | 是 | 是 |
| 文档只读事件 | 否 | 是 | 是 |
| 通过事务编辑文档 | 否 | 是 | 是 |
| 侧栏面板 | 否 | 是（iframe） | 是 |
| Markdown-it/CodeMirror 扩展 | 否 | 否 | 是 |
| 文件/网络/进程 | 否 | 权限控制 | 权限控制 |

## 7. 分阶段能力

### Phase A：L0

- `themes.register`
- `export.registerProvider`（只支持声明式 Pandoc 描述）
- `snippets.register`
- `ui.addStaticStatusBarItem`
- `commands.registerAlias`
- LaTeX `.tex` 官方插件

### Phase B：L1

- 激活事件、命令处理、状态栏、沙箱面板；
- `documents.current`、`documents.onOpen/Save`；
- `editor.getSelection/replaceSelection/applyTransaction`；
- `render.transformMarkdown`；
- `export.onBeforeRender/onAfterRender`；
- `storage`、`settings`；
- 受权限控制的 `files`、`network`、`clipboard`。

### Phase C：L2

- `editor.registerExtension`、`editor.registerAutocomplete`；
- `render.registerMarkdownPlugin`、`render.registerFenceRenderer`；
- `render.postProcessHtml`；
- trusted renderer 加载；
- `process.spawn` 仅白名单。

## 8. 能力准入规则

新增能力前必须回答：

1. 它属于哪个工作流、哪个阶段？
2. 宿主当前状态是什么？插件需要读还是写？
3. 失败时能否回滚/撤销？
4. 是否必须执行代码？能否声明式完成？
5. 是否需要 DOM？需要则只能 L2。
6. 是否需要文件/网络/进程？需要则必须显式权限。
7. 是否有卸载/停用时的清理路径？
8. 是否绕过现有安全边界？如果是，拒绝。

## 9. 明确不开放

- 直接访问 `ipcRenderer`、`fs`、`child_process`、`BrowserWindow`；
- 直接写用户文档、绕过编码/换行/原子写/冲突检测；
- 绕过 DOMPurify、CSP、`mdimg://` 白名单；
- 替换保存对话框、静默覆盖文件；
- 静默联网、上传文档内容；
- 阻止窗口关闭或修改关闭确认结果；
- 在主 renderer 中注入未净化 HTML。

## 10. 结论

LibrePen 的插件能力应来自 W1-W10 的工作流，而不是 Obsidian 的 API 清单。Loader 只负责“在正确时机、正确权限、正确隔离下把能力交给插件”；具体能力由文档、编辑器、渲染、导出、搜索、UI、资源这些工作流决定。

下一步先冻结 Loader 的激活事件、状态机和能力授权；再定义 `PluginContext` 与各 registry 的 v1 接口。