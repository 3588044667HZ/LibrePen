import { syntaxTree } from '@codemirror/language'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate
} from '@codemirror/view'
import type { EditorState, Extension, Range } from '@codemirror/state'
import { mathFenceKind } from '@shared/markdown'

export function sourceSyntax(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = buildSourceDecorations(view)
      }

      update(update: ViewUpdate): void {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildSourceDecorations(update.view)
        }
      }
    },
    { decorations: (plugin) => plugin.decorations }
  )
}

function buildSourceDecorations(view: EditorView): DecorationSet {
  const state = view.state
  const doc = state.doc
  const viewport = view.viewport
  const decorations: Range<Decoration>[] = []
  const lineClasses = new Map<number, Set<string>>()
  const codeLines = new Set<number>()

  const addLine = (lineFrom: number, className: string): void => {
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

  const tree = syntaxTree(state)
  tree.iterate({
    from: viewport.from,
    to: viewport.to,
    enter: (node) => {
      if (node.name === 'FencedCode') {
        const start = doc.lineAt(node.from).number
        const end = doc.lineAt(node.to).number
        for (let n = start; n <= end; n++) {
          const line = doc.line(n)
          codeLines.add(n)
          addLine(line.from, n === start || n === end ? 'cm-src-code-fence' : 'cm-src-code-line')
        }
        return false
      }
      return true
    }
  })

  const frontMatter = frontMatterLines(state)
  const startLine = doc.lineAt(viewport.from).number
  const endLine = doc.lineAt(viewport.to).number
  let inMath = false
  for (let n = startLine; n <= endLine; n++) {
    const line = doc.line(n)
    if (codeLines.has(n)) continue
    if (frontMatter.has(n)) addLine(line.from, 'cm-src-frontmatter')
    const text = line.text
    if (mathFenceKind(text)) {
      addLine(line.from, 'cm-src-math-line')
      inMath = !inMath
      continue
    }
    if (inMath) {
      addLine(line.from, 'cm-src-math-line')
      markMath(line.from, text, addMark)
      continue
    }
    if (/^\s{0,3}>/.test(text)) addLine(line.from, 'cm-src-quote-line')
    const mathRegexes = [
      /(?<![\\$])\$([^$\n]+?)(?<!\\)\$(?!\$)/g,
      /(?<!\\)\\\(([\s\S]*?)\\\)/g,
      /(?<!\\)\\\[([\s\S]*?)\\\]/g
    ]
    for (const mathRegex of mathRegexes) {
      mathRegex.lastIndex = 0
      let mathMatch: RegExpExecArray | null
      while ((mathMatch = mathRegex.exec(text)) !== null) {
        markMath(line.from + mathMatch.index, mathMatch[0], addMark)
      }
    }
    markHtml(line.from, text, addMark)
  }

  const lineDecorations: Range<Decoration>[] = []
  for (const [lineFrom, classes] of lineClasses) {
    lineDecorations.push(Decoration.line({ class: [...classes].join(' ') }).range(lineFrom))
  }
  decorations.push(...lineDecorations)
  decorations.sort((a, b) => a.from - b.from || a.to - b.to || a.value.startSide - b.value.startSide)
  return Decoration.set(decorations, true)
}

function markMath(
  lineFrom: number,
  text: string,
  addMark: (from: number, to: number, className: string) => void
): void {
  const regex = /\\[A-Za-z]+/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    addMark(lineFrom + match.index, lineFrom + match.index + match[0].length, 'cm-src-math-command')
  }
}

function markHtml(
  lineFrom: number,
  text: string,
  addMark: (from: number, to: number, className: string) => void
): void {
  const tagRegex = /<\/?\s*[A-Za-z][\w:-]*(?:\s+[^<>]*?)?>/g
  let tagMatch: RegExpExecArray | null
  while ((tagMatch = tagRegex.exec(text)) !== null) {
    const raw = tagMatch[0]
    if (/^<\s*(?:https?|mailto):/i.test(raw)) continue
    const from = lineFrom + tagMatch.index
    addMark(from, from + raw.length, 'cm-src-html-tag')
    const nameMatch = /^<\/?\s*([A-Za-z][\w:-]*)/.exec(raw)
    if (nameMatch) {
      const nameFrom = from + nameMatch[0].indexOf(nameMatch[1])
      addMark(nameFrom, nameFrom + nameMatch[1].length, 'cm-src-html-name')
    }
    const attrRegex = /([A-Za-z_:][-\w:.]*)\s*=\s*("[^"]*"|'[^']*')/g
    let attrMatch: RegExpExecArray | null
    while ((attrMatch = attrRegex.exec(raw)) !== null) {
      const attrFrom = from + attrMatch.index
      addMark(attrFrom, attrFrom + attrMatch[1].length, 'cm-src-html-attr')
      const valueFrom = attrFrom + attrMatch[0].indexOf(attrMatch[2])
      addMark(valueFrom, valueFrom + attrMatch[2].length, 'cm-src-html-value')
    }
  }
}

function frontMatterLines(state: EditorState): Set<number> {
  const length = Math.min(state.doc.length, 20000)
  const text = state.doc.sliceString(0, length)
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text)
  if (!match) return new Set()
  const from = state.doc.lineAt(0).number
  const to = state.doc.lineAt(match[0].length).number
  const lines = new Set<number>()
  for (let n = from; n <= to; n++) lines.add(n)
  return lines
}