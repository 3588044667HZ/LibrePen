import { StateEffect, StateField, type EditorState, type Extension, type Range } from '@codemirror/state'
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view'
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import type {
  BlockDescriptor,
  BlockKind,
  BlockRenderContext,
  BlockWidgetFactory
} from './types'

export interface BlockLayer {
  extension: Extension
  descriptors: (state: EditorState) => BlockDescriptor[]
  rendered: (state: EditorState) => BlockDescriptor[]
}

interface LayerValue {
  descriptors: BlockDescriptor[]
  rendered: BlockDescriptor[]
  decorations: DecorationSet
}

interface EditRange {
  from: number
  to: number
}

const cache = new WeakMap<EditorState, BlockDescriptor[]>()

export const setBlockEdit = StateEffect.define<EditRange | null>()

export const blockEditField = StateField.define<EditRange | null>({
  create: () => null,
  update(value, transaction) {
    let next = value
    const effect = transaction.effects.find((item) => item.is(setBlockEdit))
    if (effect) next = effect.value
    if (!next) return null
    const from = transaction.changes.mapPos(next.from, -1)
    const to = transaction.changes.mapPos(next.to, 1)
    if (from >= to) return null
    const selection = transaction.state.selection
    const inside = selection.ranges.some((range) => range.from <= to && range.to >= from)
    return inside ? { from, to } : null
  }
})

export function createBlockLayer(
  context: BlockRenderContext,
  factories: Record<BlockKind, BlockWidgetFactory>
): BlockLayer {
  const field = StateField.define<LayerValue>({
    create(state) {
      return buildLayer(state, null, context, factories)
    },
    update(value, transaction) {
      const editing = transaction.state.field(blockEditField, false) ?? null
      const previous = transaction.startState.field(blockEditField, false) ?? null
      const startTree = syntaxTree(transaction.startState)
      const incomplete = startTree.length < transaction.startState.doc.length
      if (transaction.docChanged || editing !== previous || (incomplete && transaction.selection)) {
        return buildLayer(transaction.state, editing, context, factories)
      }
      return value
    }
  })

  return {
    extension: [blockEditField, field, EditorView.decorations.from(field, (value) => value.decorations)],
    descriptors: (state) => state.field(field, false)?.descriptors ?? getBlockDescriptors(state),
    rendered: (state) => state.field(field, false)?.rendered ?? []
  }
}

export function getBlockDescriptors(state: EditorState): BlockDescriptor[] {
  const cached = cache.get(state)
  if (cached) return cached
  const blocks = collectBlocks(state)
  cache.set(state, blocks)
  return blocks
}

export function findBlockAt(state: EditorState, pos: number): BlockDescriptor | null {
  return getBlockDescriptors(state).find((block) => pos >= block.from && pos <= block.to) ?? null
}

export function editBlock(
  view: EditorView,
  descriptor: BlockDescriptor,
  anchor = descriptor.from
): void {
  const pos = Math.min(descriptor.to, Math.max(descriptor.from, anchor))
  view.dispatch({
    effects: setBlockEdit.of({ from: descriptor.from, to: descriptor.to }),
    selection: { anchor: pos },
    scrollIntoView: true
  })
  view.focus()
}

function buildLayer(
  state: EditorState,
  editing: EditRange | null,
  context: BlockRenderContext,
  factories: Record<BlockKind, BlockWidgetFactory>
): LayerValue {
  const descriptors = getBlockDescriptors(state)
  const rendered: BlockDescriptor[] = []
  const decorations: Range<Decoration>[] = []
  for (const descriptor of descriptors) {
    if (editing && descriptor.from < editing.to && descriptor.to > editing.from) continue
    rendered.push(descriptor)
    const widget = factories[descriptor.kind](descriptor, context)
    decorations.push(
      Decoration.replace({ widget, block: true }).range(descriptor.from, descriptor.to)
    )
  }
  return {
    descriptors,
    rendered,
    decorations: Decoration.set(decorations, true)
  }
}

function collectBlocks(state: EditorState): BlockDescriptor[] {
  const doc = state.doc
  const blocks: BlockDescriptor[] = []
  const excluded: Array<{ from: number; to: number }> = []

  const frontMatter = detectFrontMatter(state)
  if (frontMatter) {
    blocks.push({
      kind: 'frontmatter',
      from: frontMatter.from,
      to: frontMatter.to,
      content: doc.sliceString(frontMatter.from, frontMatter.to)
    })
    excluded.push(frontMatter)
  }

  const tree = ensureSyntaxTree(state, state.doc.length, 500) ?? syntaxTree(state)
  tree.iterate({
    enter: (node) => {
      if (node.name === 'Document') return true
      if (frontMatter && node.from < frontMatter.to && node.to > frontMatter.from) return false
      if (node.name === 'FencedCode') {
        const parentName = node.node.parent?.name
        if (parentName && parentName !== 'Document') return false
        const from = doc.lineAt(node.from).from
        const to = doc.lineAt(node.to).to
        if (excluded.some((range) => from < range.to && to > range.from)) return false
        const info = codeInfo(state, node.node)
        const kind: BlockKind =
          info.split(/\s+/)[0] === 'mermaid'
            ? 'mermaid'
            : info.split(/\s+/)[0] === 'math'
              ? 'math'
              : 'code'
        blocks.push({ kind, from, to, content: doc.sliceString(from, to), info })
        excluded.push({ from, to })
        return false
      }
      if (node.name === 'HTMLBlock') {
        const parentName = node.node.parent?.name
        if (parentName && parentName !== 'Document') return false
        const from = doc.lineAt(node.from).from
        const to = doc.lineAt(node.to).to
        if (excluded.some((range) => from < range.to && to > range.from)) return false
        blocks.push({ kind: 'html', from, to, content: doc.sliceString(from, to) })
        excluded.push({ from, to })
        return false
      }
      if (node.name === 'Table') {
        const parentName = node.node.parent?.name
        if (parentName && parentName !== 'Document') return false
        const from = doc.lineAt(node.from).from
        const to = doc.lineAt(node.to).to
        if (excluded.some((range) => from < range.to && to > range.from)) return false
        blocks.push({ kind: 'table', from, to, content: doc.sliceString(from, to) })
        excluded.push({ from, to })
        return false
      }
      return true
    }
  })

  let mathStart: number | null = null
  for (let lineNo = 1; lineNo <= doc.lines; lineNo++) {
    const line = doc.line(lineNo)
    if (excluded.some((range) => line.from >= range.from && line.from < range.to)) {
      mathStart = null
      continue
    }
    const text = line.text
    if (/^\s{0,3}\$\$\s*$/.test(text)) {
      if (mathStart === null) {
        mathStart = lineNo
      } else {
        const from = doc.line(mathStart).from
        const to = line.to
        blocks.push({
          kind: 'math',
          from,
          to,
          content: doc.sliceString(from, to)
        })
        excluded.push({ from, to })
        mathStart = null
      }
      continue
    }
    if (mathStart !== null) continue
    if (/^\s{0,3}\[toc\]\s*$/i.test(text)) {
      blocks.push({ kind: 'toc', from: line.from, to: line.to, content: text })
      excluded.push({ from: line.from, to: line.to })
    }
  }

  blocks.sort((a, b) => a.from - b.from || a.to - b.to)
  return blocks
}

function detectFrontMatter(state: EditorState): { from: number; to: number } | null {
  const text = state.doc.sliceString(0, Math.min(state.doc.length, 20000))
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text)
  if (!match) return null
  const raw = match[0]
  const trimmed = raw.endsWith('\r\n')
    ? raw.length - 2
    : raw.endsWith('\n')
      ? raw.length - 1
      : raw.length
  return { from: 0, to: trimmed }
}

function codeInfo(state: EditorState, node: {
  firstChild: { name: string; from: number; to: number; nextSibling: unknown } | null
}): string {
  let child = node.firstChild as
    | { name: string; from: number; to: number; nextSibling: { name: string; from: number; to: number; nextSibling: unknown } | null }
    | null
  while (child) {
    if (child.name === 'CodeInfo') return state.doc.sliceString(child.from, child.to).trim()
    child = child.nextSibling as typeof child
  }
  return ''
}
