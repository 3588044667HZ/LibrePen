import DOMPurify from 'dompurify'
import { WidgetType, type EditorView } from '@codemirror/view'
import { editBlock } from './blockState'
import { applyIconButton } from './iconButton'
import type { BlockDescriptor, BlockWidgetFactory } from './types'
import '../../styles/editor-extras.css'

const FORBID_TAGS = [
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'link',
  'meta'
]

function sanitizeHtml(raw: string): string {
  return DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true, svg: true },
    ADD_ATTR: ['style', 'class', 'align', 'colspan', 'rowspan', 'target', 'rel'],
    FORBID_TAGS,
    FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover', 'onfocus']
  })
}

class HtmlBlockWidget extends WidgetType {
  constructor(private readonly descriptor: BlockDescriptor) {
    super()
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof HtmlBlockWidget &&
      other.descriptor.content === this.descriptor.content &&
      other.descriptor.from === this.descriptor.from &&
      other.descriptor.to === this.descriptor.to
    )
  }

  toDOM(view: EditorView): HTMLElement {
    const root = document.createElement('div')
    root.className = 'cm-block cm-html-block'

    const toolbar = document.createElement('div')
    toolbar.className = 'cm-block-toolbar'
    const title = document.createElement('span')
    title.className = 'cm-block-title'
    title.textContent = 'HTML'
    const editButton = document.createElement('button')
    editButton.type = 'button'
    editButton.className = 'cm-block-action cm-html-edit'
    applyIconButton(editButton, 'bi-code-slash', '编辑源码')
    editButton.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      editBlock(view, this.descriptor)
    })
    toolbar.append(title, editButton)

    const body = document.createElement('div')
    body.className = 'cm-html-body'
    const sanitized = sanitizeHtml(this.descriptor.content)
    body.innerHTML =
      sanitized || '<pre class="cm-html-empty">' + escapeHtml(this.descriptor.content) + '</pre>'
    body.addEventListener('click', () => editBlock(view, this.descriptor))
    root.append(toolbar, body)
    return root
  }

  ignoreEvent(): boolean {
    return true
  }

  get estimatedHeight(): number {
    return 120
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export const createHtmlWidget: BlockWidgetFactory = (descriptor) =>
  new HtmlBlockWidget(descriptor)
