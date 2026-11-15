import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell, screen } from 'electron'
import path from 'node:path'
import { IPC } from '@shared/ipc'
import type { AppInfo, OverlayColors } from '@shared/types'
import type { AppContext } from './context'
import { fileExists, isSupportedDocPath } from './lib/paths'

export function createMainWindow(ctx: AppContext): BrowserWindow {
  ctx.closePromptActive = false
  ctx.forceClose = false
  ctx.dirty = { dirty: false, path: null, title: '未命名' }
  const settings = ctx.settings.read()
  const bounds = visibleBounds(settings.window)
  const dark =
    settings.appearance.theme === 'dark' ||
    (settings.appearance.theme === 'system' && nativeTheme?.shouldUseDarkColors === true)

  const win = new BrowserWindow({
    ...bounds,
    minWidth: 720,
    minHeight: 480,
    show: false,
    frame: false,
    titleBarStyle: process.platform === 'win32' || process.platform === 'darwin' ? 'hidden' : 'default',
    titleBarOverlay:
      process.platform === 'win32'
        ? {
            color: dark ? '#252526' : '#f7f7f7',
            symbolColor: dark ? '#d4d4d4' : '#24292f',
            height: 36
          }
        : undefined,
    backgroundColor: dark ? '#1e1e1e' : '#ffffff',
    autoHideMenuBar: true,
    title: 'LibrePen',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: settings.editor.spellcheck === true
    }
  })

  ctx.window = win
  win.setMenuBarVisibility(false)
  win.on('page-title-updated', (event) => event.preventDefault())

  const saveBounds = debounce(() => {
    if (!win.isDestroyed()) ctx.saveWindowState()
  }, 500)
  win.on('resize', saveBounds)
  win.on('move', saveBounds)
  win.on('maximize', () => {
    saveBounds()
    win.webContents.send(IPC.windowMaximizedChanged, true)
  })
  win.on('unmaximize', () => {
    saveBounds()
    win.webContents.send(IPC.windowMaximizedChanged, false)
  })

  win.once('ready-to-show', () => {
    if (settings.window.maximized === true) win.maximize()
    win.show()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?:|mailto:)/i.test(url)) void shell.openExternal(url).catch(() => undefined)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) {
      event.preventDefault()
      if (/^(https?:|mailto:)/i.test(url)) void shell.openExternal(url).catch(() => undefined)
    }
  })

  win.on('close', (event) => {
    if (
      ctx.forceClose ||
      (win as BrowserWindow & { __librepenForceClose?: boolean }).__librepenForceClose
    ) {
      ctx.saveWindowState()
      return
    }
    if (!ctx.dirty.dirty) {
      ctx.saveWindowState()
      return
    }
    event.preventDefault()
    if (ctx.closePromptActive) return
    ctx.closePromptActive = true
    try {
      void dialog
        .showMessageBox(win, {
          type: 'warning',
          buttons: ['保存', '不保存', '取消'],
          defaultId: 0,
          cancelId: 2,
          message: `保存对“${ctx.dirty.title || '未命名'}”的修改吗？`,
          detail: '如果不保存，修改可能在关闭后丢失。'
        })
        .then(({ response }) => {
          if (response === 0) {
            ctx.sendCommand('save-and-close')
            setTimeout(() => {
              ctx.closePromptActive = false
            }, 30_000)
          } else if (response === 1) {
            ctx.forceClose = true
            ;(win as BrowserWindow & { __librepenForceClose?: boolean }).__librepenForceClose = true
            win.close()
          } else {
            ctx.closePromptActive = false
          }
        })
        .catch(() => {
          ctx.closePromptActive = false
        })
    } catch {
      ctx.closePromptActive = false
    }
  })

  win.on('closed', () => {
    ctx.saveWindowState()
    ctx.closePromptActive = false
    ctx.forceClose = false
    ctx.dirty = { dirty: false, path: null, title: '未命名' }
    if (ctx.window === win) ctx.window = null
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void Promise.resolve(win.loadURL(process.env['ELECTRON_RENDERER_URL'])).catch(() => undefined)
  } else {
    void Promise.resolve(win.loadFile(path.join(__dirname, '../renderer/index.html'))).catch(
      () => undefined
    )
  }
  return win
}

export function registerAppIpc(ctx: AppContext, takeInitialPath: () => string | null): void {
  ipcMain.handle(IPC.appInfo, () => {
    const info: AppInfo = {
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      platform: process.platform,
      userData: app.getPath('userData')
    }
    return info
  })
  ipcMain.handle(IPC.appInitialPath, () => {
    const value = takeInitialPath()
    if (value && isSupportedDocPath(value) && fileExists(value)) {
      try {
        ctx.recent.addFile(value)
        ctx.saveSession({ lastFile: value })
        ctx.refreshMenu()
      } catch {}
    }
    return value
  })
  ipcMain.handle(IPC.appGetRecent, () => ctx.recent.list())
}

export function applyOverlay(win: BrowserWindow, colors: OverlayColors): void {
  try {
    win.setTitleBarOverlay({ color: colors.color, symbolColor: colors.symbolColor, height: 36 })
  } catch {
    /* unsupported */
  }
}

function visibleBounds(input: {
  x?: number
  y?: number
  width: number
  height: number
}): { x?: number; y?: number; width: number; height: number } {
  const width = Number.isFinite(input.width)
    ? Math.max(720, Math.min(Math.round(input.width), 4000))
    : 1200
  const height = Number.isFinite(input.height)
    ? Math.max(480, Math.min(Math.round(input.height), 3000))
    : 800
  if (
    typeof input.x !== 'number' ||
    typeof input.y !== 'number' ||
    !Number.isFinite(input.x) ||
    !Number.isFinite(input.y)
  ) {
    return { width, height }
  }
  const displays = screen.getAllDisplays()
  const visible = displays.some((display) => {
    const area = display.workArea
    return (
      input.x! + 80 > area.x &&
      input.x! < area.x + area.width - 80 &&
      input.y! >= area.y - 20 &&
      input.y! < area.y + area.height - 80
    )
  })
  return visible ? { x: input.x, y: input.y, width, height } : { width, height }
}

function debounce<T extends (...args: never[]) => void>(fn: T, wait: number): T {
  let timer: NodeJS.Timeout | undefined
  return ((...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), wait)
  }) as T
}
