import fs from 'node:fs'
import path from 'node:path'
import { shell } from 'electron'

const MAX_THEME_BYTES = 2_000_000
const MAX_THEME_NAME = 120
const INVALID_NAME = /[\\/:*?"<>|\u0000-\u001f]/
const THEMES_DIR = 'themes'

export interface ThemeFile {
  name: string
  path: string
  isUserFile: boolean
}

export interface ThemeParts {
  baseUser: string
  themeUser: string
  theme: string
}

export class ThemeService {
  readonly directory: string

  constructor(userData: string) {
    if (typeof userData !== 'string' || userData.length === 0) {
      throw new Error('E_INVALID_USER_DATA')
    }
    this.directory = path.join(userData, THEMES_DIR)
    fs.mkdirSync(this.directory, { recursive: true })
  }

  list(): ThemeFile[] {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(this.directory, { withFileTypes: true })
    } catch {
      return []
    }
    const themes: ThemeFile[] = []
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const lower = entry.name.toLowerCase()
      if (!lower.endsWith('.css')) continue
      themes.push({
        name: entry.name,
        path: path.join(this.directory, entry.name),
        isUserFile: lower === 'base.user.css' || lower.endsWith('.user.css')
      })
    }
    themes.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    )
    return themes
  }

  read(name: string): ThemeParts {
    const baseUser = this.readFile('base.user.css')
    if (!name) return { baseUser, themeUser: '', theme: '' }
    const safeName = sanitizeThemeName(name)
    if (!safeName) return { baseUser, themeUser: '', theme: '' }
    const base = safeName.slice(0, -'.css'.length)
    return {
      baseUser,
      themeUser: this.readFile(`${base}.user.css`),
      theme: this.readFile(safeName)
    }
  }

  async openFolder(): Promise<void> {
    try {
      await shell.openPath(this.directory)
    } catch {}
  }

  private readFile(fileName: string): string {
    try {
      const target = path.join(this.directory, fileName)
      const stat = fs.lstatSync(target)
      if (!stat.isFile() || stat.size > MAX_THEME_BYTES) return ''
      const content = fs.readFileSync(target)
      if (content.length > MAX_THEME_BYTES) return ''
      return stripBom(content.toString('utf8'))
    } catch {
      return ''
    }
  }
}

export function sanitizeThemeName(name: string): string | null {
  if (typeof name !== 'string') return null
  if (name.length === 0 || name.length > MAX_THEME_NAME) return null
  if (path.basename(name) !== name) return null
  if (!name.toLowerCase().endsWith('.css')) return null
  if (name.includes('..') || INVALID_NAME.test(name)) return null
  if (/[ .]$/.test(name)) return null
  return name
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value
}
