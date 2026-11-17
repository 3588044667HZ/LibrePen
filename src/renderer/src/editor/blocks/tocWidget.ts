import { EditorView, WidgetType } from '@codemirror/view'
import { extractOutline } from '@shared/markdown'
import '../../styles/editor-extras.css'
import { applyIconButton } from './iconButton'
import type { BlockDescriptor, BlockWidgetFactory } from './types'

class TocWidget extends WidgetType {
  constructor(private readonly descriptor: BlockDescriptor) {
    super()
  }

  eq(): boolean {
    return false
  }

  toDOM(view: EditorView): HTMLElement {
    const root = document.createElement('nav')
    root.className = 'cm-block cm-toc-block'
    root.setAttribute('aria-label', '文档目录')
    root.tabIndex = 0
    root.addEventListener('click', (event) => {
      if (event.target === root) root.focus()
    })
    root.appendChild(this.buildToolbar(view))

    const outline = extractOutline(view.state.doc.toString())
    if (outline.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'cm-toc-empty'
      empty.textContent = '文档中暂无标题'
      root.appendChild(empty)
      return root
    }

    const list = document.createElement('ul')
    list.className = 'cm-toc-list'
    for (const item of outline) {
      const entry = document.createElement('li')
      entry.className = 'cm-toc-item'
      const link = document.createElement('button')
      link.type = 'button'
      link.className = 'cm-toc-link'
      link.textContent = item.text
      link.style.paddingLeft = `${8 + Math.max(0, item.level - 1) * 14}px`
      link.addEventListener('click', () => {
        const lineNumber = Math.min(Math.max(1, item.line + 1), view.state.doc.lines)
        const pos = view.state.doc.line(lineNumber).from
        view.dispatch({
          selection: { anchor: pos },
          effects: EditorView.scrollIntoView(pos, { y: 'center' })
        })
        view.focus()
      })
      entry.appendChild(link)
      list.appendChild(entry)
    }
    root.appendChild(list)
    return root
  }

  ignoreEvent(): boolean {
    return true
  }

  private buildToolbar(view: EditorView): HTMLElement {
    const toolbar = document.createElement('div')
    toolbar.className = 'cm-block-toolbar'
    const title = document.createElement('span')
    title.className = 'cm-block-title'
    title.textContent = '目录'
    const removeButton = document.createElement('button')
    removeButton.type = 'button'
    removeButton.className = 'cm-block-action'
    applyIconButton(removeButton, 'bi-trash', '删除目录')
    removeButton.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      const doc = view.state.doc
      let from = this.descriptor.from
      const to =
        this.descriptor.to < doc.length && doc.sliceString(this.descriptor.to, this.descriptor.to + 1) === '\n'
          ? this.descriptor.to + 1
          : this.descriptor.to
      if (from > 0 && doc.sliceString(from - 1, from) === '\n') from--
      view.dispatch({ changes: { from, to, insert: '' }, selection: { anchor: from } })
      view.focus()
    })
    toolbar.append(title, removeButton)
    return toolbar
  }
}

export const createTocWidget: BlockWidgetFactory = (descriptor) => new TocWidget(descriptor)
