import fs from 'node:fs/promises'
import path from 'node:path'
import type { SearchHit, SearchRequest, SearchResponse } from '@shared/types'
import { decodeBuffer } from '../lib/encoding'
import { isSupportedDocPath } from '../lib/paths'

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  '.svn',
  '.hg',
  '.obsidian',
  '.vscode',
  '.idea',
  'dist',
  'out',
  'build',
  'release'
])

const MAX_FILES = 20000
const MAX_FILE_SIZE = 2_000_000
const MAX_HITS = 5000
const MAX_HITS_PER_FILE = 50
const MAX_LINE_MATCHES = 20
const MAX_QUERY_LENGTH = 2000
const MAX_DURATION_MS = 10_000

export class SearchService {
  private readonly canceled = new Set<number>()

  cancel(requestId: number): void {
    this.canceled.add(requestId)
    if (this.canceled.size > 256) {
      const oldest = this.canceled.values().next().value
      if (typeof oldest === 'number') this.canceled.delete(oldest)
    }
  }

  async content(request: SearchRequest, requestId: number): Promise<SearchResponse> {
    if (this.canceled.delete(requestId)) {
      return { hits: [], truncated: true, scannedFiles: 0 }
    }
    const root = path.resolve(request.root)
    const stat = await fs.stat(root).catch(() => null)
    if (!stat?.isDirectory()) throw new Error('E_SEARCH_ROOT')
    if (!request.query) return { hits: [], truncated: false, scannedFiles: 0 }
    if (request.query.length > MAX_QUERY_LENGTH) throw new Error('E_QUERY_TOO_LONG')

    const matcher = buildMatcher(request)
    const hits: SearchHit[] = []
    let scannedFiles = 0
    let truncated = false
    const dirs: string[] = [root]
    const deadline = Date.now() + MAX_DURATION_MS
    const maxHits =
      typeof request.maxResults === 'number' && Number.isFinite(request.maxResults)
        ? Math.max(1, Math.min(MAX_HITS, Math.floor(request.maxResults)))
        : MAX_HITS

    while (dirs.length > 0 && scannedFiles < MAX_FILES && Date.now() < deadline) {
      if (this.canceled.has(requestId)) {
        truncated = true
        break
      }
      const dir = dirs.pop()!
      let entries
      try {
        entries = await fs.readdir(dir, { withFileTypes: true })
      } catch {
        continue
      }
      entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      for (const entry of entries) {
        if (this.canceled.has(requestId) || Date.now() >= deadline) {
          truncated = true
          break
        }
        if (entry.isSymbolicLink()) continue
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith('.')) dirs.push(full)
          continue
        }
        if (!entry.isFile() || !isSupportedDocPath(full)) continue
        let info
        try {
          info = await fs.stat(full)
        } catch {
          continue
        }
        if (info.size > MAX_FILE_SIZE) continue
        scannedFiles++
        let buffer: Buffer
        try {
          buffer = await fs.readFile(full)
        } catch {
          continue
        }
        if (buffer.length > MAX_FILE_SIZE) continue
        if (buffer.includes(0)) continue
        let content: string
        try {
          content = decodeBuffer(buffer).content
        } catch {
          continue
        }
        const fileHits = searchContent(content, matcher, full).slice(0, MAX_HITS_PER_FILE)
        for (const hit of fileHits) {
          hits.push(hit)
          if (hits.length >= maxHits) {
            truncated = true
            break
          }
        }
        if (hits.length >= maxHits) break
      }
      if (hits.length >= maxHits) break
    }

    if (scannedFiles >= MAX_FILES) truncated = true
    if (Date.now() >= deadline) truncated = true
    this.canceled.delete(requestId)
    return { hits, truncated, scannedFiles }
  }
}

interface Matcher {
  regex: RegExp
  query: string
  caseSensitive: boolean
}

function buildMatcher(request: SearchRequest): Matcher {
  const raw = request.regex ? request.query : escapeRegExp(request.query)
  const body = request.wholeWord ? `\\b(?:${raw})\\b` : raw
  const flags = request.caseSensitive ? 'g' : 'gi'
  try {
    return { regex: new RegExp(body, flags), query: request.query, caseSensitive: request.caseSensitive }
  } catch {
    throw new Error('E_REGEX')
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function searchContent(content: string, matcher: Matcher, filePath: string): SearchHit[] {
  const hits: SearchHit[] = []
  const lines = content.split(/\r\n|\r|\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.length > 20_000) continue
    const ranges: Array<[number, number]> = []
    const regex = new RegExp(matcher.regex.source, matcher.regex.flags)
    let match: RegExpExecArray | null
    while ((match = regex.exec(line)) !== null) {
      if (match[0].length === 0) {
        regex.lastIndex++
        continue
      }
      ranges.push([match.index, match.index + match[0].length])
      if (ranges.length >= MAX_LINE_MATCHES) break
    }
    if (ranges.length === 0) continue
    const { preview, offset } = makePreview(line, ranges[0][0])
    hits.push({
      path: filePath,
      file: path.basename(filePath),
      line: i + 1,
      column: ranges[0][0] + 1,
      preview,
      ranges: ranges.map(([a, b]) => [Math.max(0, a - offset), Math.max(0, b - offset)])
    })
  }
  return hits
}

function makePreview(line: string, firstMatch: number): { preview: string; offset: number } {
  const max = 240
  if (line.length <= max) return { preview: line, offset: 0 }
  const start = Math.max(0, Math.min(firstMatch - 60, line.length - max))
  return { preview: `…${line.slice(start, start + max)}`, offset: start - 1 }
}
