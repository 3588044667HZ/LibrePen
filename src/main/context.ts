import { app, BrowserWindow, dialog, Menu, type MenuItemConstructorOptions } from 'electron'
import type { DirtyState, Settings, RecentStore, SessionStore } from '@shared/types'
import { RecentService } from './services/recent'
import { DraftService } from './services/drafts'
import { SearchService } from './services/search'
import { JsonStore } from './lib/store'
import { fileExists, isSupportedDocPath } from './lib/paths'
import { IPC } from '@shared/ipc'

export class AppContext {
  window: BrowserWindow | null = null
  forceClose = false
  closePromptActive = false
  dirty: DirtyState = { dirty: false, path: null, title: '未命名' }
  readonly search = new SearchService()
  refreshMenu: () => void = () => undefined

  constructor(
    readonly settings: JsonStore<Settings>,
    readonly session: JsonStore<SessionStore>,
    readonly recent: RecentService,
    readonly drafts: DraftService
  ) {}

  sendCommand(command: string, args?: unknown): void {
    const win = this.window
    if (!win || win.isDestroyed() || win.webContents.isDestroyed?.()) return
    try {
      win.webContents.send(IPC.appCommand, { command, args })
    } catch {}
  }

  openPath(filePath: string): void {
    if (typeof filePath !== 'string' || !filePath) return
    if (!fileExists(filePath) || !isSupportedDocPath(filePath)) {
      try {
        this.recent.removeFile(filePath)
        this.refreshMenu()
      } catch {}
    }
    const win = this.window
    if (!win || win.isDestroyed() || win.webContents.isDestroyed?.()) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    try {
      win.webContents.send(IPC.appOpenPath, filePath)
    } catch {}
  }

  setDirty(state: DirtyState): void {
    this.dirty = state
    if (this.window && !this.window.isDestroyed()) {
      const suffix = state.dirty ? ' *' : ''
      const title =
        state.title === 'LibrePen' ? `LibrePen${suffix}` : `${state.title || '未命名'}${suffix} - LibrePen`
      try {
        this.window.setTitle(title)
      } catch {}
    }
  }

  saveWindowState(): void {
    if (!this.window || this.window.isDestroyed()) return
    const maximized = this.window.isMaximized()
    const bounds = maximized ? this.window.getNormalBounds() : this.window.getBounds()
    try {
      this.settings.update((current) => ({
        ...current,
        window: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, maximized }
      }))
    } catch {}
  }

  saveSession(patch: Partial<SessionStore>): void {
    try {
      this.session.update((current) => ({ ...current, ...patch }))
    } catch {}
  }

  setRecentToMenu(): void {
    this.refreshMenu()
  }

  recentStore(): RecentStore {
    return this.recent.list()
  }
}

export function buildApplicationMenu(ctx: AppContext): Menu {
  const settings = ctx.settings.read()
  const recent = ctx.recent.list()
  const send = (command: string, args?: unknown) => () => ctx.sendCommand(command, args)
  const recentItems: MenuItemConstructorOptions[] = recent.files.slice(0, 15).map((entry) => ({
    label: `${entry.name}  —  ${entry.path}`,
    click: () => ctx.openPath(entry.path)
  }))
  if (recentItems.length === 0) {
    recentItems.push({ label: '暂无最近文件', enabled: false })
  }
  const folderItems: MenuItemConstructorOptions[] = recent.folders.slice(0, 10).map((entry) => ({
    label: entry.path,
    click: () => ctx.sendCommand('open-folder-path', { path: entry.path })
  }))
  if (folderItems.length === 0) {
    folderItems.push({ label: '暂无最近文件夹', enabled: false })
  }

  const template: MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        { label: '新建', accelerator: 'CmdOrCtrl+N', click: send('new-file') },
        { label: '快速打开…', accelerator: 'CmdOrCtrl+P', click: send('quick-open') },
        { label: '打开…', accelerator: 'CmdOrCtrl+O', click: send('open-file') },
        { label: '打开文件夹…', accelerator: 'CmdOrCtrl+Shift+O', click: send('open-folder') },
        {
          label: '打开最近',
          submenu: [
            ...recentItems,
            { type: 'separator' },
            ...folderItems,
            { type: 'separator' },
            { label: '清空最近记录', click: send('clear-recent') }
          ]
        },
        { type: 'separator' },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: send('save') },
        { label: '另存为…', accelerator: 'CmdOrCtrl+Shift+S', click: send('save-as') },
        { type: 'separator' },
        {
          label: '导出',
          submenu: [
            { label: 'HTML…', accelerator: 'CmdOrCtrl+Shift+E', click: send('export-html') },
            { label: 'PDF…', click: send('export-pdf') },
            { label: '打印…', accelerator: 'CmdOrCtrl+Shift+P', click: send('print') }
          ]
        },
        { type: 'separator' },
        { label: '设置…', accelerator: 'CmdOrCtrl+,', click: send('settings') },
        { type: 'separator' },
        { label: '关闭窗口', accelerator: 'CmdOrCtrl+W', click: () => ctx.window?.close() },
        { label: '退出', accelerator: 'Alt+F4', click: () => app.quit() }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', click: send('undo') },
        { label: '重做', accelerator: 'CmdOrCtrl+Y', click: send('redo') },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { label: '粘贴为纯文本', accelerator: 'CmdOrCtrl+Shift+V', click: send('paste-plain') },
        { type: 'separator' },
        { label: '查找…', accelerator: 'CmdOrCtrl+F', click: send('find') },
        { label: '替换…', accelerator: 'CmdOrCtrl+H', click: send('replace') },
        { type: 'separator' },
        { label: '全选', role: 'selectAll' }
      ]
    },
    {
      label: '段落',
      submenu: [
        ...[1, 2, 3, 4, 5, 6].map<MenuItemConstructorOptions>((level) => ({
          label: `标题 ${level}`,
          accelerator: `CmdOrCtrl+${level}`,
          click: send('heading', { level })
        })),
        { label: '正文', accelerator: 'CmdOrCtrl+0', click: send('heading', { level: 0 }) },
        { label: '升级标题', accelerator: 'CmdOrCtrl+=', click: send('heading-up') },
        { label: '降级标题', accelerator: 'CmdOrCtrl+-', click: send('heading-down') },
        { type: 'separator' },
        { label: '引用', accelerator: 'CmdOrCtrl+Shift+Q', click: send('quote') },
        { label: '代码块', accelerator: 'CmdOrCtrl+Shift+K', click: send('code-fence') },
        { label: '数学块', accelerator: 'CmdOrCtrl+Shift+M', click: send('math-block') },
        { label: '表格', accelerator: 'CmdOrCtrl+T', click: send('table') },
        { label: '水平线', accelerator: 'CmdOrCtrl+Shift+R', click: send('hr') },
        { label: '目录', click: send('toc') }
      ]
    },
    {
      label: '格式',
      submenu: [
        { label: '加粗', accelerator: 'CmdOrCtrl+B', click: send('bold') },
        { label: '斜体', accelerator: 'CmdOrCtrl+I', click: send('italic') },
        { label: '下划线', accelerator: 'CmdOrCtrl+U', click: send('underline') },
        { label: '删除线', accelerator: 'Alt+Shift+5', click: send('strike') },
        { label: '高亮', accelerator: 'CmdOrCtrl+Shift+H', click: send('highlight') },
        { label: '行内代码', accelerator: 'CmdOrCtrl+Shift+`', click: send('inline-code') },
        { label: '上标', click: send('superscript') },
        { label: '下标', click: send('subscript') },
        { type: 'separator' },
        { label: '超链接…', accelerator: 'CmdOrCtrl+K', click: send('link') },
        { label: '图片…', accelerator: 'CmdOrCtrl+Shift+I', click: send('image') },
        { label: '清除格式', accelerator: 'CmdOrCtrl+\\', click: send('clear-format') }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '切换侧栏', accelerator: 'CmdOrCtrl+Shift+L', click: send('toggle-sidebar') },
        { label: '源码模式', accelerator: 'CmdOrCtrl+/', click: send('toggle-source') },
        { label: '专注模式', accelerator: 'F8', click: send('toggle-focus') },
        { label: '打字机模式', accelerator: 'F9', click: send('toggle-typewriter') },
        { type: 'separator' },
        {
          label: '主题',
          submenu: [
            { label: '浅色', click: send('set-theme', 'light') },
            { label: '深色', click: send('set-theme', 'dark') },
            { label: '跟随系统', click: send('set-theme', 'system') }
          ]
        },
        { type: 'separator' },
        { label: '放大', role: 'zoomIn' },
        { label: '缩小', role: 'zoomOut' },
        { label: '重置缩放', role: 'resetZoom' },
        { type: 'separator' },
        { label: '开发者工具', role: 'toggleDevTools', visible: true }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于 LibrePen',
          click: () => {
            const options = {
              type: 'info' as const,
              title: '关于 LibrePen',
              message: 'LibrePen',
              detail: `版本 ${app.getVersion()}\nElectron ${process.versions.electron}\nChromium ${process.versions.chrome}\nNode ${process.versions.node}\n\n一个干净、快速、本地优先的 Markdown 编辑器。`
            }
            if (ctx.window) void dialog.showMessageBox(ctx.window, options)
            else void dialog.showMessageBox(options)
          }
        }
      ]
    }
  ]

  if (settings.advanced.devTools !== true) {
    const view = template.find((item) => item.label === '视图')
    if (view && Array.isArray(view.submenu)) {
      view.submenu = view.submenu.filter((item) => item.label !== '开发者工具')
    }
  }

  return Menu.buildFromTemplate(template)
}
