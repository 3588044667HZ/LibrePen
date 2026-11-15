# 04 文件与数据层

## 1. 文档模型

```ts
interface DocPayload {
  path: string | null;        // null = untitled
  displayName: string;        // 文件名或「未命名」
  content: string;            // UTF-8 文本（去除 BOM 后）
  encoding: 'utf8' | 'utf8-bom' | 'gbk' | 'big5' | 'shift_jis' | 'latin1';
  eol: 'lf' | 'crlf';
  finalNewline: boolean;
  size: number;
  mtimeMs: number;
  oversize?: boolean;         // > 2MB，拒绝编辑
}
```

- 支持扩展名：`md, markdown, mmd, mkd, mdwn, mdown, mdx, mdtxt, mdtext, apib, rmarkdown, rmd, qmd, txt, text`。
- 二进制/超限：> 2,000,000 字节提示「文件过大」，提供只读源码模式或取消。
- 图片/附件不进入文档模型。

## 2. 读取

1. `fs.stat` 校验存在、是文件、≤ 2MB。
2. 读取 Buffer；BOM 检测：UTF-8 BOM、UTF-16LE/BE（只读提示）。
3. 编码检测：优先缓存（路径 -> 编码），否则 `jschardet`；置信度 < 0.7 且非 ASCII 时提示用户确认。
4. `iconv-lite` 解码为 UTF-8 字符串。
5. 换行检测：统计 CRLF/LF 行数，据此设定 `eol`；混合换行给出提示（P1）。
6. 记录 `mtimeMs` 作为保存冲突基线。

## 3. 保存

### 3.1 规则

- 文本以 UTF-8 写出；保留原编码（MVP 仅 UTF-8/BOM）时按原编码回写。
- 换行：按文档 `eol` 统一；`finalNewline` 按原文件或设置。
- 原子写：
  1. 写入同目录临时文件 `.<name>.<random>.tmp`。
  2. `fsync`（尽力）。
  3. `rename` 覆盖目标（Windows 先 `unlink` 旧文件再 rename，失败则回滚）。
  4. 失败清理临时文件并抛出 `E_SAVE`。
- 保存成功后更新 `mtimeMs`，清理该文档的草稿，加入最近文件。
- 另存为：对话框默认原目录/原文件名；扩展名缺失时补 `.md`；覆盖确认由系统对话框负责。
- 重命名/移动后更新图片相对路径（P1）。

### 3.2 外部修改冲突

- 保存前若磁盘 `mtimeMs` 与打开时不同且内容不同：提示「文件已被外部修改：覆盖/另存为/取消」。MVP 实现该检查。
- 外部删除后保存：按另存为处理。

## 4. 未命名文档

- 启动/新建时 `path=null`、`displayName=未命名`、初始内容空。
- 首次保存进入另存为。
- 未命名文档的草稿以 `untitled-{timestamp}` 标识。

## 5. 自动保存与恢复

### 5.1 自动保存

- 设置 `autoSave.enabled`（默认 false）、`autoSave.intervalMinutes`（默认 5）。
- 已有路径：定时静默保存（不弹窗），状态栏闪「已保存」。
- 未命名：不写磁盘，只更新恢复草稿。
- 自动保存失败：toast 提示一次，不打断输入。

### 5.2 恢复草稿

- 目录：`app.getPath('userData')/draftsRecover/`。
- 触发：窗口失焦、每 60s（若有修改）、关闭未保存、崩溃前无法保证。
- 文件：
  - `draftsRecover/{id}.md` — 内容。
  - `draftsRecover/index.json` — `{id, originalPath, displayName, savedAt, mtimeMs, encoding, eol, finalNewline}`。
- `id`：`YYYYMMDD-HHmmss-{sanitizedName}`，与 Typora 的 `{date}-{filename}.md` 风格兼容。
- 恢复：启动时读 index（丢失则扫描 `.md`），列出最近 20 条；恢复后作为未命名/原路径文档打开，并标记「来自恢复」。
- 丢弃：删除 md + index 条目。
- 保存成功后删除对应草稿。

### 5.3 关闭

- dirty 时弹原生对话框：保存 / 不保存 / 取消。
- 保存：renderer 执行保存；成功则关闭；失败中止。
- 不保存：写一份草稿（设置可关）后关闭。
- 取消：保持窗口。

## 6. 最近文件与会话

### 6.1 最近文件

`userData/recent.json`：

```json
{ "files": [{ "path": "...", "name": "...", "openedAt": 0, "pinned": false }],
  "folders": [{ "path": "...", "openedAt": 0, "pinned": false }] }
```

- 最多 50 条；去重（path）；置顶不参与淘汰。
- 打开失败（不存在）时从列表移除并提示。
- 清空需确认。

### 6.2 会话

`userData/session.json`：

```json
{ "window": {"x":0,"y":0,"width":1200,"height":800,"maximized":false},
  "lastFolder": "...", "lastFile": "...", "sidebarWidth": 260,
  "sidebarVisible": true, "theme": "system", "sourceMode": false }
```

- 启动恢复窗口位置（校验在屏幕内）；不自动恢复未保存内容（由草稿负责）。
- `restoreWhenLaunch`：`new` | `lastFolder` | `lastFiles`（P1）。

## 7. 文件夹与文件树

- 只读扫描单层目录：`fs.readdir({withFileTypes})`，目录在前、文件在后，自然排序。
- 忽略：`.git`、`node_modules`、`.DS_Store`、`Thumbs.db`。
- 文件树展开时按需加载（缓存 5s）。
- 文件监听（P1）：`fs.watch` 递归 + 500ms 防抖，刷新树与当前文件冲突提示。

## 8. 全文搜索

- 入口：侧栏搜索；范围 = 当前打开的文件夹。
- 规则：
  - 仅文本扩展名（见支持列表）；跳过二进制（NUL 字节检测）。
  - 单文件 ≤ 2MB；总文件 ≤ 20,000；总耗时 ≤ 10s。
  - 结果 ≤ 5,000 命中；每文件最多 50 条。
  - 支持大小写、整词、正则；正则编译失败返回错误。
- 实现：`fs.promises` 逐文件流式读取（简化：整文件读取）；`AbortSignal` 取消。
- 返回 `{file, line, column, preview, ranges}`；renderer 点击后定位并选中。

## 9. 图片

### 9.1 插入

- 菜单/快捷键：打开文件选择（png/jpg/jpeg/gif/webp/svg/bmp/avif）。
- 粘贴：`clipboard:readImage` 取 PNG；拖拽：renderer 读取 File 的 `arrayBuffer` 发送 main。
- 目标路径（设置）：
  - `copyToAssets`（默认）：文档目录下 `assets/`。
  - `sameFolder`：文档目录。
  - `customFolder`：相对/绝对路径。
- 命名：`{basename}-{yyyyMMddHHmmss}.{ext}`；冲突追加 `-1`。
- 插入相对路径（`assets/xxx.png`），使用 `/` 分隔；空格转 `%20`。
- 未命名文档：先保存在插入前提示「请先保存文档」。

### 9.2 渲染

- `mdimg://local/{base64url(absPath)}?v={mtimeMs}`。
- 仅允许图片扩展名与 ≤ 32MB；协议处理器校验真实路径与存在性。
- 远程图片直接使用 https（CSP 允许）。

### 9.3 上传（P1）

- 适配外部命令（PicGo CLI 等），用户显式配置；命令通过 `spawn` 执行，超时 60s，输出脱敏。
- 上传后替换 Markdown URL；失败保留本地路径并提示。

## 10. 路径安全

- main 统一 `resolve()`；拒绝包含 NUL；Windows 拒绝 `\\?\`、`\\.\`、UNC（除非用户显式选择网络盘）。
- `file:*` 操作只接受 renderer 传来的路径，但保存/读取前验证扩展名与存在性；不做目录白名单（编辑器性质决定），但协议仅暴露图片。
- 导出路径由系统保存对话框决定。
- 图片协议不提供目录列表；base64url 解码后必须是绝对文件路径。

## 11. 兼容 Typora

| 项 | 策略 |
|---|---|
| 支持扩展名 | 对齐 |
| 编码/换行/末尾换行 | 对齐 |
| 2MB 上限 | 对齐 |
| `draftsRecover` | 同名目录、同风格文件名；额外提供 index |
| 最近文件 | 自有格式；不自动读取 Typora |
| `conf.user.json` | 设置页导入兼容子集（见 06） |
| TextBundle/TextPack | P2 |
