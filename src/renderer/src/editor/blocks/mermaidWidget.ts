import { WidgetType, type EditorView } from '@codemirror/view'
import { editBlock } from './blockState'
import { applyIconButton } from './iconButton'
import type { BlockDescriptor, BlockRenderContext, BlockWidgetFactory } from './types'
import '../../styles/code-math.css'

type MermaidApi = (typeof import('mermaid'))['default']
type MermaidTheme = 'light' | 'dark'

interface MermaidParts {
  code: string
  openingLength: number
}

const cache = new Map<string, Promise<string>>()
let counter = 0
let mermaidApi: Promise<MermaidApi> | null = null
let mermaidTheme: MermaidTheme | null = null

async function loadMermaid(theme: MermaidTheme): Promise<MermaidApi> {
  if (!mermaidApi) {
    mermaidApi = import('mermaid').then(({ default: mermaid }) => mermaid)
  }
  const mermaid = await mermaidApi
  if (mermaidTheme !== theme) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: theme === 'dark' ? 'dark' : 'default',
      fontFamily: 'inherit'
    })
    mermaidTheme = theme
  }
  return mermaid
}

function splitLine(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line
}

function extractFence(content: string): MermaidParts {
  const lines = content.split('\n').map(splitLine)
  const first = lines[0] ?? ''
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(first)
  if (!match) {
    return { code: lines.join('\n'), openingLength: 0 }
  }
  const fence = match[1]
  const body = lines.slice(1)
  const closing = new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`)
  if (body.length > 0 && closing.test(body[body.length - 1])) body.pop()
  return { code: body.join('\n'), openingLength: first.length }
}

class MermaidBlockWidget extends WidgetType {
  constructor(
    private readonly descriptor: BlockDescriptor,
    private readonly parts: MermaidParts,
    private readonly theme: MermaidTheme
  ) {
    super()
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof MermaidBlockWidget &&
      other.descriptor.content === this.descriptor.content &&
      other.descriptor.from === this.descriptor.from &&
      other.descriptor.to === this.descriptor.to &&
      other.theme === this.theme
    )
  }

  toDOM(view: EditorView): HTMLElement {
    const root = document.createElement('div')
    root.className = 'cm-block cm-mermaid-block'

    const toolbar = document.createElement('div')
    toolbar.className = 'cm-block-toolbar'
    const editButton = document.createElement('button')
    editButton.type = 'button'
    editButton.className = 'cm-block-action cm-mermaid-edit'
    applyIconButton(editButton, 'bi-code-slash', '编辑源码')
    editButton.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      this.edit(view)
    })
    toolbar.appendChild(editButton)

    const body = document.createElement('div')
    body.className = 'cm-mermaid-body'
    body.addEventListener('click', () => this.edit(view))

    const diagram = document.createElement('div')
    diagram.className = 'cm-mermaid-diagram cm-mermaid-placeholder'
    diagram.textContent = '渲染中…'
    body.appendChild(diagram)

    this.renderDiagram(diagram, view)

    root.append(toolbar, body)
    return root
  }

  ignoreEvent(): boolean {
    return true
  }

  get estimatedHeight(): number {
    return 220
  }

  private edit(view: EditorView): void {
    editBlock(view, this.descriptor, this.descriptor.from + this.parts.openingLength + 1)
  }

  private renderDiagram(diagram: HTMLElement, view: EditorView): void {
    const key = `${this.theme}\n${this.parts.code}`
    const task = cache.get(key) ?? this.startRender(key)
    void task
      .then((svg) => {
        if (!diagram.isConnected) return
        diagram.classList.remove('cm-mermaid-placeholder')
        diagram.innerHTML = svg
      })
      .catch((error: unknown) => {
        if (!diagram.isConnected) return
        diagram.classList.remove('cm-mermaid-placeholder')
        diagram.textContent = ''
        diagram.appendChild(this.errorCard(error, view))
      })
  }

  private startRender(key: string): Promise<string> {
    const id = `librepen-mermaid-${counter++}`
    const theme = this.theme
    const code = this.parts.code
    const task = loadMermaid(theme)
      .then((mermaid) => mermaid.render(id, code))
      .then((result) => result.svg)
    cache.set(key, task)
    task.catch(() => {
      if (cache.get(key) === task) cache.delete(key)
    })
    return task
  }

  private errorCard(error: unknown, view: EditorView): HTMLElement {
    const card = document.createElement('div')
    card.className = 'cm-mermaid-error'
    const text = document.createElement('div')
    text.className = 'cm-mermaid-error-message'
    const message = error instanceof Error && error.message ? error.message : 'Mermaid 渲染失败'
    text.textContent = message.length > 500 ? `${message.slice(0, 500)}…` : message
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'cm-block-action cm-mermaid-edit'
    applyIconButton(button, 'bi-code-slash', '编辑源码')
    button.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      this.edit(view)
    })
    card.append(text, button)
    return card
  }
}

export const createMermaidWidget: BlockWidgetFactory = (
  descriptor: BlockDescriptor,
  context: BlockRenderContext
) => new MermaidBlockWidget(descriptor, extractFence(descriptor.content), context.theme)