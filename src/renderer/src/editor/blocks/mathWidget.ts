import { WidgetType, type EditorView } from '@codemirror/view'
import katex from 'katex'
import { mathFenceKind } from '@shared/markdown'
import { editBlock } from './blockState'
import { applyIconButton } from './iconButton'
import type { BlockDescriptor, BlockWidgetFactory } from './types'
import '../../styles/code-math.css'

interface MathParts {
  tex: string
  openingLength: number
}

function splitLine(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line
}

function trimBlank(lines: string[]): string[] {
  let start = 0
  let end = lines.length
  while (start < end && lines[start].trim() === '') start++
  while (end > start && lines[end - 1].trim() === '') end--
  return lines.slice(start, end)
}

function extractMath(content: string): MathParts {
  const lines = content.split('\n').map(splitLine)
  const first = lines[0] ?? ''
  const fence = /^ {0,3}(`{3,}|~{3,})/.exec(first)
  if (fence) {
    const body = lines.slice(1)
    const closing = new RegExp(`^ {0,3}${fence[1][0]}{${fence[1].length},}\\s*$`)
    if (body.length > 0 && closing.test(body[body.length - 1])) body.pop()
    return { tex: trimBlank(body).join('\n'), openingLength: first.length }
  }
  let body = lines
  const firstKind = mathFenceKind(first)
  if (firstKind === '$$' || firstKind === '\\[') {
    const closeKind = firstKind === '\\[' ? '\\]' : '$$'
    body = body.slice(1)
    if (body.length > 0 && mathFenceKind(body[body.length - 1]) === closeKind) body = body.slice(0, -1)
  }
  return { tex: trimBlank(body).join('\n'), openingLength: first.length }
}

class MathBlockWidget extends WidgetType {
  constructor(
    private readonly descriptor: BlockDescriptor,
    private readonly parts: MathParts
  ) {
    super()
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof MathBlockWidget &&
      other.descriptor.content === this.descriptor.content &&
      other.descriptor.from === this.descriptor.from &&
      other.descriptor.to === this.descriptor.to
    )
  }

  toDOM(view: EditorView): HTMLElement {
    const root = document.createElement('div')
    root.className = 'cm-block cm-math-block'

    const toolbar = document.createElement('div')
    toolbar.className = 'cm-block-toolbar'
    const toolbarEdit = document.createElement('button')
    toolbarEdit.type = 'button'
    toolbarEdit.className = 'cm-block-action cm-math-edit'
    applyIconButton(toolbarEdit, 'bi-code-slash', '编辑源码')
    toolbarEdit.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      this.edit(view)
    })
    toolbar.appendChild(toolbarEdit)

    const body = document.createElement('div')
    body.className = 'cm-math-body'
    body.addEventListener('click', () => this.edit(view))

    let failure: string | null = null
    try {
      body.innerHTML = katex.renderToString(this.parts.tex, {
        displayMode: true,
        throwOnError: false,
        output: 'html'
      })
      const errorNode = body.querySelector('.katex-error')
      if (errorNode) failure = errorNode.getAttribute('title') || '公式渲染失败'
    } catch (error) {
      failure = error instanceof Error && error.message ? error.message : '公式渲染失败'
    }
    if (failure) {
      body.textContent = ''
      body.appendChild(this.errorCard(failure, view))
    }

    root.append(toolbar, body)
    return root
  }

  ignoreEvent(): boolean {
    return true
  }

  get estimatedHeight(): number {
    return 84
  }

  private edit(view: EditorView): void {
    editBlock(view, this.descriptor, this.descriptor.from + this.parts.openingLength + 1)
  }

  private errorCard(message: string, view: EditorView): HTMLElement {
    const card = document.createElement('div')
    card.className = 'cm-math-error'
    const text = document.createElement('div')
    text.className = 'cm-math-error-message'
    text.textContent = message
    const source = document.createElement('pre')
    source.className = 'cm-math-error-source'
    source.textContent = this.parts.tex
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'cm-block-action cm-math-edit'
    applyIconButton(button, 'bi-code-slash', '编辑源码')
    button.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      this.edit(view)
    })
    card.append(text, source, button)
    return card
  }
}

export const createMathWidget: BlockWidgetFactory = (descriptor) =>
  new MathBlockWidget(descriptor, extractMath(descriptor.content))