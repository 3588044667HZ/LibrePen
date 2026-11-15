import fs from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import path from 'node:path'
import { isSupportedDocPath } from '../lib/paths'

const IGNORED_DIRS = new Set(['.git', 'node_modules', '.obsidian', 'dist', 'out', 'build', 'release'])
const DEFAULT_LIMIT = 5000
const MAX_LIMIT = 5000
const MAX_ROOT_LENGTH = 32_767

export interface IndexedDocument {
  path: string
  name: string
  relative: string
}

export async function listDocuments(root: string, limit = DEFAULT_LIMIT): Promise<IndexedDocument[]> {
  if (
    typeof root !== 'string' ||
    root.length === 0 ||
    root.length > MAX_ROOT_LENGTH ||
    root.includes('\0')
  ) {
    throw new Error('E_INVALID_ROOT')
  }
  const resolved = path.resolve(root)
  const stat = await fs.stat(resolved).catch(() => null)
  if (!stat?.isDirectory()) throw new Error('E_NOT_DIRECTORY')
  const cap =
    typeof limit === 'number' && Number.isFinite(limit)
      ? Math.max(0, Math.min(MAX_LIMIT, Math.floor(limit)))
      : DEFAULT_LIMIT
  if (cap === 0) return []

  const documents: IndexedDocument[] = []
  const pending: string[] = [resolved]

  while (pending.length > 0 && documents.length < cap) {
    const dir = pending.pop()
    if (!dir) break
    let entries: Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    for (const entry of entries) {
      if (documents.length >= cap) break
      if (entry.isSymbolicLink()) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) pending.push(full)
        continue
      }
      if (!entry.isFile() || !isSupportedDocPath(entry.name)) continue
      const relative = path.relative(resolved, full).split(path.sep).join('/')
      if (relative.length === 0 || relative === '..' || relative.startsWith('../')) continue
      documents.push({ path: full, name: entry.name, relative })
    }
  }

  documents.sort((a, b) => {
    const byName = a.relative.localeCompare(b.relative, undefined, {
      numeric: true,
      sensitivity: 'base'
    })
    if (byName !== 0) return byName
    return a.relative < b.relative ? -1 : a.relative > b.relative ? 1 : 0
  })
  return documents
}
