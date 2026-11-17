# 13 插件系统设计

状态：设计草案，未实现。  
具体能力从工作流推导，见 `14-plugin-capabilities.md`。  
目标：让 LibrePen 可以安装、启用、停用和卸载插件，同时不破坏现有的 Electron 安全边界。

## 0. 内核收缩策略

采用“有限收缩内核”：内核只保留编辑器的稳定主干，功能通过插件发布，但不把默认体验拆散。

### 0.1 内核保留

- CodeMirror 编辑器、源码/实时预览、Markdown 基础语法；
- 文件打开/保存/编码/换行/原子写、最近文件、会话、草稿恢复；
- 侧栏、搜索、设置、快捷键、基础主题；
- HTML/PDF/打印、图片粘贴与本地图片解析；
- 插件宿主：manifest、注册表、权限、安装/启用/停用、插件设置页。

内核的职责是“可靠地编辑和保存 Markdown”，不是承载所有格式和生态功能。

### 0.2 官方插件（小众但重要）

由核心团队维护、随应用捆绑或一键安装，保证兼容性和升级：

- Word/ODT/RTF/EPUB 等文档导出；
- LaTeX、Typst、幻灯片、静态站点发布；
- AI、同步/协作、引用管理、PDF 批注、OCR、Jupyter 等重功能；
- 官方主题包和官方导出模板。

### 0.3 社区插件（小众且不重要）

只提供稳定 API 和安全边界，不做兼容性承诺：

- OPML、RST、MediaWiki、Textile 等低频格式；
- 长图导出、特殊代码块渲染、个人化片段；
- 社区主题、个人工作流扩展。

### 0.4 判定规则

| 条件 | 归属 |
|---|---|
| 大多数用户每次写作都依赖 | 内核 |
| 影响文件安全、数据完整性、启动稳定性 | 内核 |
| 低频但高价值，且需要官方持续维护 | 官方插件 |
| 低频、低维护价值、可由社区独立完成 | 社区插件 |
| 需要外部二进制（Pandoc/TeX/Typst/Python） | 优先插件，不进入内核 |
| 需要网络、账号或云服务 | 插件，权限显式声明 |

关键原则：**收缩的是内核代码，不是默认能力**。官方插件随安装包提供并默认启用；插件化是为了隔离依赖、降低攻击面和加快迭代，不是让用户自己找功能。

### 0.5 迁移顺序

1. 先把导出改为 provider registry，保留现有格式为内置 provider。
2. 引入插件宿主和声明式插件，Word/LaTeX 等作为官方插件包发布。
3. 再把 AI、同步、引用等重功能迁到 L1 沙箱插件。
4. 最后开放社区插件目录；不先做市场，避免过早承诺。

### 0.6 Loader 能力先于接口

先定义 loader 负责什么，再定义插件 API；否则 API 会被加载细节绑架。

**Loader 负责：**

1. 发现插件目录、内置插件和已安装插件；
2. 安装/卸载/更新、原子替换、失败回滚；
3. manifest/schema/semver/入口路径校验；
4. 信任级别、权限批准、安全模式；
5. 运行时隔离：Worker / iframe / utilityProcess / trusted renderer；
6. 激活事件、懒加载、依赖顺序、超时和崩溃隔离；
7. 插件资源协议、MIME、CSP、路径白名单；
8. 配置与数据目录、迁移、日志、诊断；
9. 启用/停用/重载状态机；
10. 向设置页提供可展示的插件状态和错误。

**Loader 不负责：**

- 某个菜单项具体长什么样；
- 导出格式的具体参数语义；
- 编辑器 Widget 如何渲染；
- 插件业务逻辑和第三方服务集成。

**Loader 交付给 API 的契约：**

```ts
interface LoadedPlugin {
  manifest: PluginManifest
  trust: 'declarative' | 'sandboxed' | 'trusted'
  dataDir: string
  activate(context: PluginContext): Promise<void>
  deactivate(): Promise<void>
}
```

具体能力由 registry 提供，例如 `commands.register`、`exporters.register`、`themes.register`；loader 只保证插件在正确权限和生命周期下获得这些 registry。

**先定的 loader 能力矩阵：**

| 能力 | Loader | API / Registry |
|---|---|---|
| 发现/安装/卸载 | 是 | 否 |
| manifest/权限校验 | 是 | 只读 manifest |
| 隔离与进程/线程 | 是 | 不可见 |
| 激活/停用/超时 | 是 | 提供生命周期钩子 |
| 配置/数据目录 | 是 | 读写自己的数据 |
| 命令/菜单 | 注册机制 | 提供贡献描述 |
| 导出 provider | 解析和权限 | 声明格式/参数 |
| 主题/片段 | 安装和资源协议 | 提供静态声明 |
| 编辑器/Markdown 扩展 | 仅 trusted | 提供扩展点 |

### 0.7 参考实现

| 参考 | 值得借鉴 | 不应照搬 |
|---|---|---|
| Obsidian | `manifest.json` + `main.js` + `styles.css` + `data.json`；`Plugin` 生命周期；命令、编辑器扩展、Markdown 后处理、设置页的 API 手感；社区插件安装体验 | 插件直接运行在主渲染器、无权限声明、无沙箱；安全边界不适合 LibrePen |
| VS Code | extension host 隔离、`contributes` 声明式贡献、`activationEvents` 懒加载、`engines` 版本约束、workspace trust、安全模式、extension bisect、日志 | 体量和 API 面太大，不适合直接复制 |
| Figma | 插件 UI 在沙箱 iframe 中运行，manifest 声明能力，宿主通过消息通信 | iframe UI 模型不适合所有编辑器扩展 |
| Chrome Extensions | manifest permissions、按权限授权、内容脚本隔离 | 权限提示过重，桌面编辑器不需要那么细 |
| Joplin / Logseq | Markdown 编辑器的插件市场、命令和面板扩展经验 | 安全模型和 API 稳定性有限 |

推荐组合：**Obsidian 的插件体验 + VS Code 的 loader 隔离与激活模型 + Figma/Chrome 的权限和沙箱思路**。

## 1. 结论

可以做，但建议分三层，不要第一步就允许任意 JavaScript 进入主窗口：

| 层级 | 形式 | 能做什么 | 安全策略 |
|---|---|---|---|
| L0 声明式插件 | `plugin.json` + CSS/模板/静态资源 | 主题、导出预设、导出模板、片段、状态栏文字 | 不执行代码，默认低风险 |
| L1 沙箱插件 | Worker / iframe / utilityProcess | 命令、纯文本转换、侧栏面板、状态栏交互 | 权限声明 + 宿主 API，无直接 Node/DOM 访问 |
| L2 可信插件 | renderer 扩展、CodeMirror/Markdown-it 扩展 | 深度编辑器集成 | 开发者模式 + 明确信任 + 风险提示 |

推荐路线：先做 **L0**，把 LaTeX 导出作为第一个插件；再做 **L1**；L2 最后做，且不进入默认插件市场。

## 2. 设计原则

- 插件默认最小权限，默认禁用代码插件。
- 插件不能直接拿到 `ipcRenderer`、`fs`、`child_process` 或主进程对象。
- 插件代码不进入 main process；主进程侧逻辑只能运行在 `utilityProcess`。
- 所有路径、manifest、导出参数在 main 二次校验。
- 插件崩溃、加载失败或超时不能阻塞应用启动。
- 插件安装不自动联网；先支持本地文件夹/ZIP。
- 插件 API 从第一天做版本号，避免以后无法兼容。

## 3. 插件包格式

```text
plugins/
  librepen.latex-export/
    plugin.json
    icon.svg
    themes/
    templates/
    snippets/
    sandbox/
      worker.js
      panel.html
    trusted/
      renderer.js
```

用户插件目录：

```text
<userData>/plugins/<plugin-id>/
<userData>/plugin-data/<plugin-id>/
<userData>/plugins.json
```

`plugins.json` 保存启用状态和权限批准，不与 `settings.json` 混在一起，避免设置版本迁移被插件污染。

## 4. Manifest

```json
{
  "id": "librepen.latex-export",
  "name": "LaTeX Export",
  "version": "1.0.0",
  "apiVersion": 1,
  "engines": { "librepen": ">=0.3.0" },
  "description": "Export Markdown to LaTeX or PDF via LaTeX.",
  "author": "LibrePen contributors",
  "contributes": {
    "exporters": [
      {
        "id": "latex",
        "label": "LaTeX (.tex)",
        "extension": "tex",
        "kind": "pandoc",
        "to": "latex",
        "standalone": true,
        "toc": "raw",
        "requires": ["pandoc"]
      },
      {
        "id": "latex-pdf",
        "label": "PDF (LaTeX)",
        "extension": "pdf",
        "kind": "pandoc",
        "to": "pdf",
        "pdfEngine": "xelatex",
        "requires": ["pandoc", "xelatex"]
      }
    ],
    "commands": [
      { "id": "export-latex", "title": "导出 LaTeX", "command": "export:latex" }
    ],
    "statusBar": [
      { "id": "latex-status", "text": "LaTeX", "command": "plugin.librepen.latex-export.status" }
    ],
    "themes": [
      { "id": "paper", "label": "Paper", "path": "themes/paper.css" }
    ]
  },
  "permissions": []
}
```

约束：

- `id` 使用反向域名，长度上限 128，只允许小写字母、数字、点、短横线。
- `version` 使用 semver。
- `apiVersion` 当前只接受 `1`。
- `main`/`renderer`/`sandbox` 入口缺失时只能做声明式插件。
- 所有资源路径必须是插件目录内的普通文件，拒绝 `..`、绝对路径、符号链接、UNC 和设备路径。

## 5. 运行时架构

```text
Main
  PluginService
    - 扫描、校验、启用/禁用、安装/卸载
    - plugins.json、plugin-data
    - 内置插件 resources/plugins
    - utilityProcess 管理 L1 主进程侧代码
    - plugin:// 协议提供插件资源
        |
        | IPC: plugins:list / plugins:set-enabled / plugins:install ...
        v
Preload
  window.api.plugins.*
        |
        v
Renderer
  PluginRuntime
    - L0 contribution registries
    - L1 Worker / sandboxed iframe
    - L2 trusted import（默认关闭）
```

### 5.1 资源协议

新增 `plugin://<id>/<path>`，由 main 注册为 `standard/secure/supportFetchAPI`：

- 只允许已启用插件的目录。
- 只允许普通文件；限制 MIME 和大小。
- 每个插件返回独立的 CSP。
- 主 renderer 不直接加载插件脚本；沙箱 iframe 使用 `sandbox="allow-scripts"`，不加 `allow-same-origin`。

### 5.2 L0：声明式插件

不执行 JS，直接注册：

- 主题 CSS；
- Pandoc 导出描述；
- 导出模板、参考文档；
- 片段（snippets）；
- 静态状态栏项；
- 命令到现有命令的映射。

这是最安全的插件层，也是 LaTeX 导出插件需要的最小能力。

### 5.3 L1：沙箱插件

按能力拆运行环境：

- **Worker**：纯 Markdown/文本转换，无 DOM、无 Node、默认无网络。
- **sandbox iframe**：侧栏面板、设置页、复杂 UI；通过 `postMessage` 调用宿主 API。
- **utilityProcess**：需要文件、网络或外部进程的主进程侧任务；通过 main 的权限代理执行。

L1 插件不能直接操作 CodeMirror 文档；需要读写文档时，只能调用宿主提供的受限命令。

### 5.4 L2：可信插件

仅开发者模式启用，允许：

- CodeMirror 扩展；
- Markdown-it 插件；
- 自定义渲染器/Widget；
- 主进程侧 Node API。

启用时显示明确警告：插件可访问当前文档和本机资源。L2 不做自动安装、不做静默更新。

## 6. 贡献点

第一版建议只实现：

- `exporters`：Pandoc 描述和 L1 命令式导出；
- `themes`：插件主题；
- `commands`：带命名空间的命令；
- `menus`：把命令挂到文件/导出/插件菜单；
- `statusBar`：纯文本/图标状态栏项；
- `snippets`：文本片段。

后续再做：

- `panels`：沙箱 iframe 侧栏面板；
- `settings`：JSON Schema 设置表单；
- `markdown`：Markdown-it 扩展（L2）；
- `editor`：CodeMirror 扩展（L2）；
- `events`：文档打开/保存/导出前后事件。

命令 ID 统一为：

```text
plugin.<plugin-id>.<command-id>
```

导出 provider ID 统一为：

```text
plugin.<plugin-id>.<exporter-id>
```

## 7. 权限

建议的权限集合：

| 权限 | 说明 |
|---|---|
| `plugin:storage` | 读写自己的 `plugin-data` |
| `files:read` | 读取用户选择的文件/目录 |
| `files:write` | 写入用户选择的文件/目录 |
| `network:https` | 访问 HTTPS |
| `clipboard` | 读写剪贴板 |
| `shell:openExternal` | 打开外部链接 |
| `editor:read` | 读取当前文档 |
| `editor:write` | 修改当前文档 |
| `export:run` | 运行导出任务 |
| `process:spawn` | 调用外部程序（L2/白名单） |
| `app:commands` | 调用宿主命令 |

规则：

- 安装或启用时展示权限，用户可拒绝。
- 未批准的权限调用直接失败，不弹二次窗口。
- `process:spawn` 只允许白名单程序，参数化传递，不经过 shell。
- 插件不能读取 `settings.json`、`recent.json`、草稿和任意用户文件，除非有明确授权。

## 8. 生命周期

1. 启动扫描 `plugins/` 和内置插件目录。
2. 校验 manifest、版本、入口文件和大小。
3. 读取 `plugins.json`，只加载已启用插件。
4. L0 立即注册；L1/L2 检查权限后加载。
5. 加载超时、异常或崩溃：记录日志、禁用该插件、显示可恢复错误，不影响主窗口。
6. 设置页支持启用/停用、重新加载、打开目录、卸载、查看日志。
7. 提供 `--disable-plugins` 安全模式，防止坏插件导致启动循环。
8. 卸载时默认保留 `plugin-data`，提供“同时删除插件数据”选项。

## 9. 第一个插件：LaTeX 导出

不建议把 LaTeX 直接硬编码进核心；先把它做成插件系统的样板：

- `latex`：`pandoc --to latex --standalone`，生成 `.tex`，只需要 Pandoc。
- `latex-pdf`：`pandoc --to pdf --pdf-engine=xelatex`，需要 TeX 发行版。
- `[toc]` 在 `.tex` 导出中转换为 `\tableofcontents`。
- 图片继续使用 `--resource-path`；SVG 复用现有栅格化逻辑。
- 模板路径、CJK 字体、页边距通过插件设置或 manifest 参数提供。
- 缺少 Pandoc/TeX 时返回明确提示，不自动安装。

为了支持它，核心需要先做一个小重构：

- 把导出的固定格式表改为 **provider registry**；
- 核心 HTML/PDF/Word/ODT/RTF/EPUB 继续作为内置 provider；
- 渲染层从插件 manifest 读取导出菜单项；
- main 解析 provider ID，校验属于已启用插件后再执行 Pandoc。

这样以后新增 Markdown 变体、RST、OPML、图片导出，也可以走同一套接口。

## 10. 分阶段计划

### Phase A：L0 + LaTeX（建议先做）

- manifest/schema/校验；
- PluginService、plugins.json、插件目录；
- 设置页“插件”列表；
- 声明式主题和 Pandoc 导出 provider；
- LaTeX `.tex` 内置/示例插件；
- 安装/启用/停用/卸载/重载；
- 单元测试和安全用例。

### Phase B：L1 沙箱

- Worker/iframe/utilityProcess 运行时；
- 权限批准 UI；
- 插件命令、状态栏、侧栏面板；
- 事件 API；
- 示例插件和开发文档。

### Phase C：L2 与生态

- trusted renderer 扩展；
- Markdown-it/CodeMirror 扩展；
- 插件签名、校验和、更新检查；
- 可选市场/索引；
- 兼容性矩阵和 API 弃用策略。

## 11. 验收与测试

必须覆盖：

- 非法 manifest、版本不兼容、缺入口文件被拒绝；
- ZIP 路径穿越、`..`、绝对路径、符号链接被拒绝；
- 禁用插件不出现在菜单；
- LaTeX 插件导出中文、公式、图片、`[toc]` 正常；
- 插件崩溃/超时不影响启动；
- 未授权文件/网络访问失败；
- `--disable-plugins` 可启动；
- 导出参数不经过 shell，不能注入命令；
- 插件卸载/更新不破坏 `plugin-data`；
- L0 插件不执行任何 JS。

## 12. 未决问题

- 第一版是否只做 L0，还是必须支持 JS 插件？
- 插件是否需要修改编辑器渲染（这会把范围推到 L2）？
- 是否允许工作区级插件（`.librepen/plugins`）？建议先不允许。
- 是否做插件市场？建议先本地安装，市场后置。
- 插件设置用 JSON Schema 表单，还是先让插件写自己的配置文件？
- L1 的面板 UI 是否允许 iframe 外部加载图片/字体？需要单独 CSP 策略。