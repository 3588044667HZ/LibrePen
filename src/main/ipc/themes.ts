import { app, ipcMain } from 'electron'
import type { ThemeParts } from '../services/themes'
import { ThemeService } from '../services/themes'

const THEMES_LIST = 'themes:list'
const THEMES_READ = 'themes:read'
const THEMES_OPEN = 'themes:open'

function emptyParts(): ThemeParts {
  return { baseUser: '', themeUser: '', theme: '' }
}

export function registerThemesIpc(userData?: string): void {
  const service = new ThemeService(userData ?? app.getPath('userData'))

  ipcMain.handle(THEMES_LIST, () => {
    try {
      return service.list()
    } catch {
      return []
    }
  })

  ipcMain.handle(THEMES_READ, (_event, name: unknown) => {
    if (typeof name !== 'string') return emptyParts()
    try {
      return service.read(name)
    } catch {
      return emptyParts()
    }
  })

  ipcMain.handle(THEMES_OPEN, async () => {
    try {
      await service.openFolder()
    } catch {}
  })
}
