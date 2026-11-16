import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { IPC } from '@shared/ipc'
import type { ExportDocxRequest, ExportHtmlRequest, ExportPdfRequest } from '@shared/types'
import type { AppContext } from '../context'
import { ExportService } from '../services/export'
import { fail, ok } from './result'

const MAX_HTML_LENGTH = 50_000_000
const PAGE_SIZES = new Set(['A4', 'Letter', 'A5', 'Legal'])
const MAX_MARKDOWN_LENGTH = 50_000_000

function readHtml(value: unknown): string {
  if (typeof value !== 'string') throw new Error('E_INVALID_REQUEST')
  if (value.length > MAX_HTML_LENGTH) throw new Error('E_EXPORT_TOO_LARGE')
  return value
}

function readMarkdown(value: unknown): string {
  if (typeof value !== 'string') throw new Error('E_INVALID_REQUEST')
  if (value.length > MAX_MARKDOWN_LENGTH) throw new Error('E_EXPORT_TOO_LARGE')
  return value
}

function readName(value: unknown, fallback: string): string {
  return typeof value === 'string' && value && !value.includes('\0') ? value.slice(0, 512) : fallback
}

function readMargin(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(100, Math.max(0, value))
}

export function registerExportIpc(ctx: AppContext): void {
  const service = new ExportService()

  ipcMain.handle(IPC.exportHtml, async (event: IpcMainInvokeEvent, raw: unknown) => {
    try {
      if (!raw || typeof raw !== 'object') throw new Error('E_INVALID_REQUEST')
      const input = raw as Partial<ExportHtmlRequest>
      const request: ExportHtmlRequest = {
        html: readHtml(input.html),
        suggestedName: readName(input.suggestedName, 'export.html')
      }
      const win = BrowserWindow.fromWebContents(event.sender)
      const saved = await service.exportHtml(win, request)
      return ok(saved)
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle(IPC.exportDocx, async (event: IpcMainInvokeEvent, raw: unknown) => {
    try {
      if (!raw || typeof raw !== 'object') throw new Error('E_INVALID_REQUEST')
      const input = raw as Partial<ExportDocxRequest>
      const settings = ctx.settings.read()
      const request: ExportDocxRequest = {
        markdown: readMarkdown(input.markdown),
        docPath: typeof input.docPath === 'string' && !input.docPath.includes('\0') ? input.docPath : null,
        suggestedName: readName(input.suggestedName, 'export.docx'),
        referenceDoc: typeof input.referenceDoc === 'string' ? input.referenceDoc : ''
      }
      const win = BrowserWindow.fromWebContents(event.sender)
      const saved = await service.exportDocx(win, request, settings.export.pandoc.path)
      return ok(saved)
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle(IPC.exportPdf, async (event: IpcMainInvokeEvent, raw: unknown) => {
    try {
      if (!raw || typeof raw !== 'object') throw new Error('E_INVALID_REQUEST')
      const input = raw as Partial<ExportPdfRequest>
      const settings = ctx.settings.read()
      const fallbackPage = PAGE_SIZES.has(settings.export.pdf.pageSize)
        ? settings.export.pdf.pageSize
        : 'A4'
      const pageSize =
        typeof input.pageSize === 'string' && PAGE_SIZES.has(input.pageSize)
          ? (input.pageSize as ExportPdfRequest['pageSize'])
          : fallbackPage
      const request: ExportPdfRequest = {
        html: readHtml(input.html),
        suggestedName: readName(input.suggestedName, 'export.pdf'),
        pageSize,
        marginMm: readMargin(input.marginMm, readMargin(settings.export.pdf.marginMm, 20)),
        printBackground:
          typeof input.printBackground === 'boolean'
            ? input.printBackground
            : settings.export.pdf.printBackground === true
      }
      const win = BrowserWindow.fromWebContents(event.sender)
      const saved = await service.exportPdf(win, request)
      return ok(saved)
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle(IPC.printDocument, async (event: IpcMainInvokeEvent, html: unknown) => {
    try {
      const request = readHtml(html)
      const win = BrowserWindow.fromWebContents(event.sender)
      await service.print(win, request)
      return ok(undefined)
    } catch (error) {
      return fail(error)
    }
  })
}
