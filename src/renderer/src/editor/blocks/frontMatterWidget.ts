import { EditorView, WidgetType } from '@codemirror/view'
import { editBlock } from './blockState'
import { applyIconButton } from './iconButton'
import '../../styles/editor-extras.css'
import type { BlockDescriptor, BlockWidgetFactory } from './types'

interface FrontMatterEntry {
  key: string
  value: string
}

class FrontMatterWidget extends WidgetType {
  constructor(private readonly descriptor: BlockDescriptor) {
    super()
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof FrontMatterWidget &&
      other.descriptor.from === this.descriptor.from &&
      other.descriptor.to === this.descriptor.to &&
      other.descriptor.content === this.descriptor.content
    )
  }

  toDOM(view: EditorView): HTMLElement {
    const root = document.createElement('div')
    root.className = 'cm-block cm-frontmatter-block'
    root.appendChild(this.buildToolbar(view))

    const entries = parseFrontMatter(this.descriptor.content)
    if (entries.length === 0) {
      const note = document.createElement('div')
      note.className = 'cm-frontmatter-note'
      note.textContent = '未识别到可解析的元数据字段'
      const raw = document.createElement('pre')
      raw.className = 'cm-frontmatter-raw'
      raw.textContent = this.descriptor.content.split(/\r?\n/).slice(0, 8).join('\n')
      root.append(note, raw)
    } else {
      const table = document.createElement('table')
      table.className = 'cm-frontmatter-table'
      const body = document.createElement('tbody')
      for (const entry of entries) {
        const row = document.createElement('tr')
        const key = document.createElement('th')
        key.className = 'cm-frontmatter-key'
        key.scope = 'row'
        key.textContent = entry.key
        const value = document.createElement('td')
        value.className = 'cm-frontmatter-value'
        value.textContent = entry.value
        row.append(key, value)
        body.appendChild(row)
      }
      table.appendChild(body)
      root.appendChild(table)
    }

    root.addEventListener('click', () => editBlock(view, this.descriptor))
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
    title.textContent = 'Front Matter'
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'cm-block-action'
    applyIconButton(button, 'bi-code-slash', '编辑源码')
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      editBlock(view, this.descriptor)
    })
    toolbar.append(title, button)
    return toolbar
  }
}

function parseFrontMatter(content: string): FrontMatterEntry[] {
  const entries: FrontMatterEntry[] = []
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line === '---' || line === '...' || line.startsWith('#')) continue
    const match = /^([A-Za-z0-9_][A-Za-z0-9_.-]*)\s*:\s*(.*)$/.exec(line)
    if (!match) continue
    entries.push({ key: match[1], value: normalizeValue(match[2]) })
  }
  return entries
}

function normalizeValue(raw: string): string {
  const value = raw.trim()
  if (!value) return ''
  const quoted =
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  if (quoted) return value.slice(1, -1)
  return value.replace(/\s+#.*$/, '').trim()
}

export const createFrontMatterWidget: BlockWidgetFactory = (descriptor) =>
  new FrontMatterWidget(descriptor)
