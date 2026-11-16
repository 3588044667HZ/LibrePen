import fs from 'node:fs'
import path from 'node:path'
import { app, Menu } from 'electron'
import { DEFAULT_SETTINGS, normalizeSettings } from '@shared/settings'
import type { Settings, SessionStore } from '@shared/types'
import { AppContext, buildApplicationMenu } from './context'
import { JsonStore } from './lib/store'
import { registerImageProtocol, registerImageScheme } from './lib/protocol'
import { installContentSecurityPolicy } from './lib/security'
import { isSupportedDocPath } from './lib/paths'
import { RecentService } from './services/recent'
import { DraftService } from './services/drafts'
import { registerIpc } from './ipc/register'
import { createMainWindow, registerAppIpc } from './window'

app.setName('LibrePen')
app.setAppUserModelId('com.librepen.app')

registerImageScheme()

const userData = app.getPath('userData')

const settingsStore = new JsonStore<Settings>(
  path.join(userData, 'settings.json'),
  DEFAULT_SETTINGS,
  normalizeSettings
)
const sessionStore = new JsonStore<SessionStore>(
  path.join(userData, 'session.json'),
  {
    lastFolder: null,
    lastFile: null,
    sidebarWidth: 260,
    sidebarVisible: true,
    sourceMode: false
  },
  (value) => {
    const input = value as Partial<SessionStore> | null
    return {
      lastFolder: typeof input?.lastFolder === 'string' ? input.lastFolder : null,
      lastFile: typeof input?.lastFile === 'string' ? input.lastFile : null,
      sidebarWidth:
        typeof input?.sidebarWidth === 'number' ? Math.min(400, Math.max(240, input.sidebarWidth)) : 260,
      sidebarVisible: input?.sidebarVisible !== false,
      sourceMode: Boolean(input?.sourceMode)
    }
  }
)
const recentService = new RecentService(
  path.join(userData, 'recent.json'),
  () => settingsStore.read().files.recentLimit
)
const draftService = new DraftService(userData)
const ctx = new AppContext(settingsStore, sessionStore, recentService, draftService)
ctx.refreshMenu = () => Menu.setApplicationMenu(buildApplicationMenu(ctx))

let pendingPath: string | null = extractPath(process.argv)
let initialPathTaken = false
let bootstrapped = false

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const target = extractPath(argv)
    if (target) forwardOpenPath(target)
    else focusWindow()
  })

  app.on('open-file', (event, filePath) => {
    event.preventDefault()
    if (!app.isReady()) pendingPath = filePath
    else forwardOpenPath(filePath)
  })

  app.whenReady().then(() => {
    installContentSecurityPolicy()
    try {
      draftService.prune(Date.now() - 30 * 24 * 60 * 60 * 1000)
    } catch {}
    registerImageProtocol()
    registerIpc(ctx)
    registerAppIpc(ctx, () => {
      initialPathTaken = true
      const value = pendingPath
      pendingPath = null
      return value
    })
    ctx.refreshMenu()
    bootstrapped = true
    createWindow()
    app.on('activate', () => {
      if (!ctx.window || ctx.window.isDestroyed()) createWindow()
      else focusWindow()
    })
  })

  app.on('before-quit', () => {
    ctx.saveWindowState()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

function forwardOpenPath(filePath: string): void {
  if (!app.isReady() || !bootstrapped) {
    pendingPath = filePath
    return
  }
  const win = ctx.window
  if (!win || win.isDestroyed()) {
    pendingPath = filePath
    createWindow()
    return
  }
  if (!initialPathTaken) {
    pendingPath = filePath
    focusWindow()
    return
  }
  ctx.openPath(filePath)
}

function focusWindow(): void {
  const win = ctx.window
  if (!win || win.isDestroyed()) {
    if (app.isReady() && bootstrapped) createWindow()
    return
  }
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function createWindow(): void {
  initialPathTaken = false
  createMainWindow(ctx)
}

function extractPath(argv: string[]): string | null {
  for (const arg of argv.slice(1)) {
    if (!arg || arg.startsWith('-')) continue
    try {
      if (fs.existsSync(arg) && fs.statSync(arg).isFile() && isSupportedDocPath(arg)) {
        return path.resolve(arg)
      }
    } catch {
      /* ignore */
    }
  }
  return null
}
