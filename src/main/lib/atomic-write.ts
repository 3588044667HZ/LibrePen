import fs from 'node:fs'
import path from 'node:path'

export function atomicWriteFile(filePath: string, data: Buffer | string): void {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  const suffix = `${process.pid}.${Math.random().toString(36).slice(2, 8)}`
  const temp = path.join(dir, `.librepen-${suffix}.tmp`)
  const backup = path.join(dir, `.librepen-${suffix}.bak`)
  let mode: number | undefined
  try {
    mode = fs.statSync(filePath).mode & 0o777
  } catch {
    mode = undefined
  }
  try {
    if (mode === undefined) fs.writeFileSync(temp, data)
    else fs.writeFileSync(temp, data, { mode })
    try {
      const fd = fs.openSync(temp, 'r+')
      try {
        fs.fsyncSync(fd)
      } finally {
        fs.closeSync(fd)
      }
    } catch {}
    try {
      fs.renameSync(temp, filePath)
    } catch {
      let backedUp = false
      try {
        if (fs.lstatSync(filePath).isFile()) {
          fs.renameSync(filePath, backup)
          backedUp = true
        }
      } catch {}
      try {
        fs.renameSync(temp, filePath)
      } catch (renameError) {
        if (backedUp) {
          try {
            fs.renameSync(backup, filePath)
          } catch {}
        }
        throw renameError
      }
      if (backedUp) {
        try {
          fs.rmSync(backup, { force: true })
        } catch {}
      }
    }
  } catch (error) {
    try {
      fs.rmSync(temp, { force: true })
    } catch {}
    throw error
  }
}
