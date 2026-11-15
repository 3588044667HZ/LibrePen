import path from 'node:path'
import type { RecentEntry, RecentStore } from '@shared/types'
import { JsonStore } from '../lib/store'

const EMPTY: RecentStore = { files: [], folders: [] }

export class RecentService {
  private readonly store: JsonStore<RecentStore>

  constructor(filePath: string, private readonly limit: () => number) {
    this.store = new JsonStore<RecentStore>(filePath, EMPTY, (value) => {
      const input = value as Partial<RecentStore> | null
      return {
        files: Array.isArray(input?.files) ? input!.files.filter(isEntry) : [],
        folders: Array.isArray(input?.folders) ? input!.folders.filter(isEntry) : []
      }
    })
  }

  list(): RecentStore {
    const value = this.store.read()
    return { files: this.cap(value.files), folders: this.cap(value.folders) }
  }

  addFile(filePath: string): RecentStore {
    return this.add('files', filePath)
  }

  addFolder(folderPath: string): RecentStore {
    return this.add('folders', folderPath)
  }

  removeFile(filePath: string): RecentStore {
    const current = this.store.read()
    const updated: RecentStore = {
      ...current,
      files: current.files.filter((item) => !samePath(item.path, filePath))
    }
    this.store.write(updated)
    return this.list()
  }

  clear(): RecentStore {
    this.store.write({ files: [], folders: [] })
    return this.list()
  }

  private add(kind: 'files' | 'folders', target: string): RecentStore {
    if (typeof target !== 'string' || target.length === 0 || target.length > 32_767) {
      throw new Error('E_INVALID_PATH')
    }
    const current = this.store.read()
    const previous = current[kind].find((item) => samePath(item.path, target))
    const entry: RecentEntry = {
      path: target,
      name: kind === 'files' ? path.basename(target) : path.basename(target) || target,
      openedAt: Date.now(),
      pinned: previous?.pinned
    }
    const next = this.cap([entry, ...current[kind].filter((item) => !samePath(item.path, target))])
    const updated: RecentStore = { ...current, [kind]: next }
    this.store.write(updated)
    return this.list()
  }

  private cap(entries: RecentEntry[]): RecentEntry[] {
    const limit = this.limit()
    const pinned = entries.filter((entry) => entry.pinned)
    const rest = entries.filter((entry) => !entry.pinned).slice(0, limit)
    return [...pinned, ...rest]
  }
}

function isEntry(value: unknown): value is RecentEntry {
  const entry = value as RecentEntry
  return Boolean(
    entry &&
      typeof entry.path === 'string' &&
      typeof entry.name === 'string' &&
      typeof entry.openedAt === 'number' &&
      Number.isFinite(entry.openedAt)
  )
}

function samePath(a: string, b: string): boolean {
  const left = path.resolve(a)
  const right = path.resolve(b)
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right
}
