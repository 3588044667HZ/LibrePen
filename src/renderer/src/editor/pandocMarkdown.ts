import { extractOutline } from '@shared/markdown'

const ATX_RE = /^\s{0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/
const MATH_BLOCK_RE = /^\s*\$\$\s*$/
const TOC_RE = /^\s{0,3}\[toc\]\s*$/i

export interface PandocMarkdownOptions {
  includeToc?: boolean
  renderMermaid?: (code: string) => Promise<string | null>
}

export async function preparePandocMarkdown(
  markdown: string,
  options: PandocMarkdownOptions = {}
): Promise<string> {
  let result = markdown
  if (options.renderMermaid) result = await replaceMermaidFences(result, options.renderMermaid)
  return prepareToc(result, options.includeToc === true)
}

async function replaceMermaidFences(
  markdown: string,
  render: (code: string) => Promise<string | null>
): Promise<string> {
  const lines = markdown.split(/\r\n|\r|\n/)
  const out: string[] = []
  let i = 0

  if (lines[0]?.trim() === '---') {
    out.push(lines[0])
    i = 1
    let closed = false
    while (i < lines.length) {
      const line = lines[i]
      out.push(line)
      i++
      if (line.trim() === '---' || line.trim() === '...') {
        closed = true
        break
      }
    }
    if (!closed) return out.join('\n')
  }

  while (i < lines.length) {
    const line = lines[i]
    const match = /^(\s{0,3})(`{3,}|~{3,})[ \t]*([^\s`~]*)/.exec(line)
    if (!match) {
      out.push(line)
      i++
      continue
    }

    const indent = match[1]
    const marker = match[2]
    const language = match[3].toLowerCase()
    const closeRe = new RegExp('^\\s{0,3}' + marker[0] + '{' + marker.length + ',}\\s*$')
    const content: string[] = []
    let j = i + 1
    while (j < lines.length && !closeRe.test(lines[j])) {
      content.push(lines[j])
      j++
    }
    if (j >= lines.length) {
      out.push(line)
      i++
      continue
    }

    if (language !== 'mermaid') {
      out.push(...lines.slice(i, j + 1))
      i = j + 1
      continue
    }

    const image = await render(content.join('\n'))
    if (image) {
      out.push(indent + '![](' + image + ')')
    } else {
      out.push(...lines.slice(i, j + 1))
    }
    i = j + 1
  }

  return out.join('\n')
}

function prepareToc(markdown: string, includeToc: boolean): string {
  const lines = markdown.split(/\r\n|\r|\n/)
  const markers = findTocMarkers(lines)
  if (!includeToc && markers.length === 0) return markdown

  const outline = extractOutline(markdown)
  if (outline.length === 0) {
    return markers.length > 0 ? removeTocMarkers(lines, markers) : markdown
  }

  const withIds = addHeadingIds(lines, outline)
  const toc = buildToc(outline)
  if (markers.length > 0) {
    return replaceTocMarkers(withIds, markers, toc)
  }
  return toc + '\n' + withIds.join('\n')
}

function findTocMarkers(lines: string[]): number[] {
  const markers: number[] = []
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
    if (MATH_BLOCK_RE.test(line)) {
      inMath = !inMath
      continue
    }
    if (inMath) continue
    if (TOC_RE.test(line)) markers.push(i)
  }
  return markers
}

function removeTocMarkers(lines: string[], markers: number[]): string {
  const marked = new Set(markers)
  return lines.filter((_line, index) => !marked.has(index)).join('\n')
}

function replaceTocMarkers(lines: string[], markers: number[], toc: string): string {
  const marked = new Set(markers)
  let inserted = false
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    if (!marked.has(i)) {
      out.push(lines[i])
      continue
    }
    if (!inserted) {
      out.push(toc)
      inserted = true
    }
  }
  return out.join('\n')
}

function addHeadingIds(lines: string[], outline: ReturnType<typeof extractOutline>): string[] {
  const out = [...lines]
  for (const item of outline) {
    const line = out[item.line]
    if (line === undefined) continue
    const id = 'librepen-heading-' + (item.line + 1)
    const atx = ATX_RE.exec(line)
    if (atx) {
      out[item.line] = atx[1] + ' ' + atx[2] + ' {#' + id + '}'
      continue
    }
    if (item.line + 1 < out.length) {
      out[item.line] = '#'.repeat(item.level) + ' ' + line.trim() + ' {#' + id + '}'
      out[item.line + 1] = ''
    }
  }
  return out
}

function buildToc(outline: ReturnType<typeof extractOutline>): string {
  const minLevel = Math.min(...outline.map((item) => item.level))
  const lines = ['## 目录', '']
  for (const item of outline) {
    const depth = Math.max(0, item.level - minLevel)
    const indent = '  '.repeat(depth)
    lines.push(indent + '- [' + escapeLinkText(item.text) + '](#librepen-heading-' + (item.line + 1) + ')')
  }
  lines.push('')
  return lines.join('\n')
}

function escapeLinkText(text: string): string {
  return text.replace(/([\\\[\]])/g, '\\$1')
}
