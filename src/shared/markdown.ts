import type { Eol } from './types'

export interface OutlineItem {
  level: number
  text: string
  line: number
  id: string
}

export interface WordStats {
  words: number
  chars: number
  lines: number
  readingMinutes: number
}

const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/g
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/
const ATX_RE = /^\s{0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/
const SETEXT_RE = /^\s{0,3}(=+|-+)\s*$/
export type MathFenceKind = '$$' | '\\[' | '\\]'

export function mathFenceKind(text: string): MathFenceKind | null {
  const match = /^\s{0,3}(\$\$|\\\[|\\\])\s*$/.exec(text)
  return match ? (match[1] as MathFenceKind) : null
}

export function normalizeEol(text: string, eol: Eol): string {
  const lf = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  return eol === 'crlf' ? lf.replace(/\n/g, '\r\n') : lf
}

export function detectEol(text: string): Eol {
  const crlf = (text.match(/\r\n/g) ?? []).length
  const lf = (text.match(/\n/g) ?? []).length - crlf
  return crlf > 0 && crlf >= lf ? 'crlf' : 'lf'
}

export function hasFinalNewline(text: string): boolean {
  return /(?:\r\n|\r|\n)$/.test(text)
}

export function applyFinalNewline(text: string, enabled: boolean, eol: Eol = 'lf'): string {
  const stripped = text.replace(/(?:\r\n|\r|\n)+$/, '')
  return enabled ? stripped + (eol === 'crlf' ? '\r\n' : '\n') : stripped
}

export function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)(.+?)\1/g, '$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/==(.+?)==/g, '$1')
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/\\([\\`*_{}\[\]()#+\-.!>])/g, '$1')
    .trim()
}

function stripFencedCode(text: string): string {
  const lines = text.split(/\r\n|\r|\n/)
  const out: string[] = []
  let fence: string | null = null
  let inFrontMatter = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (i === 0 && line.trim() === '---') {
      inFrontMatter = true
      continue
    }
    if (inFrontMatter) {
      if (line.trim() === '---' || line.trim() === '...') inFrontMatter = false
      continue
    }
    const match = FENCE_RE.exec(line)
    if (match) {
      const marker = match[1][0]
      if (!fence) {
        fence = marker
        continue
      }
      if (fence === marker) {
        fence = null
        continue
      }
    }
    if (fence) continue
    out.push(line)
  }
  return out.join('\n')
}

export function slugify(text: string): string {
  const base = text
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
  return base || 'section'
}

export function extractOutline(markdown: string): OutlineItem[] {
  const lines = markdown.split(/\r\n|\r|\n/)
  const items: OutlineItem[] = []
  const used = new Map<string, number>()
  let fence: string | null = null
  let inMath = false
  let inFrontMatter = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (i === 0 && line.trim() === '---') {
      inFrontMatter = true
      continue
    }
    if (inFrontMatter) {
      if (line.trim() === '---' || line.trim() === '...') inFrontMatter = false
      continue
    }
    const fenceMatch = FENCE_RE.exec(line)
    if (fenceMatch) {
      const marker = fenceMatch[1][0]
      if (!fence) fence = marker
      else if (fence === marker) fence = null
      continue
    }
    if (fence) continue
    if (mathFenceKind(line)) {
      inMath = !inMath
      continue
    }
    if (inMath) continue

    const atx = ATX_RE.exec(line)
    if (atx) {
      const text = stripInlineMarkdown(atx[2])
      if (!text) continue
      const id = uniqueId(used, slugify(text))
      items.push({ level: atx[1].length, text, line: i, id })
      continue
    }

    if (line.trim() && i + 1 < lines.length) {
      const next = lines[i + 1]
      const setext = SETEXT_RE.exec(next)
      if (setext && line.trim() && !/^\s{0,3}[-*+]\s/.test(line)) {
        const text = stripInlineMarkdown(line)
        if (text) {
          const level = setext[1][0] === '=' ? 1 : 2
          const id = uniqueId(used, slugify(text))
          items.push({ level, text, line: i, id })
          i++
        }
      }
    }
  }
  return items
}

function uniqueId(used: Map<string, number>, base: string): string {
  const count = used.get(base) ?? 0
  used.set(base, count + 1)
  return count === 0 ? base : `${base}-${count}`
}

export function countWords(markdown: string): WordStats {
  const body = stripFencedCode(markdown)
  const cjkCount = (body.match(CJK_RE) ?? []).length
  const withoutCjk = body.replace(CJK_RE, ' ')
  const latinWords = withoutCjk.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu) ?? []
  const words = cjkCount + latinWords.length
  const chars = markdown.replace(/\s/g, '').length
  const lines = markdown.length === 0 ? 0 : markdown.split(/\r\n|\r|\n/).length
  const readingMinutes = words === 0 ? 0 : Math.max(1, Math.ceil(words / 200))
  return { words, chars, lines, readingMinutes }
}

export function normalizePath(p: string): string {
  const winDrive = /^([a-zA-Z]:)[\\/]/.exec(p)
  const absolutePosix = p.startsWith('/')
  const parts = p.replace(/\\/g, '/').split('/')
  if (winDrive) parts.shift()
  const out: string[] = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (out.length > 0) out.pop()
      continue
    }
    out.push(part)
  }
  const prefix = winDrive ? `${winDrive[1]}/` : absolutePosix ? '/' : ''
  return prefix + out.join('/')
}

export function isImageFile(p: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(p)
}

export function isRemoteImage(src: string): boolean {
  return /^(https?:)?\/\//i.test(src)
}

export function isDataImage(src: string): boolean {
  return /^data:image\//i.test(src)
}

export function mdimgUrl(absPath: string, mtimeMs?: number): string {
  const suffix = typeof mtimeMs === 'number' ? `?v=${Math.round(mtimeMs)}` : ''
  return `mdimg://local/${encodeURIComponent(absPath)}${suffix}`
}

export function resolveImageUrl(docPath: string | null, rawSrc: string): string {
  const src = rawSrc.trim().replace(/^</, '').replace(/>$/, '').replace(/&amp;/g, '&')
  if (!src) return ''
  if (isRemoteImage(src) || isDataImage(src) || src.startsWith('blob:')) return src

  let local = src
  if (/^file:\/\//i.test(local)) {
    try {
      local = decodeURIComponent(local.replace(/^file:\/\//i, ''))
      if (/^\/[a-zA-Z]:/.test(local)) local = local.slice(1)
    } catch {
      return ''
    }
  }
  local = local.replace(/\\/g, '/')
  if (/^[a-zA-Z]:\//.test(local) || local.startsWith('/')) {
    return mdimgUrl(normalizePath(local))
  }
  if (!docPath) return ''
  const dir = docPath.replace(/\\/g, '/').replace(/\/[^/]*$/, '')
  return mdimgUrl(normalizePath(`${dir}/${local}`))
}

export function relativePath(fromDir: string, toPath: string): string {
  const from = normalizePath(fromDir).replace(/\/$/, '').split('/')
  const to = normalizePath(toPath).split('/')
  const fromDrive = /^[a-zA-Z]:$/.test(from[0]) ? from[0].toLowerCase() : ''
  const toDrive = /^[a-zA-Z]:$/.test(to[0]) ? to[0].toLowerCase() : ''
  if (fromDrive !== toDrive) return normalizePath(toPath)
  let i = 0
  while (i < from.length && i < to.length && from[i].toLowerCase() === to[i].toLowerCase()) i++
  const up = from.length - i
  const rel = [...Array(up).fill('..'), ...to.slice(i)].join('/')
  return rel || to[to.length - 1]
}

export function encodeMarkdownUrl(p: string): string {
  return p.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29')
}

const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i

export function sanitizeFileName(name: string, fallback = 'image'): string {
  let base = name.replace(/\.[^.]*$/, '')
  base = base.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '').trim()
  if (!base || RESERVED_NAMES.test(base)) base = fallback
  return base.slice(0, 80)
}

export function applyHeadingLine(line: string, level: number): string {
  const stripped = line.replace(/^\s{0,3}#{1,6}[ \t]+/, '')
  return level === 0 ? stripped : `${'#'.repeat(level)} ${stripped}`
}

export interface InlineEdit {
  doc: string
  from: number
  to: number
}

export function wrapInline(
  doc: string,
  from: number,
  to: number,
  marker: string,
  placeholder = 'text'
): InlineEdit {
  const selected = doc.slice(from, to)
  const before = doc.slice(Math.max(0, from - marker.length), from)
  const after = doc.slice(to, to + marker.length)
  if (selected && before === marker && after === marker) {
    const start = from - marker.length
    const next = doc.slice(0, start) + selected + doc.slice(to + marker.length)
    return { doc: next, from: start, to: start + selected.length }
  }
  const content = selected || placeholder
  const next = doc.slice(0, from) + marker + content + marker + doc.slice(to)
  const start = from + marker.length
  return { doc: next, from: start, to: start + content.length }
}

export function insertLink(doc: string, from: number, to: number, url = 'url'): InlineEdit {
  const selected = doc.slice(from, to) || 'text'
  const inserted = `[${selected}](${url})`
  const next = doc.slice(0, from) + inserted + doc.slice(to)
  const urlStart = from + selected.length + 3
  return { doc: next, from: urlStart, to: urlStart + url.length }
}

export function lineRangeForSelection(
  doc: string,
  from: number,
  to: number
): { start: number; end: number } {
  const start = doc.lastIndexOf('\n', Math.max(0, from - 1)) + 1
  let end = doc.indexOf('\n', to)
  if (end === -1) end = doc.length
  return { start, end }
}

export type BlockPrefix = 'quote' | 'bullet' | 'ordered' | 'task' | `heading${number}`

export function toggleBlockPrefix(doc: string, from: number, to: number, prefix: BlockPrefix): InlineEdit {
  const { start, end } = lineRangeForSelection(doc, from, to)
  const block = doc.slice(start, end)
  const lines = block.split('\n')
  const patterns: Record<string, RegExp> = {
    quote: /^\s{0,3}>\s?/,
    bullet: /^(\s*)[-*+]\s+(?!\[[ xX]\])/,
    ordered: /^(\s*)\d+[.)]\s+/,
    task: /^(\s*)[-*+]\s+\[[ xX]\]\s+/
  }
  const key = prefix.startsWith('heading') ? 'heading' : prefix
  const allMatch = lines
    .filter((l) => l.trim().length > 0)
    .every((l) => {
      if (key === 'heading') {
        const level = Number(prefix.slice(7))
        return level === 0
          ? !/^\s{0,3}#{1,6}\s/.test(l)
          : new RegExp(`^\\s{0,3}#{${level}}\\s`).test(l)
      }
      return patterns[key].test(l)
    })

  const nextLines = lines.map((line) => {
    if (!line.trim()) return line
    if (key === 'heading') {
      const level = Number(prefix.slice(7))
      return allMatch ? applyHeadingLine(line, 0) : applyHeadingLine(line, level)
    }
    if (allMatch) {
      if (key === 'ordered') return line.replace(/^(\s*)\d+[.)]\s+/, '$1')
      return line.replace(patterns[key], key === 'bullet' || key === 'task' ? '$1' : '')
    }
    if (key === 'quote') return `> ${line.replace(/^\s+/, '')}`
    if (key === 'bullet') return `${/^\s*/.exec(line)![0]}- ${line.replace(/^\s*/, '')}`
    if (key === 'task') return `${/^\s*/.exec(line)![0]}- [ ] ${line.replace(/^\s*/, '')}`
    const indent = /^\s*/.exec(line)![0]
    const body = line.replace(/^\s*/, '')
    return `${indent}1. ${body}`
  })

  const nextBlock = nextLines.join('\n')
  const nextDoc = doc.slice(0, start) + nextBlock + doc.slice(end)
  return { doc: nextDoc, from: start, to: start + nextBlock.length }
}

export function insertTableSnippet(
  doc: string,
  from: number,
  to: number
): InlineEdit & { cursorOffset: number } {
  const snippet = '| Column 1 | Column 2 |\n| --- | --- |\n| Text | Text |'
  const next = doc.slice(0, from) + snippet + doc.slice(to)
  const firstCell = snippet.indexOf('Column 1')
  return { doc: next, from: from + firstCell, to: from + firstCell + 8, cursorOffset: firstCell }
}

export function nextAvailableName(existing: Set<string>, base: string, ext: string): string {
  const extension = ext.startsWith('.') ? ext : `.${ext}`
  let candidate = `${base}${extension}`
  let i = 1
  while (existing.has(candidate.toLowerCase())) {
    candidate = `${base}-${i}${extension}`
    i++
  }
  return candidate
}

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}
