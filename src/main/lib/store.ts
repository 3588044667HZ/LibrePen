import fs from 'node:fs'
import path from 'node:path'
import { atomicWriteFile } from './atomic-write'

function serialize(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n'
}

export class JsonStore<T> {
  private cache: T | null = null

  constructor(
    private readonly filePath: string,
    private readonly defaults: T,
    private readonly normalize?: (value: unknown) => T
  ) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
  }

  read(): T {
    if (this.cache) return this.cache
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8')
      const parsed: unknown = JSON.parse(raw)
      this.cache = this.normalize ? this.normalize(parsed) : (parsed as T)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        try {
          fs.copyFileSync(this.filePath, `${this.filePath}.corrupt-${Date.now()}`)
        } catch {
          /* ignore backup failure */
        }
      }
      this.cache = structuredClone(this.defaults)
    }
    return this.cache
  }

  write(value: T): T {
    atomicWriteFile(this.filePath, serialize(value))
    this.cache = value
    return value
  }

  update(fn: (value: T) => T | void): T {
    const current = this.read()
    const next = fn(structuredClone(current))
    return this.write((next ?? current) as T)
  }
}
