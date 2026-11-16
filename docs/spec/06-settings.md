# 06 设置与配置

## 1. 存储

- 主文件：`app.getPath('userData')/settings.json`（UTF-8，2 空格缩进，原子写）。
- 启动：读取 → 与默认值深合并 → schema 校验（未知键保留在 `unknown`，不丢弃）。
- 写入：`settings:set` 深合并；变更后广播 `settings:changed`（P1 多窗口）。
- 导出/导入设置：JSON 文件（P1）。
- 损坏：备份为 `settings.corrupt-{ts}.json` 并回退默认值，提示用户。

## 2. Schema

```ts
interface Settings {
  general: {
    language: 'zh-CN' | 'en-US';          // MVP 仅界面文案占位，默认 zh-CN
    restoreWhenLaunch: 'new' | 'lastFolder' | 'lastFile';
    autoUpdate: false;                     // 非目标，恒 false
    confirmExit: boolean;                  // 默认 true
  };
  editor: {
    fontFamily: string;                    // 默认系统 UI 字体栈
    fontSize: number;                      // 12..24, default 16
    lineHeight: number;                    // 1.4..2.2, default 1.75
    tabSize: number;                       // 2|4, default 2
    lineWrapping: boolean;                 // default true
    showLineNumbers: boolean;              // default false
    autoPair: boolean;                     // default true
    livePreview: boolean;                  // default true
    inlineMath: boolean;                   // default true
    highlightSyntax: boolean;              // default true
    smartPunctuation: boolean;             // default false
    spellcheck: boolean;                   // default false（P1）
    typewriterMode: boolean;               // default false（P1）
    focusMode: boolean;                    // default false（P1）
    defaultEol: 'auto' | 'lf' | 'crlf';    // default auto
    finalNewline: 'auto' | 'always' | 'never'; // default auto
    fontSizeZoom: number;                  // 0.5..2, default 1
  };
  files: {
    autoSave: boolean;                     // default false
    autoSaveIntervalMin: number;           // 1..60, default 5
    recovery: boolean;                     // default true
    defaultExtension: string;              // default 'md'
    recentLimit: number;                   // default 50
    showHiddenFiles: boolean;              // default false
    imageFolder: 'assets' | 'same' | 'custom'; // default 'assets'
    imageCustomFolder: string;             // ''
    copyImagesOnPaste: boolean;            // default true
  };
  appearance: {
    theme: 'system' | 'light' | 'dark';    // default system
    sidebarVisible: boolean;               // default true
    sidebarWidth: number;                  // 240..400, default 260
    contentWidth: 'narrow' | 'wide';       // default narrow (860px)
    showStatusBar: boolean;                // default true
  };
  export: ExportSettings;                  // 见 05
  advanced: {
    keybindings: Record<string, string>;   // command id -> accelerator
    typoraConfigPath?: string;             // 导入来源
    devTools: boolean;                     // default false
  };
  window: { x?: number; y?: number; width: number; height: number; maximized: boolean };
}
```

### 2.1 默认值要点

| 键 | 默认 | 理由 |
|---|---|---|
| `editor.livePreview` | true | 产品核心 |
| `editor.fontSize` | 16 | 接近 Typora |
| `editor.defaultEol` | auto | 保持原文件 |
| `files.autoSave` | false | 与 Typora 默认一致，避免意外写盘 |
| `files.recovery` | true | 安全默认 |
| `appearance.theme` | system | 跟随系统 |
| `advanced.devTools` | false | 生产默认关闭 |

## 3. Typora `conf.user.json` 导入

设置页「高级 → 从 Typora 导入」：

- 读取 `%APPDATA%\Typora\conf\conf.user.json`（HJSON；MVP 用宽松 JSON5 解析）。
- 映射：

| Typora | LibrePen |
|---|---|
| `defaultFontFamily.standard/serif/sansSerif/monospace` | `editor.fontFamily`（优先 sansSerif；其余存入 advanced） |
| `autoHideMenuBar` | `appearance.autoHideMenuBar`（P1） |
| `searchService` | `general.searchService`（P1） |
| `keyBinding` | `advanced.keybindings`（按菜单标签映射到 command id，未识别项保留） |
| `monocolorEmoji` | `advanced.monocolorEmoji`（P1） |
| `maxFetchCountOnFileList` | `files.maxFetchCount`（P1） |
| `flags` | 忽略（安全） |

- 导入前展示差异预览；不覆盖已有用户修改，除非确认。
- 不读取 Typora 的加密/授权数据。

## 4. 设置界面

左侧分类：

1. **通用**：启动行为、语言、退出确认。
2. **编辑器**：字体、字号、行高、Tab、自动换行、行号、实时预览、行内数学、自动配对、默认换行、末尾换行。
3. **文件**：自动保存/间隔、恢复、默认扩展名、最近文件数、隐藏文件、图片目录、粘贴图片复制。
4. **外观**：主题、侧栏、内容宽度、状态栏。
5. **导出**：默认目录、打开导出文件、Pandoc 路径、Word `reference.docx`、PDF 纸张/边距。
6. **高级**：快捷键表、从 Typora 导入、打开配置目录、重置设置、DevTools。

交互：

- 修改即时生效（主题/字体/编辑器选项）；需要重启的项标注。
- 「恢复默认」按分类重置，需确认。
- 搜索框过滤设置项（P1）。
- 表单校验：数值范围、路径存在性。

## 5. 快捷键覆盖

- `advanced.keybindings`：`{ "editor.bold": "Ctrl+B", ... }`。
- 解析：`Ctrl/Shift/Alt/Meta` + 键名；与菜单 accelerator 同步（主进程重建菜单）。
- 冲突检测：同一 accelerator 绑定多个命令时提示。
- MVP 支持读写配置，UI 编辑 P1。

## 6. 配置目录

```text
userData/
  settings.json
  recent.json
  session.json
  draftsRecover/
    index.json
    {id}.md
  logs/main.log
  themes/            （P1）
```

- 「打开配置目录」调用 `shell.openPath(userData)`。
- 备份/恢复：P1 提供导出 zip。

## 7. 重置与迁移

- 重置设置：删除 `settings.json` 后重启生效；保留 recent/drafts。
- 版本迁移：`settings.version`（默认 1）；未来版本按 `migrations[]` 顺序执行并备份。
- 未知字段保留，避免降级丢配置。
