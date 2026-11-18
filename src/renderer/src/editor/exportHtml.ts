import MarkdownIt from 'markdown-it'
import type { StateBlock, StateInline, Token } from 'markdown-it'
import footnote from 'markdown-it-footnote'
import taskLists from 'markdown-it-task-lists'
import deflist from 'markdown-it-deflist'
import markPlugin from 'markdown-it-mark'
import sub from 'markdown-it-sub'
import sup from 'markdown-it-sup'
import anchor from 'markdown-it-anchor'
import hljs from 'highlight.js'
import katex from 'katex'
import mermaid from 'mermaid'
import DOMPurify from 'dompurify'
import { extractOutline, resolveImageUrl, slugify } from '@shared/markdown'
import type { Settings } from '@shared/types'
import lightCodeCss from 'highlight.js/styles/github.css?inline'
import darkCodeCss from 'highlight.js/styles/github-dark.css?inline'
import exportCss from '../styles/export.css?inline'
import { preparePandocMarkdown } from './pandocMarkdown'

export interface ExportRenderOptions {
  docPath: string | null
  title: string
  theme: 'light' | 'dark'
  settings: Settings
  includeToc?: boolean
}

const cache = new Map<string, MarkdownIt>()
const TOC_PLACEHOLDER = '<!--LIBREPEN_EXPORT_TOC-->'
let mermaidCounter = 0

function createRenderer(docPath: string | null): MarkdownIt {
  const key = docPath ?? ''
  const existing = cache.get(key)
  if (existing) return existing

  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: false,
    breaks: false
  })
  md.use(footnote)
  md.use(taskLists, { enabled: true, label: true })
  md.use(deflist)
  md.use(markPlugin)
  md.use(sub)
  md.use(sup)
  md.use(anchor, {
    slugify: (value: string) => slugify(value),
    permalink: false,
    uniqueSlugStartIndex: 1
  })

  md.inline.ruler.before('escape', 'math_inline', mathInlineRule)
  md.inline.ruler.before('escape', 'math_inline_backslash', mathInlineBackslashRule)
  md.block.ruler.before('fence', 'math_block', mathBlockRule, {
    alt: ['paragraph', 'reference', 'blockquote', 'list']
  })
  md.block.ruler.before('fence', 'math_block_backslash', mathBlockBackslashRule, {
    alt: ['paragraph', 'reference', 'blockquote', 'list']
  })

  md.renderer.rules.math_inline = (tokens: Token[], idx: number): string =>
    renderMath(tokens[idx].content, false)
  md.renderer.rules.math_block = (tokens: Token[], idx: number): string =>
    renderMath(tokens[idx].content, true)

  md.renderer.rules.fence = (
    tokens: Token[],
    idx: number,
    _options,
    env
  ): string => {
    const token = tokens[idx]
    const info = (token.info || '').trim().split(/\s+/)[0].toLowerCase()
    if (info === 'math') return renderMath(token.content, true)
    if (info === 'mermaid') {
      const envMap = (env as { mermaid?: Map<string, string> }).mermaid
      const id = 'export-mermaid-' + mermaidCounter++
      envMap?.set(id, token.content)
      return `<div data-mermaid-id="${id}"></div>`
    }
    let highlighted = md.utils.escapeHtml(token.content)
    if (info && hljs.getLanguage(info)) {
      highlighted = hljs.highlight(token.content, { language: info }).value
    }
    const languageClass = info ? ` class="language-${md.utils.escapeHtml(info)}"` : ''
    return `<pre class="hljs"><code${languageClass}>${highlighted}</code></pre>`
  }

  const defaultImage =
    md.renderer.rules.image ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
  md.renderer.rules.image = (tokens, idx, options, env, self): string => {
    const token = tokens[idx]
    const src = token.attrGet('src') || ''
    token.attrSet('src', resolveImageUrl(docPath, src))
    token.attrSet('loading', 'lazy')
    return defaultImage(tokens, idx, options, env, self)
  }

  const defaultLinkOpen =
    md.renderer.rules.link_open ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
  md.renderer.rules.link_open = (tokens, idx, options, env, self): string => {
    const href = tokens[idx].attrGet('href') || ''
    if (/^https?:/i.test(href)) {
      tokens[idx].attrSet('target', '_blank')
      tokens[idx].attrSet('rel', 'noopener noreferrer')
    }
    return defaultLinkOpen(tokens, idx, options, env, self)
  }

  cache.set(key, md)
  return md
}

export async function renderExportHtml(
  markdown: string,
  options: ExportRenderOptions
): Promise<string> {
  const prepared = prepareTocMarker(markdown)
  const md = createRenderer(options.docPath)
  const env = { mermaid: new Map<string, string>() }
  const rawBody = md.render(prepared.markdown, env)
  const outline =
    prepared.hasMarker || options.includeToc ? extractOutline(prepared.markdown) : []
  const toc = outline.length
    ? `<nav class="export-toc"><h2>目录</h2><ul>${outline
        .map(
          (item) =>
            `<li class="toc-level-${item.level}"><a href="#${item.id}">${escapeHtml(item.text)}</a></li>`
        )
        .join('')}</ul></nav>`
    : ''
  const body = prepared.hasMarker
    ? rawBody.replace(TOC_PLACEHOLDER, toc)
    : options.includeToc
      ? toc + rawBody
      : rawBody
  const bodyWithMermaid = await replaceMermaidBlocks(body, env.mermaid, options.theme)
  const sanitized = DOMPurify.sanitize(bodyWithMermaid, {
    USE_PROFILES: { html: true, svg: true, mathMl: true },
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|file|mdimg|data|blob):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    ADD_ATTR: [
      'target',
      'rel',
      'id',
      'class',
      'style',
      'align',
      'colspan',
      'rowspan',
      'loading',
      'checked',
      'disabled',
      'type'
    ],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'button'],
    FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover', 'onfocus']
  })

  const theme = options.theme
  const codeCss = theme === 'dark' ? darkCodeCss : lightCodeCss
  const fontSize = options.settings.export.html.fontSize ?? options.settings.editor.fontSize
  return `<!doctype html>
<html lang="zh-CN" data-theme="${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(options.title)}</title>
<style>
${exportCss}
${codeCss}
html { font-size: ${Math.max(12, Math.min(24, fontSize))}px; }
</style>
</head>
<body>
<article class="markdown-body">
${sanitized}
</article>
</body>
</html>`
}

export async function renderPandocMarkdown(
  markdown: string,
  options: { theme: 'light' | 'dark'; includeToc?: boolean }
): Promise<string> {
  return preparePandocMarkdown(markdown, {
    includeToc: options.includeToc,
    renderMermaid: async (code) => {
      const svg = await renderMermaidSvg(code, options.theme)
      if (!svg) return null
      try {
        return await svgToPngDataUrl(svg, options.theme)
      } catch {
        return null
      }
    }
  })
}

function svgToPngDataUrl(svg: string, theme: 'light' | 'dark'): Promise<string> {
  return new Promise((resolve, reject) => {
    const size = svgSize(svg)
    const maxSide = 2048
    const scale = Math.min(2, maxSide / Math.max(size.width, size.height))
    const width = Math.max(1, Math.round(size.width * scale))
    const height = Math.max(1, Math.round(size.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) {
      reject(new Error('canvas unavailable'))
      return
    }
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => {
      try {
        context.fillStyle = theme === 'dark' ? '#1e1e1e' : '#ffffff'
        context.fillRect(0, 0, width, height)
        context.drawImage(image, 0, 0, width, height)
        resolve(canvas.toDataURL('image/png'))
      } catch (error) {
        reject(error)
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('svg image failed to load'))
    }
    image.src = url
  })
}

function svgSize(svg: string): { width: number; height: number } {
  const viewBox = /viewBox\s*=\s*["']([^"']+)["']/i.exec(svg)
  const parts = viewBox ? viewBox[1].trim().split(/[\s,]+/).map(Number) : []
  let width = parts[2]
  let height = parts[3]
  if (!Number.isFinite(width) || width <= 0) {
    const match = /\bwidth\s*=\s*["']([\d.]+)(?:px)?["']/i.exec(svg)
    width = match ? Number(match[1]) : 800
  }
  if (!Number.isFinite(height) || height <= 0) {
    const match = /\bheight\s*=\s*["']([\d.]+)(?:px)?["']/i.exec(svg)
    height = match ? Number(match[1]) : 600
  }
  return { width, height }
}

function prepareTocMarker(markdown: string): { markdown: string; hasMarker: boolean } {
  let hasMarker = false
  const next = markdown.replace(/^[ \t]*\[toc\][ \t]*$/gim, () => {
    if (hasMarker) return ''
    hasMarker = true
    return TOC_PLACEHOLDER
  })
  return { markdown: next, hasMarker }
}

async function replaceMermaidBlocks(
  html: string,
  blocks: Map<string, string>,
  theme: 'light' | 'dark'
): Promise<string> {
  let result = html
  for (const [id, code] of blocks) {
    const svg = await renderMermaidSvg(code, theme)
    const replacement = svg
      ? `<div class="export-mermaid">${svg}</div>`
      : `<pre class="mermaid-source">${escapeHtml(code)}</pre>`
    result = result.replace(`<div data-mermaid-id="${id}"></div>`, replacement)
  }
  return result
}

async function renderMermaidSvg(code: string, theme: 'light' | 'dark'): Promise<string> {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: theme === 'dark' ? 'dark' : 'default',
    fontFamily: 'inherit',
    htmlLabels: false,
    themeVariables: { fontSize: '16px' },
    sequence: { useMaxWidth: false }
  })
  try {
    const result = await mermaid.render('export-mermaid-' + mermaidCounter++, code)
    return result.svg
  } catch {
    return ''
  }
}

function renderMath(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex, {
      displayMode: display,
      throwOnError: false,
      output: 'mathml',
      strict: false
    })
  } catch {
    return `<code class="math-error">${escapeHtml(display ? `$$${tex}$$` : `$${tex}$`)}</code>`
  }
}

function mathInlineRule(state: StateInline, silent: boolean): boolean {
  const start = state.pos
  if (state.src.charCodeAt(start) !== 0x24) return false
  if (start + 1 >= state.posMax) return false
  if (state.src.charCodeAt(start + 1) === 0x24) return false
  if (start > 0 && state.src.charCodeAt(start - 1) === 0x5c) return false

  let pos = start + 1
  while (pos < state.posMax) {
    const code = state.src.charCodeAt(pos)
    if (code === 0x24 && state.src.charCodeAt(pos - 1) !== 0x5c) {
      if (state.src.charCodeAt(pos + 1) === 0x24) return false
      const content = state.src.slice(start + 1, pos)
      if (!content.trim()) return false
      if (!silent) {
        const token = state.push('math_inline', 'math', 0)
        token.content = content
        token.markup = '$'
      }
      state.pos = pos + 1
      return true
    }
    if (code === 0x0a) return false
    pos++
  }
  return false
}

function mathInlineBackslashRule(state: StateInline, silent: boolean): boolean {
  const start = state.pos
  if (start + 1 >= state.posMax) return false
  if (state.src.charCodeAt(start) !== 0x5c || state.src.charCodeAt(start + 1) !== 0x28) return false

  let pos = start + 2
  while (pos + 1 < state.posMax) {
    if (state.src.charCodeAt(pos) === 0x0a) return false
    if (state.src.charCodeAt(pos) === 0x5c && state.src.charCodeAt(pos + 1) === 0x29) {
      const content = state.src.slice(start + 2, pos)
      if (!content.trim()) return false
      if (!silent) {
        const token = state.push('math_inline', 'math', 0)
        token.content = content
        token.markup = '\\('
      }
      state.pos = pos + 2
      return true
    }
    pos++
  }
  return false
}

function mathBlockRule(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean
): boolean {
  const start = state.bMarks[startLine] + state.tShift[startLine]
  const max = state.eMarks[startLine]
  if (start + 2 > max) return false
  if (state.src.slice(start, start + 2) !== '$$') return false
  if (silent) return true

  const opening = state.src.slice(start + 2, max)
  const sameLine = opening.search(/\$\$/)
  if (sameLine >= 0) {
    if (!silent) {
      const token = state.push('math_block', 'math', 0)
      token.content = opening.slice(0, sameLine).trim()
      token.map = [startLine, startLine + 1]
      token.markup = '$$'
    }
    state.line = startLine + 1
    return true
  }

  const lines = [opening]
  let nextLine = startLine + 1
  let closed = false
  while (nextLine < endLine) {
    const lineStart = state.bMarks[nextLine] + state.tShift[nextLine]
    const lineEnd = state.eMarks[nextLine]
    const text = state.src.slice(lineStart, lineEnd)
    const closeIndex = text.search(/\$\$\s*$/)
    if (closeIndex >= 0) {
      const before = text.slice(0, closeIndex)
      if (before.trim()) lines.push(before)
      closed = true
      break
    }
    lines.push(text)
    nextLine++
  }
  if (!closed) return false
  state.line = nextLine + 1
  if (!silent) {
    const token = state.push('math_block', 'math', 0)
    token.content = lines.join('\n').trim()
    token.map = [startLine, nextLine + 1]
    token.markup = '$$'
  }
  return true
}

function mathBlockBackslashRule(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean
): boolean {
  const start = state.bMarks[startLine] + state.tShift[startLine]
  const max = state.eMarks[startLine]
  if (start + 2 > max) return false
  if (state.src.slice(start, start + 2) !== '\\[') return false
  if (silent) return true

  const opening = state.src.slice(start + 2, max)
  const sameLine = opening.search(/\\\]/)
  if (sameLine >= 0) {
    if (!silent) {
      const token = state.push('math_block', 'math', 0)
      token.content = opening.slice(0, sameLine).trim()
      token.map = [startLine, startLine + 1]
      token.markup = '\\['
    }
    state.line = startLine + 1
    return true
  }

  const lines = [opening]
  let nextLine = startLine + 1
  let closed = false
  while (nextLine < endLine) {
    const lineStart = state.bMarks[nextLine] + state.tShift[nextLine]
    const lineEnd = state.eMarks[nextLine]
    const text = state.src.slice(lineStart, lineEnd)
    const closeIndex = text.search(/\\\]\s*$/)
    if (closeIndex >= 0) {
      const before = text.slice(0, closeIndex)
      if (before.trim()) lines.push(before)
      closed = true
      break
    }
    lines.push(text)
    nextLine++
  }
  if (!closed) return false
  state.line = nextLine + 1
  if (!silent) {
    const token = state.push('math_block', 'math', 0)
    token.content = lines.join('\n').trim()
    token.map = [startLine, nextLine + 1]
    token.markup = '\\['
  }
  return true
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
