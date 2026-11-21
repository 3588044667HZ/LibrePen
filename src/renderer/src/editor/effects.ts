import type { Extension, Range } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate
} from '@codemirror/view'
import '../styles/editor-extras.css'

class FocusPlugin {
  decorations: DecorationSet

  constructor(view: EditorView) {
    this.decorations = buildFocusDecorations(view)
  }

  update(update: ViewUpdate): void {
    if (update.docChanged || update.selectionSet || update.viewportChanged) {
      this.decorations = buildFocusDecorations(update.view)
    }
  }
}

class TypewriterPlugin {
  private frame = 0
  private pending = false
  private destroyed = false

  constructor(private readonly view: EditorView) {}

  update(update: ViewUpdate): void {
    if (this.destroyed) return
    if (!update.docChanged) {
      if (this.pending) {
        cancelAnimationFrame(this.frame)
        this.pending = false
      }
      return
    }
    if (this.pending) {
      cancelAnimationFrame(this.frame)
      this.pending = false
    }
    this.pending = true
    const head = update.state.selection.main.head
    this.frame = requestAnimationFrame(() => {
      this.pending = false
      if (this.destroyed) return
      const view = this.view
      if (!view.dom.isConnected) return
      const current = view.state.selection.main.head
      if (current !== head) return
      view.dispatch({ effects: EditorView.scrollIntoView(current, { y: 'center' }) })
    })
  }

  destroy(): void {
    this.destroyed = true
    if (this.pending) cancelAnimationFrame(this.frame)
    this.pending = false
  }
}

function buildFocusDecorations(view: EditorView): DecorationSet {
  const doc = view.state.doc
  const current = doc.lineAt(view.state.selection.main.head)
  let start = current.number
  let end = current.number
  if (current.text.trim().length > 0) {
    while (start > 1 && doc.line(start - 1).text.trim().length > 0) start--
    while (end < doc.lines && doc.line(end + 1).text.trim().length > 0) end++
  }

  const first = doc.lineAt(view.viewport.from).number
  const last = doc.lineAt(view.viewport.to).number
  const ranges: Range<Decoration>[] = []
  for (let number = first; number <= last; number++) {
    if (number >= start && number <= end) continue
    ranges.push(Decoration.line({ class: 'cm-focus-dim' }).range(doc.line(number).from))
  }
  return Decoration.set(ranges, true)
}

export function focusModeExtension(): Extension {
  return ViewPlugin.fromClass(FocusPlugin, {
    decorations: (plugin) => plugin.decorations
  })
}

export function typewriterModeExtension(): Extension {
  return ViewPlugin.fromClass(TypewriterPlugin)
}
