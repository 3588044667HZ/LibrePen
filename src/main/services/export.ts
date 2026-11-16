import { execFile } from 'node:child_process'
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
import type {
  ExportDocumentRequest,
  ExportHtmlRequest,
  ExportPdfRequest,
  PandocExportFormat
} from '@shared/types'
import { assertSafePath, decodeImageUrlPath, mimeForImage, resolveSafeImagePath } from '../lib/paths'
import { atomicWriteFile } from '../lib/atomic-write'

const MAX_INLINE_IMAGE = 5 * 1024 * 1024
const MAX_INLINE_TOTAL = 50 * 1024 * 1024
const MAX_REFERENCE_DOC = 50 * 1024 * 1024
const PANDOC_TIMEOUT_MS = 120_000
const MAX_PANDOC_BUFFER = 8 * 1024 * 1024
const PANDOC_FORMATS: Record<
  PandocExportFormat,
  { title: string; extension: string; filter: string; referenceDoc: boolean }
> = {
  docx: { title: '导出 Word', extension: 'docx', filter: 'Word', referenceDoc: true },
  odt: { title: '导出 ODT', extension: 'odt', filter: 'ODT', referenceDoc: false },
  rtf: { title: '导出 RTF', extension: 'rtf', filter: 'RTF', referenceDoc: false },
  epub: { title: '导出 EPUB', extension: 'epub', filter: 'EPUB', referenceDoc: false }
}


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

  async exportDocument(
    parent: BrowserWindow | null,
    request: ExportDocumentRequest,
    pandocPath: string | undefined
  ): Promise<string | null> {
    const format = PANDOC_FORMATS[request.format]
    const result = await saveDialog(parent, {
      title: format.title,
      defaultPath: safeSuggestedName(request.suggestedName, 'export.' + format.extension),
      filters: [{ name: format.filter, extensions: [format.extension] }]
    })
    if (result.canceled || !result.filePath) return null
    const suffix = new RegExp('\\.' + format.extension + '$', 'i')
    const target = suffix.test(result.filePath)
      ? result.filePath
      : result.filePath + '.' + format.extension
    const safeTarget = assertSafePath(target)
    const referenceDoc = format.referenceDoc ? validateReferenceDoc(request.referenceDoc) : null
    const docDir =
      request.docPath && path.isAbsolute(request.docPath) ? path.dirname(request.docPath) : null
    const stamp = process.pid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
    const tempMarkdown = path.join(os.tmpdir(), 'librepen-' + request.format + '-' + stamp + '.md')
    const tempOutput = path.join(
      os.tmpdir(),
      'librepen-' + request.format + '-' + stamp + '.' + format.extension
    )
    const title = sanitizeTitle(request.title)
    try {
      await fsp.writeFile(tempMarkdown, request.markdown, { encoding: 'utf8', mode: 0o600 })
      await runPandoc(
        pandocPath?.trim() || 'pandoc',
        buildPandocArgs(tempMarkdown, tempOutput, docDir, referenceDoc, request.format, title)
      )
      const stat = await fsp.stat(tempOutput)
      if (!stat.isFile() || stat.size === 0) {
        throw pandocError('E_PANDOC_FAILED', 'Pandoc 没有生成 ' + format.filter + ' 文件')
      }
      if (stat.size > 200 * 1024 * 1024) {
        throw pandocError('E_EXPORT_TOO_LARGE', format.filter + ' 导出文件过大')
      }
      atomicWriteFile(safeTarget, await fsp.readFile(tempOutput))
      return safeTarget
    } finally {
      await fsp.rm(tempMarkdown, { force: true }).catch(() => undefined)
      await fsp.rm(tempOutput, { force: true }).catch(() => undefined)
    }
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

function buildPandocArgs(
  input: string,
  output: string,
  docDir: string | null,
  referenceDoc: string | null,
  format: PandocExportFormat,
  title: string
): string[] {
  const args = [
    '--from',
    'markdown+mark+footnotes+definition_lists+task_lists+tex_math_dollars+superscript+subscript+strikeout+pipe_tables',
    '--standalone',
    '--to',
    format,
    '--output',
    output
  ]
  if (format === 'docx' && referenceDoc) args.push('--reference-doc', referenceDoc)
  if (format === 'epub' && title) args.push('--metadata', 'title=' + title)
  if (docDir) args.push('--resource-path', docDir)
  args.push(input)
  return args
}

function sanitizeTitle(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, 256)
}

function validateReferenceDoc(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || value.length > 4096) {
    throw pandocError('E_REFERENCE_DOC', 'Word 参考样式路径无效')
  }
  let filePath: string
  try {
    filePath = assertSafePath(value)
  } catch {
    throw pandocError('E_REFERENCE_DOC', 'Word 参考样式路径无效')
  }
  if (path.extname(filePath).toLowerCase() !== '.docx') {
    throw pandocError('E_REFERENCE_DOC', 'Word 参考样式必须是 .docx 文件')
  }
  let stat: fs.Stats
  try {
    stat = fs.statSync(filePath)
  } catch {
    throw pandocError('E_REFERENCE_DOC', 'Word 参考样式文件不存在')
  }
  if (!stat.isFile() || stat.size > MAX_REFERENCE_DOC) {
    throw pandocError('E_REFERENCE_DOC', 'Word 参考样式文件无效或过大')
  }
  return filePath
}

function runPandoc(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { windowsHide: true, timeout: PANDOC_TIMEOUT_MS, maxBuffer: MAX_PANDOC_BUFFER },
      (error, _stdout, stderr) => {
        if (!error) {
          resolve()
          return
        }
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'ENOENT') {
          reject(pandocError('E_PANDOC_NOT_FOUND', '未检测到 Pandoc'))
          return
        }
        const detail = (stderr || error.message || 'Pandoc 导出失败').trim().slice(0, 2000)
        reject(pandocError('E_PANDOC_FAILED', detail))
      }
    )
  })
}

function pandocError(code: string, message: string): Error {
  const error = new Error(message) as NodeJS.ErrnoException
  error.code = code
  return error
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
