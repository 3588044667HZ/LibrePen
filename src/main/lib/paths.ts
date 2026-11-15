import fs from 'node:fs'
import path from 'node:path'

const RESERVED_NAMES = /^(con|prn|aux|nul|clock\$|conin\$|conout\$|com[1-9]|lpt[1-9])(\..*)?$/i

function isReservedName(segment: string): boolean {
  const trimmed = segment.replace(/[ .]+$/, '')
  if (RESERVED_NAMES.test(trimmed)) return true
  const base = trimmed.split('.')[0].replace(/[ .]+$/, '')
  return RESERVED_NAMES.test(base)
}

export const SUPPORTED_EXTENSIONS = [
  '.md',
  '.markdown',
  '.mmd',
  '.mkd',
  '.mdwn',
  '.mdown',
  '.mdx',
  '.mdtxt',
  '.mdtext',
  '.apib',
  '.rmarkdown',
  '.rmd',
  '.qmd',
  '.txt',
  '.text'
]

export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.avif']

export function isSupportedDocPath(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.includes(path.extname(filePath).toLowerCase())
}

export function isImagePath(filePath: string): boolean {
  return IMAGE_EXTENSIONS.includes(path.extname(filePath).toLowerCase())
}

export function decodeImageUrlPath(pathname: string): string {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname.replace(/^\//, ''))
  } catch {
    return ''
  }
  if (decoded.length > 65_536) return decoded
  if (path.isAbsolute(decoded) || /^[a-zA-Z]:[\\/]/.test(decoded)) return decoded
  if (/^[a-zA-Z0-9_-]+={0,2}$/.test(decoded)) {
    try {
      const fromBase64 = Buffer.from(decoded, 'base64url').toString('utf8')
      if (path.isAbsolute(fromBase64) || /^[a-zA-Z]:[\\/]/.test(fromBase64)) return fromBase64
    } catch {}
  }
  return decoded
}

export function resolveSafeImagePath(input: unknown): string | null {
  if (typeof input !== 'string' || input.length === 0 || input.length > 32_767) return null
  if (input.includes('\0')) return null
  if (input.startsWith('\\\\?\\') || input.startsWith('\\\\.\\')) return null
  if (/^[\\/]{2}/.test(input)) return null
  if (process.platform === 'win32' && !/^[a-zA-Z]:[\\/]/.test(input)) return null
  if (!path.isAbsolute(input)) return null
  if (process.platform === 'win32' && input.replace(/^[a-zA-Z]:/, '').includes(':')) return null
  const segments = input.split(/[\\/]+/)
  if (
    segments.some(
      (segment) => segment === '..' || (process.platform === 'win32' && /^\.\.[ .]*$/.test(segment))
    )
  ) {
    return null
  }
  if (
    process.platform === 'win32' &&
    segments.some((segment) => isReservedName(segment))
  ) {
    return null
  }
  if (!isImagePath(input)) return null
  return path.resolve(input)
}

export function assertSafePath(input: unknown): string {
  if (typeof input !== 'string' || input.length === 0 || input.length > 32_767) {
    throw new Error('E_INVALID_PATH')
  }
  const normalized = input.replace(/\//g, '\\')
  if (
    input.includes('\0') ||
    normalized.startsWith('\\\\?\\') ||
    normalized.startsWith('\\\\.\\')
  ) {
    throw new Error('E_INVALID_PATH')
  }
  if (
    process.platform === 'win32' &&
    (input.replace(/^[a-zA-Z]:/, '').includes(':') ||
      input
        .split(/[\\/]+/)
        .some((segment) => isReservedName(segment)))
  ) {
    throw new Error('E_INVALID_PATH')
  }
  return path.resolve(input)
}

export function mimeForImage(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.svg':
      return 'image/svg+xml'
    case '.bmp':
      return 'image/bmp'
    case '.avif':
      return 'image/avif'
    default:
      return 'application/octet-stream'
  }
}

export function fileExists(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

export function directoryExists(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory()
  } catch {
    return false
  }
}

export function pathInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}
