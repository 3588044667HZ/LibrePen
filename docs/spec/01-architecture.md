# 01 技术架构

## 1. 技术选型

| 层 | 选型 | 版本基线 | 理由 |
|---|---|---|---|
| 桌面运行时 | Electron | 33.x（LTS 思路） | 与参考一致；Chromium 打印/PDF；Windows 生态成熟 |
| 构建 | electron-vite + Vite | 3.x / 6.x | 主进程、preload、renderer 三端统一构建与 HMR |
| 语言 | TypeScript（strict） | 5.7+ | IPC 契约与编辑器扩展需要类型约束 |
| UI 框架 | React | 19.x | 仅用于壳层 UI（侧栏/设置/对话框）；编辑器为原生 CM6 |
| 编辑器 | CodeMirror 6 + Lezer | 6.x | 增量解析、虚拟化、装饰器/Widget 生态，替代自研 contenteditable |
| Markdown 渲染 | markdown-it + 插件 | 14.x | 导出/预览/大纲；插件覆盖 GFM 与扩展语法 |
| 数学 | KaTeX | 0.16.x | 同步渲染、体积可控；Mermaid 内部亦用 KaTeX |
| 图表 | Mermaid | 11.x | 懒加载，P1 完善 |
| 代码高亮 | highlight.js | 11.x | 导出 HTML 与代码块 Widget |
| HTML 净化 | DOMPurify | 3.x | 导出与 HTML 预览 |
| 测试 | Vitest | 2.x | 纯函数与主进程服务测试 |
| 打包 | electron-builder | P1 | MVP 只要求构建产物可运行 |

**不采用**：Tauri（本机无 Rust 工具链）、自研 contenteditable Node 树（复杂度/IME/选区风险高）、CodeMirror 5（EOL）。

## 2. 进程模型

```text
┌──────────────────────────── Main (Node) ────────────────────────────┐
│ app lifecycle · BrowserWindow · native menu · dialogs               │
│ fs read/write/atomic save · encoding · recent files · settings      │
│ drafts/recovery · folder tree · search · export/print · clipboard    │
│ protocol: mdimg:// (allowlisted image files)                         │
└───────────────▲──────────────────────────────────────┬──────────────┘
                │ ipcMain.handle (typed)               │ events
┌───────────────┴──────────────────────────────────────▼──────────────┐
│ Preload (sandboxed) — contextBridge.exposeInMainWorld('api', ...)   │
│ 无 Node 模块暴露；仅白名单方法；所有入参在 main 二次校验              │
└───────────────▲──────────────────────────────────────┬──────────────┘
                │ window.api.*                          │ onCommand
┌───────────────┴──────────────────────────────────────▼──────────────┐
│ Renderer (React + CodeMirror 6)                                     │
│ 文档缓冲区 · EditorState · 实时预览装饰 · 侧栏 · 状态栏 · 设置 UI     │
│ 不直接访问 fs；图片经 mdimg://；导出内容经 IPC 交给 main              │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.1 BrowserWindow 安全配置

```ts
new BrowserWindow({
  webPreferences: {
    preload,
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webviewTag: false,
    spellcheck: true,
  },
})
```

- 禁止 `window.open`；`setWindowOpenHandler` 仅允许 https 外链交给系统浏览器。
- `will-navigate` 阻止导航离开应用。
- CSP（renderer/index.html）：

```text
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' mdimg: data: blob: https:;
font-src 'self' data:;
connect-src 'self' ws://localhost:* http://localhost:*;
frame-src 'none';
object-src 'none';
```

> 开发模式 HMR 需要 localhost 连接；生产移除 `ws/http localhost`。
> 图片允许 https 是为了远程图片；不加载远程脚本。

### 2.2 本地文件访问

- 所有路径操作在 main 完成，统一 `assertInsideAllowed()` 与 `normalize()`。
- 图片协议：`mdimg://local/<base64url(absPath)>?v=mtime`。
  - 仅允许图片扩展名（png/jpg/jpeg/gif/webp/svg/bmp/avif）。
  - 拒绝 `..`、UNC、设备路径；校验文件存在与大小（≤ 32MB）。
  - 注册为 `standard/secure/supportFetchAPI/stream`。
- 导出/打印使用隐藏窗口加载 `data:` 或临时 HTML 文件，禁用 Node。

## 3. 目录结构

```text
docs/spec/                 规格（本目录）
src/main/
  index.ts                 入口：单实例、窗口、协议、生命周期
  window.ts                BrowserWindow 工厂与状态
  menu.ts                  原生菜单 + accelerator -> command
  ipc/register.ts          IPC 注册总表
  ipc/window.ts            窗口控制
  ipc/files.ts             打开/保存/另存/目录树/最近文件
  ipc/settings.ts          设置读写
  ipc/drafts.ts            恢复草稿
  ipc/search.ts            文件夹搜索
  ipc/export.ts            HTML/PDF/打印
  ipc/clipboard.ts         图片剪贴板
  lib/atomic-write.ts      原子写
  lib/encoding.ts          编码/BOM/换行检测
  lib/paths.ts             路径校验
  lib/protocol.ts          mdimg 协议
  lib/store.ts             JSON 持久化（原子写）
  lib/search-files.ts      有界全文扫描
src/preload/index.ts       contextBridge API
src/shared/
  ipc.ts                   IPC 通道常量与 payload 类型
  types.ts                 DocumentMeta/Settings/FileNode/...
  settings.ts              默认值 + 迁移
  markdown.ts              纯函数：大纲/字数/资源解析
src/renderer/
  index.html
  src/main.tsx
  src/App.tsx
  src/components/          TitleBar/Sidebar/FileTree/Outline/Search/StatusBar/Settings/Welcome
  src/editor/              Editor/commands/livePreview/widgets/theme/outline
  src/hooks/                useDocument/useSettings/useCommands
  src/styles/               tokens/base/editor/sidebar
tests/                     Vitest
```

## 4. IPC 契约

约定：通道名 `domain:action`；所有 handle 返回 `Result<T> = {ok:true,value:T} | {ok:false,error:string}`；main 捕获异常并记录，不向 renderer 抛出原始堆栈。

### 4.1 调用（renderer -> main，invoke）

| 通道 | 入参 | 返回 | 说明 |
|---|---|---|---|
| `app:info` | – | `{version, platform, userData}` | 关于/诊断 |
| `dialog:openFile` | – | `string \| null` | md/txt 过滤器 |
| `dialog:openFolder` | – | `string \| null` | |
| `file:read` | `{path}` | `DocPayload` | 编码检测、2MB 上限、mtime |
| `file:save` | `{path?, content, encoding?, eol?, finalNewline?}` | `DocPayload` | 无 path 时转另存为 |
| `file:saveAs` | `{suggestedPath?, content, eol?, finalNewline?}` | `DocPayload \| null` | |
| `file:readDir` | `{path}` | `FileNode[]` | 单层；隐藏 `.git/node_modules` |
| `file:reveal` | `{path}` | `void` | 资源管理器 |
| `file:importImage` | `{docPath, fileName, data:Uint8Array}` | `{markdownPath, absPath}` | 存入 `assets/` 或文档目录 |
| `recent:list` | – | `RecentEntry[]` | |
| `recent:add` | `{path}` | `void` | |
| `recent:clear` | – | `void` | |
| `settings:get` | – | `Settings` | |
| `settings:set` | `Partial<Settings>` | `Settings` | 深合并 + 校验 |
| `draft:save` | `{doc, content}` | `void` | 失焦/定时/关闭前 |
| `draft:list` | – | `DraftEntry[]` | |
| `draft:read` | `{id}` | `{content, meta}` | |
| `draft:discard` | `{id}` | `void` | |
| `search:content` | `{root, query, caseSensitive, regex, wholeWord, maxResults}` | `SearchHit[]` | 有界 |
| `export:html` | `{html, suggestedName}` | `string \| null` | 保存路径 |
| `export:pdf` | `{html, suggestedName, options}` | `string \| null` | 隐藏窗口 printToPDF |
| `print:document` | `{html}` | `void` | 隐藏窗口 print |
| `clipboard:readImage` | – | `{data:Uint8Array, ext:'png'} \| null` | |
| `shell:openExternal` | `{url}` | `void` | 仅 http/https/mailto |
| `themes:list/read/open` | – / `{name}` | 主题列表 / CSS 分段 / 打开目录 | 用户主题目录 |
| `documents:list` | `{root}` | `QuickFile[]` | 快速打开索引 |
| `window:minimize/maximize/close` | – | `void` | |
| `window:isMaximized` | – | `boolean` | |
| `doc:setDirty` | `{dirty, path, title}` | `void` | main 用于关闭确认与标题 |

### 4.2 事件（main -> renderer）

| 通道 | 载荷 | 说明 |
|---|---|---|
| `app:command` | `{command, args?}` | 菜单/快捷键统一命令 |
| `app:openPath` | `{path}` | 单实例第二参数/文件关联 |
| `app:beforeClose` | `{reason}` | 可选：让 renderer 先落盘 |
| `window:maximized` | `{maximized}` | 标题栏按钮状态 |
| `file:changed` | `{path, mtime}` | 外部修改提示（P1 watcher） |
| `settings:changed` | `Settings` | 多窗口同步（P1） |

### 4.3 关闭流程（MVP）

1. renderer 在内容/路径变化时 `doc:setDirty`。
2. 用户点关闭：main 拦截 `close`，若 dirty 则 `dialog.showMessageBox`：保存 / 不保存 / 取消。
3. 选择保存：main 向 renderer 发送 `app:command {command:'save-and-close'}`；renderer 保存成功后 `window:closeConfirmed`，main 再销毁窗口。
4. 选择不保存：写恢复草稿（可选）后销毁。
5. 保存失败：中止关闭并提示。

## 5. 数据流

### 打开
`menu/CLI -> main file:read -> {content, encoding, eol, mtime} -> renderer useDocument -> EditorState.create -> decorations`

### 保存
`renderer serialize (CM doc string) -> eol/final newline 规则在 main 应用 -> atomic write -> 返回 mtime/编码 -> renderer 清除 dirty、更新 recent`

### 图片
`粘贴/拖拽 -> renderer File/Blob -> api.file.importImage -> main 写入 assets -> 返回相对路径 -> renderer 插入 ![alt](relative) -> 渲染时相对文档目录解析 -> mdimg://`

### 导出
`renderer 用 markdown-it 生成自包含 HTML（内联主题 CSS、KaTeX、高亮） -> api.export.html/pdf -> main 保存或隐藏窗口打印`

## 6. 状态归属

| 状态 | 归属 | 持久化 |
|---|---|---|
| 文档文本/选区/撤销栈 | renderer（CM6） | 否（草稿除外） |
| 当前路径/编码/换行/dirty | renderer + main 镜像 | 最近文件 |
| 设置 | main | `userData/settings.json` |
| 最近文件 | main | `userData/recent.json` |
| 会话（窗口位置/打开的文件夹） | main | `userData/session.json` |
| 恢复草稿 | main | `userData/draftsRecover/` |
| 主题 | 设置 | `settings.json` |

## 7. 错误处理与日志

- 统一 `AppError { code, message, detail? }`；IPC 返回 `{ok:false,error}`。
- 主进程日志 `userData/logs/main.log`，按天轮转，保留 7 天；不记录文档内容。
- renderer 全局 `error`/`unhandledrejection` 上报到 console 与 main 日志（不含正文）。
- 用户可见错误使用非阻塞 toast；保存失败必须模态提示。

## 8. 性能预算

| 场景 | 预算 |
|---|---|
| 冷启动到可输入 | < 1.5s（开发机） |
| 打开 500KB 文档 | < 800ms |
| 输入延迟（10 万字） | p95 < 16ms |
| 实时预览装饰 | 仅视口 ± 200 行；每帧最多一次重建 |
| 搜索 | ≤ 5,000 命中；单文件 ≤ 2MB；总扫描 ≤ 20k 文件/10s |
| 导出 PDF | 5MB HTML < 10s |

## 9. 兼容与迁移

- 启动时若存在 `%APPDATA%\Typora\conf\conf.user.json`，设置页提供「从 Typora 导入」。
- 兼容字段：`defaultFontFamily.*`、`autoHideMenuBar`、`searchService`、`keyBinding`、`monocolorEmoji`、`maxFetchCountOnFileList`。
- `flags` 不直接执行；仅暴露安全白名单（P2）。
- 最近文件不自动导入（避免隐私意外），由用户确认。
- 草稿：读取 `draftsRecover/*.md`，解析文件名与 mtime，标记来源。
