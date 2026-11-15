import fs from 'node:fs'
import path from 'node:path'
import { app, ipcMain, shell } from 'electron'
import { IPC } from '@shared/ipc'
import { mergeSettings, normalizeSettings } from '@shared/settings'
import type { Settings } from '@shared/types'
import type { AppContext } from '../context'
import { fail, ok } from './result'

export function registerSettingsIpc(ctx: AppContext): void {
  ipcMain.handle(IPC.settingsGet, () => ctx.settings.read())

  ipcMain.handle(IPC.settingsSet, (_event, patch: unknown) => {
    try {
      const current = ctx.settings.read()
      const merged = normalizeSettings(mergeSettings(current as unknown as Record<string, unknown>, patch))
      const saved = ctx.settings.write(merged)
      ctx.refreshMenu()
      return ok(saved)
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle(IPC.settingsOpenDir, async () => {
    try {
      await shell.openPath(app.getPath('userData'))
    } catch {}
  })

  ipcMain.handle(IPC.settingsImportTypora, () => {
    try {
      const base = process.env.APPDATA || app.getPath('appData')
      const confPath = path.join(base, 'Typora', 'conf', 'conf.user.json')
      if (!fs.existsSync(confPath)) throw new Error('E_NOT_FOUND')
      const parsed = parseLooseJson(fs.readFileSync(confPath, 'utf8')) as Record<string, unknown>
      const current = ctx.settings.read()
      const patch: Partial<Settings> = {}

      const families = parsed.defaultFontFamily as Record<string, string | null> | undefined
      if (families) {
        const value = families.sansSerif || families.standard || families.serif || families.monospace
        if (typeof value === 'string' && value.trim()) {
          patch.editor = { ...current.editor, fontFamily: value.slice(0, 500) }
        }
      }
      const keyBinding = parsed.keyBinding
      if (keyBinding && typeof keyBinding === 'object' && !Array.isArray(keyBinding)) {
        const imported: Record<string, string> = {}
        for (const [key, value] of Object.entries(keyBinding as Record<string, unknown>)) {
          if (key.length <= 100 && typeof value === 'string' && value.length <= 100) {
            imported[key] = value
          }
        }
        patch.advanced = {
          ...current.advanced,
          keybindings: {
            ...current.advanced.keybindings,
            ...imported
          },
          typoraConfigPath: confPath
        }
      }
      const merged = normalizeSettings(
        mergeSettings(current as unknown as Record<string, unknown>, patch as unknown as Record<string, unknown>)
      )
      ctx.settings.write(merged)
      ctx.refreshMenu()
      return ok(merged)
    } catch (error) {
      return fail(error)
    }
  })
}

function parseLooseJson(text: string): unknown {
  const clean = text.replace(/^\uFEFF/, '')
  try {
    return JSON.parse(clean)
  } catch {
    const stripped = clean
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:\\])\/\/.*$/gm, '$1')
      .replace(/,\s*([}\]])/g, '$1')
    return JSON.parse(stripped)
  }
}
