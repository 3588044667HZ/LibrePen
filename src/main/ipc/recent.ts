import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { AppContext } from '../context'

export function registerRecentIpc(ctx: AppContext): void {
  ipcMain.handle(IPC.recentList, () => ctx.recent.list())

  ipcMain.handle(IPC.recentAdd, (_event, filePath: unknown) => {
    if (typeof filePath !== 'string' || !filePath) return ctx.recent.list()
    try {
      const store = ctx.recent.addFile(filePath)
      ctx.saveSession({ lastFile: filePath })
      ctx.refreshMenu()
      return store
    } catch {
      return ctx.recent.list()
    }
  })

  ipcMain.handle(IPC.recentAddFolder, (_event, folderPath: unknown) => {
    if (typeof folderPath !== 'string' || !folderPath) return ctx.recent.list()
    try {
      const store = ctx.recent.addFolder(folderPath)
      ctx.saveSession({ lastFolder: folderPath })
      ctx.refreshMenu()
      return store
    } catch {
      return ctx.recent.list()
    }
  })

  ipcMain.handle(IPC.recentClear, () => {
    const store = ctx.recent.clear()
    ctx.refreshMenu()
    return store
  })
}
