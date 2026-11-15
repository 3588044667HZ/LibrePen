# 08 测试、质量与安全

## 1. 测试分层

| 层 | 工具 | 覆盖 |
|---|---|---|
| 单元 | Vitest | `src/shared/markdown.ts`、`settings` 合并、路径/编码纯函数、搜索匹配 |
| 集成 | Vitest（Node） | 原子写、编码检测、草稿索引、设置读写（临时目录） |
| E2E | Playwright `_electron`（P1） | 启动、打开/保存、导出、关闭确认 |
| 手动 QA | 清单 | WYSIWYG 行为、IME、拖拽、导出外观 |

### 1.1 单元测试清单（MVP 必须）

- `extractOutline`：ATX/setext、代码块内 `#` 忽略、重复标题、中文标题。
- `countWords`：英文、中文（按字）、混合、空文本、代码块计入策略。
- `applyEol` / `detectEol` / `applyFinalNewline`：CRLF/LF/混合/空文件。
- `toggleLinePrefix`：标题 1–6、引用、列表、取消、多行选区。
- `wrapInline`：无选区、已有包裹、嵌套、选区含标记。
- `parseImageRef` / `resolveImageSrc`：相对/绝对/https/data/空格/中文路径。
- `sanitizeFileName` / `relativeAssetPath`：非法字符、冲突后缀。
- `settings` 合并：未知键保留、范围校验、损坏回退。
- 搜索匹配：大小写/整词/正则、二进制跳过、结果上限。
- 导出 HTML：危险 HTML 被净化、相对图片改写、代码高亮类名。

### 1.2 手动 QA 清单

**文件**
- [ ] 打开 UTF-8/UTF-8 BOM/GBK 文件；中文不乱码。
- [ ] CRLF 文件保存后仍为 CRLF；LF 同理。
- [ ] 无末尾换行文件保存后仍无（auto）。
- [ ] 只读文件保存失败提示。
- [ ] 外部修改后保存出现冲突提示。
- [ ] 未命名保存 → 另存为 → 标题/最近文件更新。
- [ ] 2MB+ 文件提示且不崩溃。

**编辑**
- [ ] 中文输入法连续输入、候选切换、撤销。
- [ ] 粗体/斜体/代码/删除线/高亮标记在光标进入时显示、离开时隐藏。
- [ ] 链接 URL 折叠；Ctrl+Click 打开浏览器。
- [ ] 图片渲染、加载失败占位、相对路径切换目录后仍正确。
- [ ] 行内公式 `$E=mc^2$` 渲染；错误公式显示错误样式。
- [ ] 任务列表点击切换并写回 `[x]`。
- [ ] 代码围栏语言高亮；围栏行样式；源码模式可编辑。
- [ ] 查找/替换：正则、整词、替换全部可撤销。
- [ ] 撤销/重做跨命令正确。
- [ ] Tab/Shift+Tab 列表缩进。
- [ ] 关闭实时预览后源码原样。

**UI**
- [ ] 侧栏切换/拖拽宽度/折叠；文件树展开懒加载。
- [ ] 大纲实时更新、点击跳转、高亮当前。
- [ ] 搜索大小写/整词/正则、跳转定位。
- [ ] 主题 light/dark/system 即时切换；重启保持。
- [ ] 状态栏字数/行号/编码/换行准确。
- [ ] 窗口最大化/还原/关闭；关闭确认三选项。

**恢复/导出**
- [ ] 编辑后强杀进程，重启提示恢复草稿。
- [ ] 恢复后保存/丢弃行为正确。
- [ ] 导出 HTML 离线打开：样式/图片/公式/代码正常。
- [ ] 导出 PDF A4、边距、分页；深色主题使用浅色。
- [ ] 打印预览正常。
- [ ] 粘贴剪贴板图片写入 `assets/` 并插入相对路径。
- [ ] 图片文件名冲突自动后缀。

## 2. 性能测试

| 用例 | 方法 | 门槛 |
|---|---|---|
| 冷启动 | 秒表/日志时间戳 | < 1.5s |
| 100KB 打开 | 打开到可输入 | < 800ms |
| 10 万字输入 | 连续输入 60s，观察帧 | p95 < 16ms |
| 搜索 1k 文件 | 侧栏搜索 | < 3s |
| PDF 导出 | 200 段文档 | < 10s |
| 内存 | 闲置 10 分钟 | < 400MB（含 Electron） |

## 3. 安全清单

### 3.1 进程与 Web

- [ ] `nodeIntegration:false`、`contextIsolation:true`、`sandbox:true`。
- [ ] preload 仅暴露白名单 API；无 `ipcRenderer` 原始对象。
- [ ] `will-navigate` 阻止外部导航；`setWindowOpenHandler` 仅 https 外链。
- [ ] CSP 无 `unsafe-eval`；生产无 localhost。
- [ ] 禁用 `webviewTag`；不加载远程脚本/字体（除用户图片）。
- [ ] DevTools 仅在设置开启时可用（P1）。

### 3.2 IPC

- [ ] 每个 handler 校验参数类型、长度、路径。
- [ ] 错误信息不回传堆栈/绝对路径（除必要文件名）。
- [ ] 无 `execForAll`、`evaluateInHost`、任意 `executeJavaScript`。
- [ ] 导出/打印隐藏窗口同样禁用 Node 与导航。

### 3.3 文件/协议

- [ ] `mdimg://` 仅图片扩展名、≤ 32MB、存在性、NUL/UNC/设备路径拒绝。
- [ ] 协议返回 `Content-Type` 正确；SVG 以 `image/svg+xml` + CSP 禁止脚本（或转 `<img>` 使用）。
- [ ] 路径穿越用例：`..%2f..%2fetc%2fpasswd`、`C:\Windows\win.ini`、`\\?\C:\...`。
- [ ] 符号链接不逃逸（P1）。
- [ ] 图片文件名不覆盖已有文件（冲突后缀）。

### 3.4 内容

- [ ] 导出 HTML 经 DOMPurify；`<script>`、`onerror`、`javascript:` 被移除。
- [ ] Mermaid/KaTeX 错误不执行注入。
- [ ] raw HTML 编辑区不执行脚本（CM6 文本渲染天然安全）。
- [ ] 远程图片加载不携带 Referer/凭据（默认）。
- [ ] 不实现遥测；日志不含正文。

### 3.5 依赖

- [ ] 锁文件提交；`npm audit` 无 high/critical（允许有记录的例外）。
- [ ] Electron 使用受支持版本；升级流程记录。
- [ ] 不引入未知 postinstall 脚本的依赖（审查）。

## 4. 代码质量

- TypeScript strict；禁止 `any`（例外需注释）。
- ESLint（P1）与 Prettier（P1）；MVP 至少 `tsc --noEmit`。
- 主进程与 renderer 共享类型放 `src/shared`，不得互相 import 运行时模块。
- 每个 IPC 通道在 `src/shared/ipc.ts` 有常量与类型。
- 纯逻辑优先；组件不直接调用 `window.api` 之外的外部能力。

## 5. CI（P1）

```yaml
- npm ci
- npm run typecheck
- npm test
- npm run build
- npm run test:e2e (optional)
```

## 6. 发布检查（P1）

- 版本号、CHANGELOG、许可证、第三方声明。
- Windows 安装包未签名提示说明；代码签名后校验。
- 首次启动不写 Typora 目录；卸载不删除用户文档。
