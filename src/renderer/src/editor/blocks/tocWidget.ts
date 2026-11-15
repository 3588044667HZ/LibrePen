import { EditorView, WidgetType } from '@codemirror/view'
import { extractOutline } from '@shared/markdown'
import '../../styles/editor-extras.css'
import { editBlock } from './blockState'
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
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'cm-block-action'
    applyIconButton(button, 'bi-code-slash', '编辑源码')
    button.addEventListener('click', () => editBlock(view, this.descriptor))
    toolbar.append(title, button)
    return toolbar
  }
}

export const createTocWidget: BlockWidgetFactory = (descriptor) => new TocWidget(descriptor)
