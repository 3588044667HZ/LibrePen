import fs from 'node:fs'
import path from 'node:path'
import type { DraftEntry, DraftSaveRequest } from '@shared/types'
import { JsonStore } from '../lib/store'
import { atomicWriteFile } from '../lib/atomic-write'

const MAX_DRAFT_SIZE = 10_000_000
const ENCODINGS = new Set(['utf8', 'utf8-bom', 'utf16le', 'utf16be', 'gbk', 'big5', 'shift_jis', 'latin1'])

interface DraftIndex {
  entries: DraftEntry[]
}

export class DraftService {
  private readonly dir: string
  private readonly index: JsonStore<DraftIndex>

  constructor(userData: string) {
    this.dir = path.join(userData, 'draftsRecover')
    fs.mkdirSync(this.dir, { recursive: true })
    this.index = new JsonStore<DraftIndex>(path.join(this.dir, 'index.json'), { entries: [] }, (value) => {
      const input = value as Partial<DraftIndex> | null
      return { entries: Array.isArray(input?.entries) ? input!.entries.filter(isDraftEntry) : [] }
    })
  }

  save(request: DraftSaveRequest): void {
    if (!request || typeof request !== 'object' || typeof request.id !== 'string') {
      throw new Error('E_INVALID_DRAFT')
    }
    if (typeof request.content !== 'string' || request.content.length > MAX_DRAFT_SIZE) {
      throw new Error('E_INVALID_DRAFT')
    }
    if (
      request.originalPath !== undefined &&
      request.originalPath !== null &&
      typeof request.originalPath !== 'string'
    ) {
      throw new Error('E_INVALID_DRAFT')
    }
    if (typeof request.originalPath === 'string' && request.originalPath.length > 32_767) {
      throw new Error('E_INVALID_DRAFT')
    }
    if (request.displayName !== undefined && typeof request.displayName !== 'string') {
      throw new Error('E_INVALID_DRAFT')
    }
    if (typeof request.encoding !== 'string' || !ENCODINGS.has(request.encoding)) {
      throw new Error('E_INVALID_DRAFT')
    }
    if (request.eol !== 'lf' && request.eol !== 'crlf') throw new Error('E_INVALID_DRAFT')
    if (typeof request.finalNewline !== 'boolean') throw new Error('E_INVALID_DRAFT')
    const id = safeId(request.id)
    atomicWriteFile(path.join(this.dir, `${id}.md`), request.content)
    const entry: DraftEntry = {
      id,
      originalPath: request.originalPath ?? null,
      displayName: request.displayName?.slice(0, 256) || '未命名',
      savedAt: Date.now(),
      encoding: request.encoding,
      eol: request.eol,
      finalNewline: request.finalNewline,
      preview: request.content.replace(/\s+/g, ' ').slice(0, 120)
    }
    const dropped: DraftEntry[] = []
    this.index.update((current) => {
      const all = [entry, ...current.entries.filter((item) => item.id !== id)]
      dropped.push(...all.slice(100))
      return { entries: all.slice(0, 100) }
    })
    for (const item of dropped) {
      try {
        const safe = safeId(item.id)
        fs.rmSync(path.join(this.dir, `${safe}.md`), { force: true })
      } catch {}
    }
  }

  list(): DraftEntry[] {
    return [...this.index.read().entries].sort((a, b) => b.savedAt - a.savedAt)
  }

  read(id: string): { content: string; entry: DraftEntry } | null {
    const safe = safeId(id)
    const entry = this.index.read().entries.find((item) => item.id === safe)
    const file = path.join(this.dir, `${safe}.md`)
    if (!fs.existsSync(file)) return null
    const content = fs.readFileSync(file, 'utf8')
    return {
      content,
      entry:
        entry ??
        ({
          id: safe,
          originalPath: null,
          displayName: safe,
          savedAt: fs.statSync(file).mtimeMs,
          encoding: 'utf8',
          eol: 'lf',
          finalNewline: true,
          preview: content.slice(0, 120)
        } satisfies DraftEntry)
    }
  }

  discard(id: string): void {
    const safe = safeId(id)
    fs.rmSync(path.join(this.dir, `${safe}.md`), { force: true })
    this.index.update((current) => ({ entries: current.entries.filter((item) => item.id !== safe) }))
  }

  discardByPath(filePath: string): void {
    const pending = this.index
      .read()
      .entries.filter((item) => item.originalPath && samePath(item.originalPath, filePath))
    for (const entry of pending) {
      try {
        this.discard(entry.id)
      } catch {}
    }
  }

  prune(beforeMs: number): void {
    const expired = this.index.read().entries.filter((entry) => entry.savedAt < beforeMs)
    if (expired.length === 0) return
    for (const entry of expired) {
      try {
        const id = safeId(entry.id)
        fs.rmSync(path.join(this.dir, `${id}.md`), { force: true })
      } catch {}
    }
    this.index.update((current) => ({
      entries: current.entries.filter((entry) => entry.savedAt >= beforeMs)
    }))
  }
}

function safeId(id: string): string {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) {
    throw new Error('E_INVALID_DRAFT_ID')
  }
  return id
}

function samePath(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const left = path.resolve(a)
  const right = path.resolve(b)
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right
}

function isDraftEntry(value: unknown): value is DraftEntry {
  const entry = value as DraftEntry
  return Boolean(
    entry &&
      typeof entry.id === 'string' &&
      /^[a-zA-Z0-9_-]{1,80}$/.test(entry.id) &&
      typeof entry.displayName === 'string' &&
      typeof entry.savedAt === 'number' &&
      Number.isFinite(entry.savedAt) &&
      (entry.originalPath === null || typeof entry.originalPath === 'string') &&
      typeof entry.encoding === 'string' &&
      ENCODINGS.has(entry.encoding) &&
      (entry.eol === 'lf' || entry.eol === 'crlf') &&
      typeof entry.finalNewline === 'boolean' &&
      typeof entry.preview === 'string'
  )
}
