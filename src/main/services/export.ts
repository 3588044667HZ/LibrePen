import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  BrowserWindow,
  dialog,
  type SaveDialogReturnValue,
  type SaveDialogOptions
} from 'electron'
import type { ExportHtmlRequest, ExportPdfRequest } from '@shared/types'
import { assertSafePath, decodeImageUrlPath, mimeForImage, resolveSafeImagePath } from '../lib/paths'
import { atomicWriteFile } from '../lib/atomic-write'

const MAX_INLINE_IMAGE = 5 * 1024 * 1024
const MAX_INLINE_TOTAL = 50 * 1024 * 1024
const PRINT_CSP =
  "default-src 'none'; img-src 'self' mdimg: data: blob: https:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; media-src 'self' mdimg: data: https:; object-src 'none'; frame-src 'none'; connect-src 'none'"

export class ExportService {
  async exportHtml(parent: BrowserWindow | null, request: ExportHtmlRequest): Promise<string | null> {
    const result = await saveDialog(parent, {
      title: '导出 HTML',
      defaultPath: safeSuggestedName(request.suggestedName, 'export.html'),
      filters: [{ name: 'HTML', extensions: ['html', 'htm'] }]
    })
    if (result.canceled || !result.filePath) return null
    const target = /\.html?$/i.test(result.filePath) ? result.filePath : `${result.filePath}.html`
    const safeTarget = assertSafePath(target)
    const html = inlineImages(request.html)
    atomicWriteFile(safeTarget, html)
    return safeTarget
  }

  async exportPdf(parent: BrowserWindow | null, request: ExportPdfRequest): Promise<string | null> {
    const result = await saveDialog(parent, {
      title: '导出 PDF',
      defaultPath: safeSuggestedName(request.suggestedName, 'export.pdf'),
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (result.canceled || !result.filePath) return null
    const target = /\.pdf$/i.test(result.filePath) ? result.filePath : `${result.filePath}.pdf`
    const safeTarget = assertSafePath(target)

    const html = hardenHtml(inlineImages(request.html))
    const temp = path.join(
      os.tmpdir(),
      `librepen-export-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.html`
    )
    await fsp.writeFile(temp, html, { encoding: 'utf8', mode: 0o600 })
    const win = createHiddenWindow()
    try {
      await loadAndSettle(win, temp)
      const marginMm =
        typeof request.marginMm === 'number' && Number.isFinite(request.marginMm)
          ? Math.min(100, Math.max(0, request.marginMm))
          : 20
      const marginInch = marginMm / 25.4
      const pdf = await win.webContents.printToPDF({
        printBackground:
          typeof request.printBackground === 'boolean' ? request.printBackground : true,
        pageSize: request.pageSize ?? 'A4',
        margins: { top: marginInch, bottom: marginInch, left: marginInch, right: marginInch },
        preferCSSPageSize: false
      })
      await fsp.writeFile(safeTarget, pdf)
      return safeTarget
    } finally {
      if (!win.isDestroyed()) win.destroy()
      await fsp.rm(temp, { force: true }).catch(() => undefined)
    }
  }

  async print(_parent: BrowserWindow | null, html: string): Promise<void> {
    const temp = path.join(
      os.tmpdir(),
      `librepen-print-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.html`
    )
    await fsp.writeFile(temp, hardenHtml(inlineImages(html)), { encoding: 'utf8', mode: 0o600 })
    const win = createHiddenWindow()
    try {
      await loadAndSettle(win, temp)
      await new Promise<void>((resolve, reject) => {
        win.webContents.print({ silent: false, printBackground: true }, (success, reason) => {
          if (success || /cancel/i.test(reason ?? '')) resolve()
          else reject(new Error(reason || 'print failed'))
        })
      })
    } finally {
      if (!win.isDestroyed()) win.destroy()
      await fsp.rm(temp, { force: true }).catch(() => undefined)
    }
  }
}

function createHiddenWindow(): BrowserWindow {
  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    backgroundColor: '#ffffff',
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: false,
      backgroundThrottling: false
    }
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault()
  })
  win.webContents.on('will-redirect', (event) => event.preventDefault())
  return win
}

async function loadAndSettle(win: BrowserWindow, file: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    win.webContents.once('did-finish-load', () => resolve())
    win.webContents.once('did-fail-load', (_event, code, description) =>
      reject(new Error(`load failed: ${code} ${description}`))
    )
    win.loadFile(file).catch(reject)
  })
  await new Promise((resolve) => setTimeout(resolve, 500))
}

function inlineImages(html: string): string {
  const cache = new Map<string, string>()
  let total = 0
  return html.replace(/src="(mdimg:\/\/[^"]+)"/g, (full, url: string) => {
    if (cache.has(url)) return `src="${cache.get(url)}"`
    try {
      const parsed = new URL(url)
      if (parsed.hostname !== 'local') return full
      const raw = decodeImageUrlPath(parsed.pathname)
      const filePath = resolveSafeImagePath(raw)
      if (!filePath) return full
      const stat = fs.statSync(filePath)
      if (!stat.isFile() || stat.size > MAX_INLINE_IMAGE || total + stat.size > MAX_INLINE_TOTAL) return full
      const data = fs.readFileSync(filePath)
      if (data.length > MAX_INLINE_IMAGE || total + data.length > MAX_INLINE_TOTAL) return full
      total += data.length
      const dataUrl = `data:${mimeForImage(filePath)};base64,${data.toString('base64')}`
      cache.set(url, dataUrl)
      return `src="${dataUrl}"`
    } catch {
      return full
    }
  })
}

function hardenHtml(html: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${PRINT_CSP}">`
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head([^>]*)>/i, `<head$1>${meta}`)
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html([^>]*)>/i, `<html$1><head>${meta}</head>`)
  return meta + html
}

function safeSuggestedName(value: string, fallback: string): string {
  return typeof value === 'string' && value && !value.includes('\0') ? value.slice(0, 512) : fallback
}

async function saveDialog(
  parent: BrowserWindow | null,
  options: SaveDialogOptions
): Promise<SaveDialogReturnValue> {
  return parent ? dialog.showSaveDialog(parent, options) : dialog.showSaveDialog(options)
}
