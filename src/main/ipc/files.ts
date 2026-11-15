import fs from 'node:fs/promises'
import path from 'node:path'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type IpcMainInvokeEvent,
  type MessageBoxOptions,
  type OpenDialogOptions,
  type SaveDialogOptions
} from 'electron'
import { IPC } from '@shared/ipc'
import type {
  DocPayload,
  Encoding,
  Eol,
  FileNode,
  ImportImageRequest,
  ImportImageResult,
  SaveRequest
} from '@shared/types'
import {
  applyFinalNewline,
  detectEol,
  encodeMarkdownUrl,
  hasFinalNewline,
  isImageFile,
  normalizeEol,
  relativePath,
  sanitizeFileName,
  stripBom
} from '@shared/markdown'
import type { AppContext } from '../context'
import { atomicWriteFile } from '../lib/atomic-write'
import { decodeBuffer, encodeContent } from '../lib/encoding'
import {
  assertSafePath,
  directoryExists,
  fileExists,
  IMAGE_EXTENSIONS,
  isSupportedDocPath,
  SUPPORTED_EXTENSIONS
} from '../lib/paths'
import { fail, ok } from './result'

const MAX_FILE_SIZE = 2_000_000
const MAX_IMAGE_SIZE = 32 * 1024 * 1024
const MAX_WRITE_SIZE = 50 * 1024 * 1024

const VALID_ENCODINGS = new Set<string>([
  'utf8',
  'utf8-bom',
  'utf16le',
  'utf16be',
  'gbk',
  'big5',
  'shift_jis',
  'latin1'
])

function isEncoding(value: unknown): value is Encoding {
  return typeof value === 'string' && VALID_ENCODINGS.has(value)
}

function normalizeSaveRequest(input: unknown): SaveRequest {
  if (!input || typeof input !== 'object') throw new Error('E_INVALID_REQUEST')
  const request = input as Partial<SaveRequest>
  if (typeof request.content !== 'string') throw new Error('E_INVALID_REQUEST')
  if (request.path !== undefined && request.path !== null && typeof request.path !== 'string') {
    throw new Error('E_INVALID_PATH')
  }
  if (request.encoding !== undefined && !isEncoding(request.encoding)) {
    throw new Error('E_INVALID_REQUEST')
  }
  if (request.eol !== undefined && request.eol !== 'lf' && request.eol !== 'crlf') {
    throw new Error('E_INVALID_REQUEST')
  }
  if (request.finalNewline !== undefined && typeof request.finalNewline !== 'boolean') {
    throw new Error('E_INVALID_REQUEST')
  }
  if (
    request.expectedMtimeMs !== undefined &&
    (typeof request.expectedMtimeMs !== 'number' || !Number.isFinite(request.expectedMtimeMs))
  ) {
    throw new Error('E_INVALID_REQUEST')
  }
  if (Buffer.byteLength(request.content, 'utf8') > MAX_WRITE_SIZE) {
    throw new Error('E_CONTENT_TOO_LARGE')
  }
  return {
    path: typeof request.path === 'string' ? request.path : null,
    content: request.content,
    encoding: request.encoding,
    eol: request.eol,
    finalNewline: request.finalNewline,
    expectedMtimeMs: request.expectedMtimeMs
  }
}

function showOpenDialog(
  win: BrowserWindow | null,
  options: OpenDialogOptions
): ReturnType<typeof dialog.showOpenDialog> {
  return win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options)
}

function showSaveDialog(
  win: BrowserWindow | null,
  options: SaveDialogOptions
): ReturnType<typeof dialog.showSaveDialog> {
  return win ? dialog.showSaveDialog(win, options) : dialog.showSaveDialog(options)
}

function showMessageBox(
  win: BrowserWindow | null,
  options: MessageBoxOptions
): ReturnType<typeof dialog.showMessageBox> {
  return win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options)
}
const IGNORED_NAMES = new Set(['.git', 'node_modules', 'Thumbs.db', '.DS_Store'])

export function registerFilesIpc(ctx: AppContext): void {
  ipcMain.handle(IPC.dialogOpenFile, async (event: IpcMainInvokeEvent) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender)
      const result = await showOpenDialog(win, {
        title: '打开 Markdown 文件',
        properties: ['openFile'],
        filters: [
          { name: 'Markdown', extensions: SUPPORTED_EXTENSIONS.map((item) => item.slice(1)) },
          { name: '所有文件', extensions: ['*'] }
        ]
      })
      return result.canceled ? null : (result.filePaths[0] ?? null)
    } catch {
      return null
    }
  })

  ipcMain.handle(IPC.dialogOpenFolder, async (event: IpcMainInvokeEvent) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender)
      const result = await showOpenDialog(win, {
        title: '打开文件夹',
        properties: ['openDirectory']
      })
      return result.canceled ? null : (result.filePaths[0] ?? null)
    } catch {
      return null
    }
  })

  ipcMain.handle(
    IPC.dialogConfirm,
    async (event: IpcMainInvokeEvent, raw: unknown) => {
      const options =
        raw && typeof raw === 'object'
          ? (raw as { message?: unknown; detail?: unknown; confirmLabel?: unknown; cancelLabel?: unknown })
          : undefined
      const win = BrowserWindow.fromWebContents(event.sender)
      const confirmLabel =
        typeof options?.confirmLabel === 'string' && options.confirmLabel
          ? options.confirmLabel.slice(0, 64)
          : '确定'
      const cancelLabel =
        typeof options?.cancelLabel === 'string' && options.cancelLabel
          ? options.cancelLabel.slice(0, 64)
          : '取消'
      try {
        const result = await showMessageBox(win, {
          type: 'question',
          buttons: [confirmLabel, cancelLabel],
          defaultId: 0,
          cancelId: 1,
          message:
            typeof options?.message === 'string' && options.message
              ? options.message.slice(0, 2000)
              : '确定执行该操作吗？',
          detail: typeof options?.detail === 'string' ? options.detail.slice(0, 4000) : undefined
        })
        return result.response === 0
      } catch {
        return false
      }
    }
  )

  ipcMain.handle(IPC.dialogUnsaved, async (event: IpcMainInvokeEvent, title: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const safeTitle = typeof title === 'string' && title ? title.slice(0, 256) : '未命名'
    try {
      const result = await showMessageBox(win, {
        type: 'warning',
        buttons: ['保存', '不保存', '取消'],
        defaultId: 0,
        cancelId: 2,
        message: `保存对“${safeTitle}”的修改吗？`,
        detail: '如果不保存，修改可能在关闭后丢失。'
      })
      if (result.response === 0) return 'save'
      if (result.response === 1) return 'discard'
      return 'cancel'
    } catch {
      return 'cancel'
    }
  })

  ipcMain.handle(IPC.fileRead, async (_event, filePath: string) => {
    let abs: string | null = null
    try {
      abs = assertSafePath(filePath)
      if (!isSupportedDocPath(abs)) throw new Error('E_UNSUPPORTED')
      const stat = await fs.stat(abs).catch(() => null)
      if (!stat?.isFile()) throw new Error('E_NOT_FOUND')
      if (stat.size > MAX_FILE_SIZE) throw new Error('E_OVERSIZE')
      const buffer = await fs.readFile(abs)
      if (buffer.length > MAX_FILE_SIZE) throw new Error('E_OVERSIZE')
      const decoded = decodeBuffer(buffer)
      const content = stripBom(decoded.content)
      return ok<DocPayload>({
        path: abs,
        displayName: path.basename(abs),
        content,
        encoding: decoded.encoding,
        eol: detectEol(content),
        finalNewline: hasFinalNewline(content),
        size: stat.size,
        mtimeMs: stat.mtimeMs
      })
    } catch (error) {
      if (abs && !fileExists(abs)) {
        try {
          ctx.recent.removeFile(abs)
          ctx.refreshMenu()
        } catch {}
      }
      return fail(error)
    }
  })

  ipcMain.handle(IPC.fileSave, async (_event, input: unknown) => {
    try {
      const request = normalizeSaveRequest(input)
      if (!request.path) throw new Error('E_NEED_SAVE')
      return ok(await writeDocument(ctx, request, request.path))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle(IPC.fileSaveAs, async (event: IpcMainInvokeEvent, input: unknown) => {
    try {
      const request = normalizeSaveRequest(input)
      const win = BrowserWindow.fromWebContents(event.sender)
      const settings = ctx.settings.read()
      const rawExt =
        typeof settings.files.defaultExtension === 'string'
          ? settings.files.defaultExtension.replace(/^\./, '').toLowerCase()
          : 'md'
      const ext = SUPPORTED_EXTENSIONS.includes(`.${rawExt}`) ? rawExt : 'md'
      const baseName = request.path
        ? path.basename(request.path, path.extname(request.path))
        : '未命名'
      const defaultDir = request.path
        ? path.dirname(request.path)
        : ctx.session.read().lastFolder || app.getPath('documents')
      const result = await showSaveDialog(win, {
        title: '另存为',
        defaultPath: path.join(defaultDir, `${baseName}.${ext}`),
        filters: [
          { name: 'Markdown', extensions: [ext, 'md', 'markdown'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      })
      if (result.canceled || !result.filePath) return ok<DocPayload | null>(null)
      let target = result.filePath
      const targetExt = path.extname(target)
      if (!targetExt || targetExt === '.') target += `.${ext}`
      return ok(
        await writeDocument(ctx, { ...request, path: target, expectedMtimeMs: undefined }, target)
      )
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle(IPC.fileReadDir, async (_event, dirPath: string, showHidden: boolean = false) => {
    try {
      const abs = assertSafePath(dirPath)
      if (!directoryExists(abs)) throw new Error('E_NOT_FOUND')
      const entries = await fs.readdir(abs, { withFileTypes: true })
      const nodes: FileNode[] = []
      for (const entry of entries) {
        if (IGNORED_NAMES.has(entry.name)) continue
        if (showHidden !== true && entry.name.startsWith('.')) continue
        if (!entry.isDirectory() && !entry.isFile()) continue
        if (entry.isFile() && !isSupportedDocPath(entry.name) && !isImageFile(entry.name)) continue
        nodes.push({
          name: entry.name,
          path: path.join(abs, entry.name),
          isDirectory: entry.isDirectory(),
          mtimeMs: 0
        })
      }
      nodes.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      })
      return ok(nodes)
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle(IPC.fileReveal, async (_event, filePath: string) => {
    try {
      const abs = assertSafePath(filePath)
      shell.showItemInFolder(abs)
    } catch {}
  })

  ipcMain.handle(IPC.fileCheckExists, async (_event, filePath: string) => {
    let abs: string | null = null
    try {
      abs = assertSafePath(filePath)
      const stat = await fs.stat(abs)
      if (stat.isFile()) return true
    } catch {}
    if (abs) {
      try {
        ctx.recent.removeFile(abs)
        ctx.refreshMenu()
      } catch {}
    }
    return false
  })

  ipcMain.handle(IPC.fileImportImage, async (_event, input: unknown) => {
    try {
      if (!input || typeof input !== 'object') throw new Error('E_INVALID_REQUEST')
      const request = input as Partial<ImportImageRequest>
      if (typeof request.docPath !== 'string' || !request.docPath) throw new Error('E_NEED_SAVE')
      const ext =
        typeof request.ext === 'string' && request.ext
          ? request.ext.toLowerCase().replace(/^\./, '')
          : 'png'
      if (!IMAGE_EXTENSIONS.includes(`.${ext}`)) throw new Error('E_UNSUPPORTED')
      if (!(request.data instanceof Uint8Array)) throw new Error('E_INVALID_REQUEST')
      if (request.data.byteLength > MAX_IMAGE_SIZE) throw new Error('E_CONTENT_TOO_LARGE')
      const docPath = assertSafePath(request.docPath)
      if (!isSupportedDocPath(docPath)) throw new Error('E_UNSUPPORTED')
      const docDir = path.dirname(docPath)
      const settings = ctx.settings.read()
      let targetDir = docDir
      if (settings.files.imageFolder === 'assets') targetDir = path.join(docDir, 'assets')
      else if (
        settings.files.imageFolder === 'custom' &&
        typeof settings.files.imageCustomFolder === 'string' &&
        settings.files.imageCustomFolder
      ) {
        targetDir = path.isAbsolute(settings.files.imageCustomFolder)
          ? assertSafePath(settings.files.imageCustomFolder)
          : path.join(docDir, settings.files.imageCustomFolder)
      }
      await fs.mkdir(targetDir, { recursive: true })
      const fileName =
        typeof request.fileName === 'string' && request.fileName ? request.fileName : 'image'
      const base = `${sanitizeFileName(fileName)}-${timestamp()}`
      const extension = `.${ext}`
      const buffer = Buffer.from(request.data)
      let name = `${base}${extension}`
      let absPath = path.join(targetDir, name)
      for (let index = 1; ; index++) {
        try {
          await fs.writeFile(absPath, buffer, { flag: 'wx' })
          break
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || index >= 1000) throw error
          name = `${base}-${index}${extension}`
          absPath = path.join(targetDir, name)
        }
      }
      const markdownPath = encodeMarkdownUrl(relativePath(docDir, absPath))
      return ok<ImportImageResult>({ absPath, markdownPath })
    } catch (error) {
      return fail(error)
    }
  })
}

async function writeDocument(ctx: AppContext, request: SaveRequest, target: string): Promise<DocPayload> {
  const abs = assertSafePath(target)
  if (!isSupportedDocPath(abs)) throw new Error('E_UNSUPPORTED')
  const stat = await fs.stat(abs).catch(() => null)
  if (stat && !stat.isFile()) throw new Error('E_NOT_FOUND')
  if (
    request.expectedMtimeMs !== undefined &&
    stat &&
    Math.abs(stat.mtimeMs - request.expectedMtimeMs) > 2
  ) {
    throw new Error('E_CONFLICT')
  }

  const encoding: Encoding = request.encoding ?? 'utf8'
  const eol: Eol = request.eol ?? detectEol(request.content)
  const finalNewline = request.finalNewline ?? hasFinalNewline(request.content)
  const normalized = applyFinalNewline(normalizeEol(request.content, eol), finalNewline, eol)
  const buffer = encodeContent(normalized, encoding)
  atomicWriteFile(abs, buffer)
  const updated = await fs.stat(abs).catch(() => null)
  try {
    ctx.recent.addFile(abs)
    ctx.saveSession({ lastFile: abs })
    ctx.drafts.discardByPath(abs)
    ctx.setRecentToMenu()
  } catch {}
  return {
    path: abs,
    displayName: path.basename(abs),
    content: request.content,
    encoding,
    eol,
    finalNewline,
    size: updated?.size ?? buffer.byteLength,
    mtimeMs: updated?.mtimeMs ?? Date.now()
  }
}

function timestamp(date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}
