import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  SETTINGS_VERSION,
  mergeSettings,
  normalizeSettings
} from '../src/shared/settings'
import type { Settings } from '../src/shared/types'

interface Base {
  [key: string]: unknown
  a: number
  nested: { x: number; y: number }
  list: number[]
}

const base: Base = { a: 1, nested: { x: 1, y: 2 }, list: [1, 2] }

describe('DEFAULT_SETTINGS', () => {
  it('exposes stable defaults', () => {
    expect(DEFAULT_SETTINGS.version).toBe(SETTINGS_VERSION)
    expect(DEFAULT_SETTINGS.general.language).toBe('zh-CN')
    expect(DEFAULT_SETTINGS.editor.fontSize).toBe(16)
    expect(DEFAULT_SETTINGS.files.recentLimit).toBe(50)
    expect(DEFAULT_SETTINGS.appearance.sidebarWidth).toBe(260)
  })
})

describe('mergeSettings', () => {
  it('returns the base for non-object patches', () => {
    expect(mergeSettings(base, null)).toBe(base)
    expect(mergeSettings(base, undefined)).toBe(base)
    expect(mergeSettings(base, 'nope')).toBe(base)
    expect(mergeSettings(base, [1, 2])).toBe(base)
  })

  it('merges nested plain objects', () => {
    expect(mergeSettings(base, { nested: { y: 3, z: 4 } })).toEqual({
      a: 1,
      nested: { x: 1, y: 3, z: 4 },
      list: [1, 2]
    })
  })

  it('merges three levels deep', () => {
    const deep = { l1: { l2: { a: 1, b: 2 } } }
    expect(mergeSettings(deep, { l1: { l2: { b: 3, c: 4 } } })).toEqual({
      l1: { l2: { a: 1, b: 3, c: 4 } }
    })
  })

  it('preserves unknown keys from the patch', () => {
    const out = mergeSettings<Record<string, unknown>>({ known: 1 }, { extra: { deep: true } })
    expect(out).toEqual({ known: 1, extra: { deep: true } })
  })

  it('does not mutate the base and returns new nested objects', () => {
    const out = mergeSettings(base, { nested: { y: 3 } })
    expect(base).toEqual({ a: 1, nested: { x: 1, y: 2 }, list: [1, 2] })
    expect(out.nested).not.toBe(base.nested)
  })

  it('ignores undefined patch values', () => {
    expect(mergeSettings({ a: 1, b: 2 }, { a: undefined, c: 3 })).toEqual({ a: 1, b: 2, c: 3 })
  })

  it('replaces arrays instead of merging them', () => {
    expect(mergeSettings(base, { list: [3] }).list).toEqual([3])
  })

  it('ignores invalid non-object replacements for object settings', () => {
    const out = mergeSettings<{ editor: { fontSize: number } }>(
      { editor: { fontSize: 16 } },
      { editor: null }
    )
    expect(out.editor.fontSize).toBe(16)
  })

  it('keeps null values for fields that are not objects in the base', () => {
    const out = mergeSettings<Record<string, unknown>>({ a: 1 }, { b: null })
    expect(out.b).toBeNull()
  })
})

describe('normalizeSettings', () => {
  it('falls back to defaults for corrupted top-level input', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings('garbage')).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings(42)).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings([])).toEqual(DEFAULT_SETTINGS)
  })

  it('falls back to defaults for corrupted nested sections', () => {
    const settings = normalizeSettings({
      editor: null,
      files: 'nope',
      appearance: null,
      export: { pdf: null }
    })
    expect(settings.editor.fontSize).toBe(16)
    expect(settings.files.recentLimit).toBe(50)
    expect(settings.appearance.sidebarWidth).toBe(260)
    expect(settings.export.pdf.marginMm).toBe(20)
    expect(settings.export.html.includeToc).toBe(false)
  })

  it('merges partial sections over the defaults', () => {
    const settings = normalizeSettings({ editor: { fontSize: 18 } })
    expect(settings.editor.fontSize).toBe(18)
    expect(settings.editor.lineWrapping).toBe(true)
    expect(settings.editor.tabSize).toBe(2)
    expect(settings.files.recentLimit).toBe(50)
  })

  it('clamps numeric values to their upper bounds', () => {
    const settings = normalizeSettings({
      editor: { fontSize: 100, lineHeight: 9, tabSize: 9, fontSizeZoom: 9 },
      files: { autoSaveIntervalMin: 999, recentLimit: 999 },
      appearance: { sidebarWidth: 999 },
      export: { pdf: { marginMm: 100 } }
    })
    expect(settings.editor.fontSize).toBe(24)
    expect(settings.editor.lineHeight).toBe(2.2)
    expect(settings.editor.tabSize).toBe(4)
    expect(settings.editor.fontSizeZoom).toBe(2)
    expect(settings.files.autoSaveIntervalMin).toBe(60)
    expect(settings.files.recentLimit).toBe(200)
    expect(settings.appearance.sidebarWidth).toBe(400)
    expect(settings.export.pdf.marginMm).toBe(60)
  })

  it('clamps numeric values to their lower bounds', () => {
    const settings = normalizeSettings({
      editor: { fontSize: 1, lineHeight: 1, tabSize: 1, fontSizeZoom: 0.1 },
      files: { autoSaveIntervalMin: 0, recentLimit: 5 },
      appearance: { sidebarWidth: 100 },
      export: { pdf: { marginMm: -5 } }
    })
    expect(settings.editor.fontSize).toBe(12)
    expect(settings.editor.lineHeight).toBe(1.4)
    expect(settings.editor.tabSize).toBe(2)
    expect(settings.editor.fontSizeZoom).toBe(0.5)
    expect(settings.files.autoSaveIntervalMin).toBe(1)
    expect(settings.files.recentLimit).toBe(10)
    expect(settings.appearance.sidebarWidth).toBe(240)
    expect(settings.export.pdf.marginMm).toBe(0)
  })

  it('rounds integer settings after clamping', () => {
    const settings = normalizeSettings({
      editor: { tabSize: 3.6 },
      files: { autoSaveIntervalMin: 5.5, recentLimit: 10.6 },
      appearance: { sidebarWidth: 260.4 }
    })
    expect(settings.editor.tabSize).toBe(4)
    expect(settings.files.autoSaveIntervalMin).toBe(6)
    expect(settings.files.recentLimit).toBe(11)
    expect(settings.appearance.sidebarWidth).toBe(260)
  })

  it('uses defaults for non-numeric and non-finite numbers', () => {
    const settings = normalizeSettings({
      editor: { fontSize: 'big', lineHeight: Number.NaN, tabSize: Number.POSITIVE_INFINITY }
    })
    expect(settings.editor.fontSize).toBe(16)
    expect(settings.editor.lineHeight).toBe(1.6)
    expect(settings.editor.tabSize).toBe(2)
  })

  it('keeps export defaults when only one export field is provided', () => {
    const settings = normalizeSettings({ export: { pdf: { marginMm: 10 } } })
    expect(settings.export.pdf.marginMm).toBe(10)
    expect(settings.export.pdf.pageSize).toBe('A4')
    expect(settings.export.pdf.printBackground).toBe(true)
    expect(settings.export.general.openAfterExport).toBe(true)
  })

  it('preserves unknown top-level and nested keys', () => {
    interface ExtendedSettings extends Settings {
      customTop?: number
      general: Settings['general'] & { customNested?: string }
      editor: Settings['editor'] & { customEditor?: boolean }
    }
    const settings = normalizeSettings({
      customTop: 7,
      general: { customNested: 'keep' },
      editor: { customEditor: true }
    }) as ExtendedSettings
    expect(settings.customTop).toBe(7)
    expect(settings.general.customNested).toBe('keep')
    expect(settings.editor.customEditor).toBe(true)
    expect(settings.general.language).toBe('zh-CN')
  })

  it('deep-merges keybindings', () => {
    const settings = normalizeSettings({ advanced: { keybindings: { 'Ctrl+B': 'bold' } } })
    expect(settings.advanced.keybindings).toEqual({ 'Ctrl+B': 'bold' })
    expect(settings.advanced.devTools).toBe(false)
    expect(DEFAULT_SETTINGS.advanced.keybindings).toEqual({})
  })

  it('does not mutate DEFAULT_SETTINGS', () => {
    normalizeSettings({
      editor: { fontSize: 100 },
      files: { recentLimit: 999 },
      appearance: { sidebarWidth: 999 }
    })
    expect(DEFAULT_SETTINGS.editor.fontSize).toBe(16)
    expect(DEFAULT_SETTINGS.files.recentLimit).toBe(50)
    expect(DEFAULT_SETTINGS.appearance.sidebarWidth).toBe(260)
  })

  it('stamps the current settings version', () => {
    expect(normalizeSettings({ version: 1 }).version).toBe(SETTINGS_VERSION)
  })

  it('migrates legacy font and line height from version 1', () => {
    const settings = normalizeSettings({
      version: 1,
      editor: {
        fontFamily:
          '"Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif',
        lineHeight: 1.75
      }
    })
    expect(settings.version).toBe(SETTINGS_VERSION)
    expect(settings.editor.fontFamily).toContain('"Open Sans"')
    expect(settings.editor.lineHeight).toBe(1.6)
  })
})
