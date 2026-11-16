# 00 产品定义与范围

## 1. 项目定位

**LibrePen** 是一个 clean-room（净室）重写的 Typora 风格 Markdown 桌面编辑器。参考实现为 `E:\Typora`（Typora 1.9.5，Electron 30 / Chromium 124 / Node 20，编辑器核心为其自研 contenteditable + Node 树 + CodeMirror 5）。

重写目标不是逐字节复刻，而是：

1. 保留用户可感知的核心体验：所见即所得、文件即真相、低干扰界面。
2. 保留文件与配置的可迁移性：Markdown 源文件、编码/换行、`conf.user.json` 兼容子集、草稿恢复。
3. 用现代、安全、可维护的技术栈替代闭源加密主进程与老旧依赖。
4. 明确 MVP 边界，分阶段逼近功能对等。

> 法律与命名：本项目不复制 Typora 的代码、图标、主题文件或商标。产品名使用 LibrePen，窗口标题与 About 中注明「Clean-room Typora-compatible editor」。

## 2. 目标用户与场景

| 用户 | 场景 | 关键诉求 |
|---|---|---|
| 写作者 / 学生 | 长文、笔记、论文草稿 | 无干扰、实时渲染、大纲、字数 |
| 开发者 | README、技术文档、代码片段 | 代码高亮、表格、数学、导出 HTML/PDF |
| 知识管理者 | 本地 Markdown 文件夹 | 文件树、全文搜索、快速打开、自动保存 |

## 3. 设计原则

1. **文件优先**：磁盘上的 Markdown 是唯一真相；编辑器缓存只用于恢复，不作为第二数据源。
2. **源格式无损**：只做用户显式选择的格式化；不得静默改写 Markdown 语义。
3. **安全默认**：渲染进程无 Node 权限；本地文件只能通过类型化 IPC 与受控协议访问；HTML 默认净化。
4. **渐进式 WYSIWYG**：MVP 用 CodeMirror 6 装饰器实现「标记折叠 + 光标附近还原」；复杂块先用可编辑源码 + 样式，再迭代为块组件。
5. **可测量**：性能与验收标准写入 spec，用测试与手动清单验证。
6. **可迁移**：从 Typora 导入设置、最近文件、草稿；不写入 Typora 安装目录。

## 4. 范围

### 4.1 MVP（P0，本次交付）

- Electron 桌面应用，Windows 优先。
- 单文档单窗口；文件打开/保存/另存为；未命名文档。
- CodeMirror 6 Markdown 编辑器：
  - 实时预览：标题、强调/加粗/删除线/行内代码/高亮、链接、行内数学、图片、任务列表、水平线、代码围栏样式。
  - 光标进入 token 时还原 Markdown 标记。
  - 源码模式切换。
  - 撤销/重做、查找替换、自动括号、列表续行、标题/引用/列表/代码块/表格/数学块命令。
- 侧栏：文件树、大纲、文件夹搜索。
- 状态栏：字数/字符/行数/阅读时间、光标位置、编码、换行、保存状态。
- 主题：light / dark / system，CSS 变量契约。
- 设置：字体、字号、自动保存、恢复、换行、扩展名等。
- 自动保存与崩溃恢复草稿；关闭未保存确认。
- 图片：相对路径渲染、粘贴/拖拽入库到 `assets`。
- 导出 HTML、PDF、Word（DOCX）、ODT、RTF、EPUB（外部 Pandoc）、打印；不内置 Pandoc。
- 最近文件、会话恢复、单实例转发文件参数。
- 菜单与 Typora 兼容的常用快捷键。

### 4.2 P1（下一阶段）

- 表格可视化编辑（增删行列/对齐/拖拽）。
- 代码围栏块组件：只读高亮 + 点击进入编辑 + 语言选择。
- 数学块组件、Mermaid/流程图渲染缓存。
- TOC 块、YAML front matter 面板、脚注悬浮预览。
- 图片上传适配器（PicGo 等外部命令）、图片缩放。
- 导出图片、Markdown 变体、Pandoc LaTeX。
- 快速打开（模糊搜索）、多标签、分屏、专注/打字机模式。
- 主题目录兼容：读取用户 `themes` 文件夹、`base.user.css`、`{theme}.user.css`。

### 4.3 P2（远期）

- 多窗口同步、文本包 TextBundle/TextPack。
- 拼写检查与词典下载、自动更正。
- 表格拖拽重排、块级拖拽、图片上传面板。
- 国际化、自动更新、安装包与签名。
- 插件 API（若要提供，必须显式沙箱与权限模型）。

### 4.4 非目标

- 商业授权/试用/激活/设备绑定。
- 遥测、Sentry、匿名统计（默认永不启用）。
- 云端同步、协作、移动端。
- 复刻 Typora 的加密加载、反调试、`license-gen`。
- macOS 专属 API（后续按平台补齐）。

## 5. 参考实现事实基线

| 维度 | Typora 1.9.5 事实 | 重写策略 |
|---|---|---|
| 运行时 | Electron 30.0.9 / Node 20.11.1 / Chromium 124 | 使用当前稳定 Electron，开启 contextIsolation |
| 主进程 | `main.node` 原生入口 + AES 加密 `atom.js`，不可审计 | 普通 TypeScript 主进程，可审计 |
| 编辑器 | 自研 Node 树 + contenteditable + Brush 200ms 重解析，CodeMirror 5.26 仅用于源码模式/代码块 | CodeMirror 6 + Lezer 增量解析 + 装饰器 |
| 渲染 | marked 派生 InlineLexer、MathJax 3.2.2、Mermaid 10.9.1 | markdown-it（导出/预览）+ KaTeX + Mermaid 11 |
| 安全 | 编辑器 renderer 全量 Node、`contextIsolation=no`、`sandbox=false` | 最小 preload + contextBridge + 协议白名单 + CSP |
| 文件 | 2MB 渲染上限、jschardet/iconv-lite 编码检测、CRLF/final newline 保持、原子写 | 保留这些语义 |
| 恢复 | `%APPDATA%\Typora\draftsRecover\{date}-{name}.md`，关闭/失焦备份 | 兼容格式的恢复目录与索引 |
| 配置 | `%APPDATA%\Typora\conf\conf.user.json`（HJSON 兼容） | 读取兼容子集，写入自有 `settings.json` |
| 主题 | CSS 变量 + `current-theme.css` + user css | 采用同名核心变量，兼容用户 CSS 子集 |
| 快捷键 | 菜单 accelerator + `keyBinding` 覆盖 | 同等命令模型，支持 `keyBinding` 覆盖 |

## 6. 成功标准（MVP 验收）

1. `npm install && npm run dev` 可启动；`npm run build` 通过；`npm test` 全绿；`npm run typecheck` 无错误。
2. 打开一个 ≥100KB、含标题/列表/表格/代码/数学/图片的 Markdown 文件，编辑保存后源文件字节级语义不变（除用户编辑与显式换行设置）。
3. 关闭有未保存修改的窗口会弹出保存/放弃/取消；崩溃后重启能恢复草稿。
4. 渲染进程 `window.require`、`process` 均不可用；`nodeIntegration=false`、`contextIsolation=true`、`sandbox=true`。
5. 冷启动到可输入 < 1.5s（开发机基线）；10 万字文档输入无可感知卡顿（装饰器仅处理视口）。
6. 导出 HTML 在无网络环境可打开；PDF 由 Chromium `printToPDF` 生成。

## 7. 术语

- **Live Preview**：光标不在 token 内时隐藏 Markdown 标记并渲染；光标进入时显示原始标记。
- **Block Widget**：替换整块源码的 CM6 组件（数学块、表格、代码块）。
- **Draft / Recovery**：未保存内容的恢复快照。
- **Clean-room**：不读取/复制参考实现源码，仅依据公开行为、文档与黑盒观察独立实现。
