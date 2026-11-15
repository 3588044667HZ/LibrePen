import fs from 'node:fs/promises'
import path from 'node:path'
import { BrowserWindow, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { IPC } from '@shared/ipc'
import { Menu } from 'electron'
import type { DirtyState, OverlayColors } from '@shared/types'
import type { AppContext } from '../context'
import { assertSafePath } from '../lib/paths'
import { fail, ok } from './result'

const OPENABLE_EXTENSIONS = new Set(['.html', '.htm', '.pdf', '.md', '.markdown', '.txt', '.text'])

export function registerWindowIpc(ctx: AppContext): void {
  const target = (event: IpcMainInvokeEvent): BrowserWindow | null =>
    BrowserWindow.fromWebContents(event.sender)

  ipcMain.handle(IPC.windowMinimize, (event) => {
    target(event)?.minimize()
  })
  ipcMain.handle(IPC.windowMaximize, (event) => {
    const win = target(event)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.handle(IPC.windowClose, (event) => {
    target(event)?.close()
  })
  ipcMain.handle(IPC.windowIsMaximized, (event) => target(event)?.isMaximized() ?? false)

  ipcMain.handle(IPC.windowSetOverlay, (event, colors: OverlayColors) => {
    const win = target(event)
    if (!win) return
    if (typeof colors?.color !== 'string' || typeof colors?.symbolColor !== 'string') return
    if (colors.color.length > 32 || colors.symbolColor.length > 32) return
    try {
      win.setTitleBarOverlay({ color: colors.color, symbolColor: colors.symbolColor, height: 36 })
    } catch {
      /* not supported on this platform */
    }
  })

  ipcMain.handle(IPC.windowPopupMenu, (event, x: unknown, y: unknown) => {
    const win = target(event)
    if (!win) return
    if (typeof x !== 'number' || typeof y !== 'number') return
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    const menu = Menu.getApplicationMenu()
    try {
      menu?.popup({ window: win, x: Math.round(x), y: Math.round(y) })
    } catch {}
  })

  ipcMain.handle(IPC.windowConfirmClose, (event, saved: unknown) => {
    const win = target(event)
    if (!win) return
    if (saved === true) {
      ctx.forceClose = true
      ;(win as BrowserWindow & { __librepenForceClose?: boolean }).__librepenForceClose = true
      win.close()
    } else {
      ctx.closePromptActive = false
    }
  })

  ipcMain.handle(IPC.docSetDirty, (_event, state: unknown) => {
    try {
      if (!state || typeof state !== 'object') throw new Error('E_INVALID_REQUEST')
      const input = state as Partial<DirtyState>
      if (typeof input.dirty !== 'boolean') throw new Error('E_INVALID_REQUEST')
      if (input.path !== null && typeof input.path !== 'string') throw new Error('E_INVALID_REQUEST')
      if (typeof input.title !== 'string') throw new Error('E_INVALID_REQUEST')
      if (input.title.length > 512 || (input.path?.length ?? 0) > 32_767) {
        throw new Error('E_INVALID_REQUEST')
      }
      ctx.setDirty({ dirty: input.dirty, path: input.path, title: input.title })
      return ok(undefined)
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle(IPC.shellOpenPath, async (_event, filePath: unknown) => {
    if (typeof filePath !== 'string' || !filePath) return
    try {
      const abs = assertSafePath(filePath)
      if (!OPENABLE_EXTENSIONS.has(path.extname(abs).toLowerCase())) return
      if (process.platform === 'win32' && abs.replace(/^[a-zA-Z]:/, '').includes(':')) return
      const real = await fs.realpath(abs)
      if (!OPENABLE_EXTENSIONS.has(path.extname(real).toLowerCase())) return
      const stat = await fs.stat(real)
      if (!stat.isFile()) return
      await shell.openPath(real)
    } catch {}
  })

  ipcMain.handle(IPC.shellOpenExternal, async (_event, url: unknown) => {
    if (typeof url !== 'string' || url.length > 4096) return
    if (!/^(https?:|mailto:)/i.test(url)) return
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && parsed.protocol !== 'mailto:') {
        return
      }
      await shell.openExternal(url)
    } catch {}
  })
}
