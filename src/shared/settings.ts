import type { Settings } from './types'

const FONT_STACK =
  '"Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif'

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  general: {
    language: 'zh-CN',
    restoreWhenLaunch: 'lastFile',
    confirmExit: true
  },
  editor: {
    fontFamily: FONT_STACK,
    fontSize: 16,
    lineHeight: 1.75,
    tabSize: 2,
    lineWrapping: true,
    showLineNumbers: false,
    autoPair: true,
    livePreview: true,
    inlineMath: true,
    highlightSyntax: true,
    smartPunctuation: false,
    spellcheck: false,
    typewriterMode: false,
    focusMode: false,
    defaultEol: 'auto',
    finalNewline: 'auto',
    fontSizeZoom: 1
  },
  files: {
    autoSave: false,
    autoSaveIntervalMin: 5,
    recovery: true,
    defaultExtension: 'md',
    recentLimit: 50,
    showHiddenFiles: false,
    imageFolder: 'assets',
    imageCustomFolder: '',
    copyImagesOnPaste: true
  },
  appearance: {
    theme: 'system',
    sidebarVisible: true,
    sidebarWidth: 260,
    contentWidth: 'narrow',
    showStatusBar: true
  },
  export: {
    html: {
      theme: 'current',
      includeToc: false
    },
    pdf: {
      pageSize: 'A4',
      marginMm: 20,
      printBackground: true
    },
    general: {
      openAfterExport: true,
      defaultFolder: 'same'
    },
    pandoc: {}
  },
  advanced: {
    keybindings: {},
    devTools: false
  },
  window: {
    width: 1200,
    height: 800,
    maximized: false
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function mergeSettings<T extends Record<string, unknown>>(base: T, patch: unknown): T {
  if (!isPlainObject(patch)) return base
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    const current = out[key]
    if (isPlainObject(current)) {
      if (isPlainObject(value)) out[key] = mergeSettings(current, value)
    } else if (value !== undefined) {
      out[key] = value
    }
  }
  return out as T
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.min(max, Math.max(min, n))
}

export function normalizeSettings(input: unknown): Settings {
  const merged = mergeSettings<Record<string, unknown>>(
    DEFAULT_SETTINGS as unknown as Record<string, unknown>,
    input
  ) as unknown as Settings
  const editor = merged.editor
  editor.fontSize = clampNumber(editor.fontSize, 16, 12, 24)
  editor.lineHeight = clampNumber(editor.lineHeight, 1.75, 1.4, 2.2)
  editor.tabSize = Math.round(clampNumber(editor.tabSize, 2, 2, 4))
  editor.fontSizeZoom = clampNumber(editor.fontSizeZoom, 1, 0.5, 2)
  const files = merged.files
  files.autoSaveIntervalMin = Math.round(clampNumber(files.autoSaveIntervalMin, 5, 1, 60))
  files.recentLimit = Math.round(clampNumber(files.recentLimit, 50, 10, 200))
  const appearance = merged.appearance
  appearance.sidebarWidth = Math.round(clampNumber(appearance.sidebarWidth, 260, 240, 400))
  const exp = merged.export
  exp.pdf.marginMm = clampNumber(exp.pdf.marginMm, 20, 0, 60)
  return merged
}
