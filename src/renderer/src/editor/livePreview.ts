import { syntaxTree } from '@codemirror/language'
import type { EditorState, Range } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate
} from '@codemirror/view'
import katex from 'katex'
import { createBlockLayer, type BlockLayer } from './blocks/blockState'
import { createTableWidget } from './blocks/tableWidget'
import { createCodeWidget } from './blocks/codeWidget'
import { createMathWidget } from './blocks/mathWidget'
import { createMermaidWidget } from './blocks/mermaidWidget'
import { createTocWidget } from './blocks/tocWidget'
import { createFrontMatterWidget } from './blocks/frontMatterWidget'

export interface LivePreviewOptions {
  docPath: string | null
  inlineMath: boolean
  theme: 'light' | 'dark'
  resolveImage: (docPath: string | null, src: string) => string
}

interface Interval {
  from: number
  to: number
  kind: 'code' | 'html'
}

interface Built {
  decorations: DecorationSet
  atomic: DecorationSet
}

export function livePreview(options: LivePreviewOptions) {
  const layer = createBlockLayer(
    {
      docPath: options.docPath,
      theme: options.theme,
      resolveImage: options.resolveImage
    },
    {
      table: createTableWidget,
      code: createCodeWidget,
      math: createMathWidget,
      mermaid: createMermaidWidget,
      toc: createTocWidget,
      frontmatter: createFrontMatterWidget
    }
  )

  class LivePreviewPlugin {
    decorations: DecorationSet
    atomic: DecorationSet

    constructor(view: EditorView) {
      const built = buildDecorations(view, options, layer)
      this.decorations = built.decorations
      this.atomic = built.atomic
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.selectionSet || update.viewportChanged || update.focusChanged) {
        const built = buildDecorations(update.view, options, layer)
        this.decorations = built.decorations
        this.atomic = built.atomic
      }
    }
  }

  return [
    layer.extension,
    ViewPlugin.fromClass(LivePreviewPlugin, {
      decorations: (plugin) => plugin.decorations,
      provide: (plugin) =>
        EditorView.atomicRanges.of((view) => view.plugin(plugin)?.atomic ?? Decoration.none)
    })
  ]
}

function buildDecorations(view: EditorView, options: LivePreviewOptions, layer: BlockLayer): Built {
  const state = view.state
  const doc = state.doc
  const decorations: Range<Decoration>[] = []
  const atomics: Range<Decoration>[] = []
  const covered: Array<{ from: number; to: number }> = []
  const lineClasses = new Map<number, Set<string>>()
  const excluded: Interval[] = []
  const opaque: Array<{ from: number; to: number }> = []
  const viewport = view.viewport
  const tree = syntaxTree(state)
  const frontMatter = frontMatterRange(state)
  const renderedBlocks = layer.rendered(state)
  const inRenderedBlock = (pos: number): boolean =>
    renderedBlocks.some((block) => pos >= block.from && pos < block.to)
  const overlapsRenderedBlock = (from: number, to: number): boolean =>
    renderedBlocks.some((block) => from < block.to && to > block.from)

  const withinLine = (from: number, to: number): boolean => to <= doc.lineAt(from).to
  const inOpaque = (from: number, to: number): boolean =>
    opaque.some((range) => from < range.to && to > range.from)

  const addLineClass = (lineFrom: number, className: string): void => {
    let set = lineClasses.get(lineFrom)
    if (!set) {
      set = new Set()
      lineClasses.set(lineFrom, set)
    }
    set.add(className)
  }

  const addMark = (from: number, to: number, className: string): void => {
    if (from < to) decorations.push(Decoration.mark({ class: className }).range(from, to))
  }

  const addReplace = (from: number, to: number, widget: WidgetType): boolean => {
    if (from >= to) return false
    if (!withinLine(from, to)) return false
    if (covered.some((range) => from < range.to && to > range.from)) return false
    const decoration = Decoration.replace({ widget })
    decorations.push(decoration.range(from, to))
    atomics.push(decoration.range(from, to))
    covered.push({ from, to })
    return true
  }

  const addHidden = (from: number, to: number): void => {
    if (from >= to) return
    if (!withinLine(from, to)) return
    if (covered.some((range) => from < range.to && to > range.from)) return
    const decoration = Decoration.replace({})
    decorations.push(decoration.range(from, to))
    atomics.push(decoration.range(from, to))
    covered.push({ from, to })
  }

  const touches = (from: number, to: number): boolean =>
    state.selection.ranges.some((range) => range.from <= to && range.to >= from)

  const insideExcluded = (pos: number): Interval | null =>
    excluded.find((range) => pos >= range.from && pos < range.to) ?? null

  tree.iterate({
    from: viewport.from,
    to: viewport.to,
    enter: (node) => {
      const name = node.name
      if (name === 'Document') return true
      if (overlapsRenderedBlock(node.from, node.to)) return false
      if (frontMatter && node.from < frontMatter.to && node.to > frontMatter.from) return false
      if (name === 'URL' || name === 'Autolink' || name === 'LinkTitle') {
        opaque.push({ from: node.from, to: node.to })
        return false
      }
      if (name === 'FencedCode') {
        excluded.push({ from: node.from, to: node.to, kind: 'code' })
        const active = touches(node.from, node.to)
        let child = node.node.firstChild
        while (child) {
          if (child.name === 'CodeMark' || child.name === 'CodeInfo') {
            const line = doc.lineAt(child.from)
            addLineClass(line.from, 'cm-md-code-fence')
            if (!active) addHidden(child.from, child.to)
          }
          child = child.nextSibling
        }
        return false
      }
      if (name === 'CodeBlock') {
        excluded.push({ from: node.from, to: node.to, kind: 'code' })
        return false
      }
      if (name === 'HTMLBlock') {
        excluded.push({ from: node.from, to: node.to, kind: 'html' })
        return false
      }
      if (/^ATXHeading[1-6]$/.test(name)) {
        const level = Number(name.slice(-1))
        const line = doc.lineAt(node.from)
        addLineClass(line.from, `cm-md-h${level}`)
        const selection = state.selection.main
        const atLineStart = selection.empty && selection.head === line.from
        if (!touches(line.from, line.to) || atLineStart) {
          let child = node.node.firstChild
          while (child) {
            if (child.name === 'HeaderMark') {
              let end = child.to
              if (child.from === node.from && doc.sliceString(end, end + 1) === ' ') end++
              addHidden(child.from, end)
            }
            child = child.nextSibling
          }
        }
        return true
      }
      if (name === 'SetextHeading1' || name === 'SetextHeading2') {
        const line = doc.lineAt(node.from)
        addLineClass(line.from, name === 'SetextHeading1' ? 'cm-md-h1' : 'cm-md-h2')
        const mark = node.node.lastChild
        if (mark?.name === 'HeaderMark' && !touches(node.from, node.to)) {
          addHidden(mark.from, mark.to)
        }
        return true
      }
      if (name === 'HorizontalRule') {
        if (!touches(node.from, node.to)) {
          addReplace(node.from, node.to, new HrWidget(node.from))
        }
        return false
      }
      if (name === 'Task') {
        const line = doc.lineAt(node.from)
        addLineClass(line.from, 'cm-md-task-line')
        let child = node.node.firstChild
        while (child && child.name !== 'TaskMarker') child = child.nextSibling
        if (child && !touches(node.from, node.to)) {
          const listMark = node.node.parent?.firstChild
          if (listMark?.name === 'ListMark' && listMark.to <= node.from) {
            addHidden(listMark.from, node.from)
          }
          const checked = doc.sliceString(child.from, child.to).toLowerCase().includes('x')
          addReplace(child.from, child.to, new TaskWidget(child.from, child.to, checked))
        }
        return true
      }
      if (name === 'Image') {
        opaque.push({ from: node.from, to: node.to })
        if (!touches(node.from, node.to)) {
          const raw = doc.sliceString(node.from, node.to)
          const parsed = parseImage(raw)
          if (parsed) {
            const url = options.resolveImage(options.docPath, parsed.src)
            addReplace(node.from, node.to, new ImageWidget(url, parsed.alt, node.from, parsed.src))
          }
        }
        return false
      }
      if (name === 'Link') {
        const raw = doc.sliceString(node.from, node.to)
        const parsed = parseLink(raw)
        if (parsed) {
          const textFrom = node.from + 1
          const textTo = textFrom + parsed.text.length
          if (textTo > textFrom && textTo <= node.to) {
            addMark(textFrom, textTo, 'cm-md-link')
            if (!touches(node.from, node.to) && withinLine(textTo, node.to)) {
              addHidden(node.from, node.from + 1)
              addHidden(textTo, node.to)
            }
          }
        }
        return true
      }
      if (
        name === 'StrongEmphasis' ||
        name === 'Emphasis' ||
        name === 'Strikethrough' ||
        name === 'InlineCode'
      ) {
        const first = node.node.firstChild
        const last = node.node.lastChild
        if (
          first &&
          last &&
          first.name === last.name &&
          (first.name === 'EmphasisMark' ||
            first.name === 'StrikethroughMark' ||
            first.name === 'CodeMark')
        ) {
          const className =
            name === 'StrongEmphasis'
              ? 'cm-md-strong'
              : name === 'Emphasis'
                ? 'cm-md-em'
                : name === 'Strikethrough'
                  ? 'cm-md-strike'
                  : 'cm-md-inline-code'
          if (name === 'InlineCode') opaque.push({ from: node.from, to: node.to })
          addMark(first.to, last.from, className)
          if (!touches(node.from, node.to)) {
            addHidden(first.from, first.to)
            addHidden(last.from, last.to)
          }
        }
        return true
      }
      return true
    }
  })

  const frontMatterRendered = renderedBlocks.some((block) => block.kind === 'frontmatter')
  if (frontMatter && !frontMatterRendered) {
    const startLine = doc.lineAt(frontMatter.from).number
    const endLine = doc.lineAt(frontMatter.to).number
    for (let n = startLine; n <= endLine; n++) addLineClass(doc.line(n).from, 'cm-md-frontmatter')
  }

  const startLine = doc.lineAt(viewport.from).number
  const endLine = doc.lineAt(viewport.to).number
  let inMathBlock = false
  for (let n = startLine; n <= endLine; n++) {
    const line = doc.line(n)
    const text = line.text
    if (!text) continue
    if (inRenderedBlock(line.from)) continue
    if (frontMatter && line.from >= frontMatter.from && line.from < frontMatter.to) continue

    const blocked = insideExcluded(line.from)
    if (blocked) {
      addLineClass(line.from, blocked.kind === 'html' ? 'cm-md-html' : 'cm-md-code-line')
      continue
    }

    if (/^\s*\$\$\s*$/.test(text)) {
      addLineClass(line.from, 'cm-md-math-fence')
      inMathBlock = !inMathBlock
      continue
    }
    if (inMathBlock) continue

    const quote = /^(\s{0,3}(?:>\s?)+)/.exec(text)
    if (quote) {
      addLineClass(line.from, 'cm-md-quote-line')
      if (!touches(line.from, line.to)) addHidden(line.from, line.from + quote[1].length)
    }
    if (/^\s{0,3}(?:[-*+]|\d+[.)])\s+/.test(text)) addLineClass(line.from, 'cm-md-list-line')
    const bulletBase = line.from + (quote ? quote[1].length : 0)
    const bulletText = quote ? text.slice(quote[1].length) : text
    const bullet = /^(\s*)([-*+])(\s+)(?!\[[ xX]\])/.exec(bulletText)
    if (bullet) {
      const from = bulletBase + bullet[1].length
      const to = from + 1 + bullet[3].length
      addReplace(from, to, new ListBulletWidget(from, Math.floor(bullet[1].length / 2)))
    }
    if (/^\s*\|/.test(text)) addLineClass(line.from, 'cm-md-table-line')

    if (options.inlineMath) {
      const mathRegex = /(?<![\\$])\$([^$\n]+?)(?<!\\)\$(?!\$)/g
      let match: RegExpExecArray | null
      while ((match = mathRegex.exec(text)) !== null) {
        const from = line.from + match.index
        const to = from + match[0].length
        if (inOpaque(from, to)) continue
        if (!touches(from, to)) {
          addReplace(from, to, new MathInlineWidget(match[1], from))
        }
      }
    }

    const markRegex = /(?<!=)==([^=\n]+?)==(?!=)/g
    let markMatch: RegExpExecArray | null
    while ((markMatch = markRegex.exec(text)) !== null) {
      const from = line.from + markMatch.index
      const contentFrom = from + 2
      const contentTo = contentFrom + markMatch[1].length
      const to = contentTo + 2
      if (inOpaque(from, contentFrom) || inOpaque(contentTo, to)) continue
      addMark(contentFrom, contentTo, 'cm-md-highlight')
      if (!touches(from, to)) {
        addHidden(from, contentFrom)
        addHidden(contentTo, to)
      }
    }
  }

  const lineDecorations: Range<Decoration>[] = []
  for (const [lineFrom, classes] of lineClasses) {
    lineDecorations.push(Decoration.line({ class: [...classes].join(' ') }).range(lineFrom))
  }

  return {
    decorations: Decoration.set(sortRanges([...decorations, ...lineDecorations]), true),
    atomic: Decoration.set(sortRanges(atomics), true)
  }
}

function sortRanges(ranges: Range<Decoration>[]): Range<Decoration>[] {
  return ranges.sort((a, b) => a.from - b.from || a.to - b.to || a.value.startSide - b.value.startSide)
}

function frontMatterRange(state: EditorState): { from: number; to: number } | null {
  const length = Math.min(state.doc.length, 20000)
  const text = state.doc.sliceString(0, length)
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text)
  if (!match) return null
  return { from: 0, to: match[0].length }
}

function parseImage(raw: string): { alt: string; src: string } | null {
  const match = /^!\[([^\]]*)\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+["'][^"']*["'])?\s*\)$/.exec(raw)
  if (!match) return null
  return { alt: match[1], src: match[2].replace(/^<|>$/g, '') }
}

function parseLink(raw: string): { text: string; url: string } | null {
  const match = /^\[([^\]]*)\]\(\s*(<[^>]*>|[^)\s]*)(?:\s+["'][^"']*["'])?\s*\)$/.exec(raw)
  if (!match) return null
  return { text: match[1], url: match[2].replace(/^<|>$/g, '') }
}

function selectOnMouseDown(element: HTMLElement, view: EditorView, pos: number): void {
  element.addEventListener('mousedown', (event) => {
    event.preventDefault()
    view.dispatch({ selection: { anchor: pos } })
    view.focus()
  })
}

class ImageWidget extends WidgetType {
  constructor(
    private readonly url: string,
    private readonly alt: string,
    private readonly pos: number,
    private readonly rawSrc: string
  ) {
    super()
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof ImageWidget &&
      other.url === this.url &&
      other.alt === this.alt &&
      other.pos === this.pos &&
      other.rawSrc === this.rawSrc
    )
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('span')
    wrapper.className = 'cm-md-image'
    const image = document.createElement('img')
    image.alt = this.alt
    image.src = this.url
    image.loading = 'lazy'
    image.draggable = false
    image.addEventListener('error', () => {
      wrapper.classList.add('cm-md-image-error')
      wrapper.textContent = `图片加载失败：${this.alt || this.rawSrc}`
    })
    wrapper.appendChild(image)
    selectOnMouseDown(wrapper, view, this.pos)
    return wrapper
  }

  ignoreEvent(): boolean {
    return true
  }

  get estimatedHeight(): number {
    return 200
  }
}

class MathInlineWidget extends WidgetType {
  constructor(
    private readonly tex: string,
    private readonly pos: number
  ) {
    super()
  }

  eq(other: WidgetType): boolean {
    return other instanceof MathInlineWidget && other.tex === this.tex && other.pos === this.pos
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('span')
    wrapper.className = 'cm-md-math'
    try {
      wrapper.innerHTML = katex.renderToString(this.tex, {
        displayMode: false,
        throwOnError: false,
        output: 'html'
      })
    } catch {
      wrapper.classList.add('cm-md-math-error')
      wrapper.textContent = `$${this.tex}$`
    }
    selectOnMouseDown(wrapper, view, this.pos)
    return wrapper
  }

  ignoreEvent(): boolean {
    return true
  }
}

class ListBulletWidget extends WidgetType {
  constructor(
    private readonly pos: number,
    private readonly depth: number
  ) {
    super()
  }

  eq(other: WidgetType): boolean {
    return other instanceof ListBulletWidget && other.pos === this.pos && other.depth === this.depth
  }

  toDOM(view: EditorView): HTMLElement {
    const bullet = document.createElement('span')
    bullet.className = 'cm-md-list-bullet'
    bullet.textContent = this.depth <= 0 ? '•' : this.depth === 1 ? '◦' : '▪'
    selectOnMouseDown(bullet, view, this.pos)
    return bullet
  }

  ignoreEvent(): boolean {
    return true
  }
}

class TaskWidget extends WidgetType {
  constructor(
    private readonly from: number,
    private readonly to: number,
    private readonly checked: boolean
  ) {
    super()
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof TaskWidget &&
      other.from === this.from &&
      other.to === this.to &&
      other.checked === this.checked
    )
  }

  toDOM(view: EditorView): HTMLElement {
    const label = document.createElement('label')
    label.className = 'cm-md-task'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = this.checked
    input.addEventListener('change', () => {
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: input.checked ? '[x]' : '[ ]' }
      })
    })
    label.appendChild(input)
    label.addEventListener('mousedown', (event) => event.stopPropagation())
    return label
  }

  ignoreEvent(): boolean {
    return true
  }
}

class HrWidget extends WidgetType {
  constructor(private readonly pos: number) {
    super()
  }

  eq(other: WidgetType): boolean {
    return other instanceof HrWidget && other.pos === this.pos
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('span')
    wrapper.className = 'cm-md-hr'
    wrapper.appendChild(document.createElement('hr'))
    selectOnMouseDown(wrapper, view, this.pos)
    return wrapper
  }

  ignoreEvent(): boolean {
    return true
  }

  get estimatedHeight(): number {
    return 28
  }
}
