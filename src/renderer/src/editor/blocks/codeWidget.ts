import { Compartment, EditorState } from '@codemirror/state'
import {
  drawSelection,
  EditorView,
  WidgetType,
  keymap,
  lineNumbers
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import {
  HighlightStyle,
  LanguageDescription,
  syntaxHighlighting
} from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { tags } from '@lezer/highlight'
import hljs from 'highlight.js'
import { editBlock } from './blockState'
import { applyIconButton } from './iconButton'
import type { BlockDescriptor, BlockWidgetFactory } from './types'
import '../../styles/code-math.css'

interface CodeParts {
  code: string
  language: string
  openingLength: number
  openingLine: string
  closingLine: string
}

function splitLine(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line
}

function splitFence(content: string): CodeParts {
  const lines = content.split('\n').map(splitLine)
  const first = lines[0] ?? ''
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(first)
  if (!match) {
    return {
      code: lines.join('\n'),
      language: '',
      openingLength: 0,
      openingLine: '```',
      closingLine: '```'
    }
  }
  const fence = match[1]
  const info = (match[2] ?? '').trim().split(/\s+/)[0] ?? ''
  const body = lines.slice(1)
  let closingLine = ''
  const closing = new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`)
  if (body.length > 0 && closing.test(body[body.length - 1])) {
    closingLine = body.pop() ?? ''
  }
  return {
    code: body.join('\n'),
    language: info,
    openingLength: first.length,
    openingLine: first,
    closingLine: closingLine || fence
  }
}

function serializeCode(parts: CodeParts, code: string): string {
  const body = code.replace(/\r\n/g, '\n')
  return `${parts.openingLine}\n${body}${body.endsWith('\n') ? '' : '\n'}${parts.closingLine}`
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function highlightCode(code: string, language: string): string {
  const lang = language.toLowerCase()
  if (lang && hljs.getLanguage(lang)) {
    try {
      return hljs.highlight(code, { language: lang }).value
    } catch {
      return escapeHtml(code)
    }
  }
  return escapeHtml(code)
}

function codeEditorTheme(dark: boolean) {
  return EditorView.theme(
    {
      '&': {
        backgroundColor: 'transparent',
        color: 'var(--fg)',
        fontSize: 'var(--code-font-size, 12.5px)'
      },
      '.cm-scroller': {
        fontFamily: 'var(--mono)',
        lineHeight: '1.6',
        overflow: 'visible'
      },
      '.cm-content': { padding: '10px 14px', caretColor: 'var(--accent)' },
      '.cm-line': { padding: '0' },
      '.cm-gutters': {
        backgroundColor: 'transparent',
        color: 'var(--fg-muted)',
        border: 'none'
      },
      '.cm-activeLine': { backgroundColor: 'transparent' },
      '.cm-activeLineGutter': { backgroundColor: 'transparent' },
      '.cm-cursor': { borderLeftColor: 'var(--accent)' },
      '&.cm-focused': { outline: 'none' }
    },
    { dark }
  )
}

const codeHighlightStyle = HighlightStyle.define([
  {
    tag: [
      tags.keyword,
      tags.controlKeyword,
      tags.definitionKeyword,
      tags.moduleKeyword,
      tags.operatorKeyword
    ],
    color: 'var(--hljs-keyword)'
  },
  {
    tag: [
      tags.operator,
      tags.number,
      tags.bool,
      tags.null,
      tags.atom,
      tags.literal,
      tags.unit,
      tags.attributeName,
      tags.propertyName,
      tags.meta
    ],
    color: 'var(--hljs-constant)'
  },
  {
    tag: [tags.string, tags.regexp, tags.special(tags.string)],
    color: 'var(--hljs-string)'
  },
  {
    tag: [tags.comment, tags.blockComment, tags.lineComment],
    color: 'var(--hljs-comment)'
  },
  {
    tag: [tags.function(tags.variableName), tags.className, tags.typeName, tags.definition(tags.typeName)],
    color: 'var(--hljs-entity)'
  },
  { tag: [tags.tagName], color: 'var(--hljs-tag)' },
  {
    tag: [tags.standard(tags.variableName), tags.standard(tags.propertyName)],
    color: 'var(--hljs-variable)'
  },
  { tag: [tags.emphasis], fontStyle: 'italic' },
  { tag: [tags.strong], fontWeight: '700' },
  {
    tag: [tags.inserted],
    color: 'var(--hljs-addition-fg)',
    backgroundColor: 'var(--hljs-addition-bg)'
  },
  {
    tag: [tags.deleted],
    color: 'var(--hljs-deletion-fg)',
    backgroundColor: 'var(--hljs-deletion-bg)'
  },
  { tag: [tags.invalid], color: 'var(--danger)' }
])

class CodeBlockWidget extends WidgetType {
  private readonly languageSlot = new Compartment()
  private root: HTMLElement | null = null
  private body: HTMLElement | null = null
  private editorPanel: HTMLElement | null = null
  private nested: EditorView | null = null
  private outsideHandler: ((event: MouseEvent) => void) | null = null

  constructor(
    private readonly descriptor: BlockDescriptor,
    private readonly parts: CodeParts,
    private readonly theme: 'light' | 'dark'
  ) {
    super()
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof CodeBlockWidget &&
      other.descriptor.content === this.descriptor.content &&
      other.descriptor.info === this.descriptor.info &&
      other.descriptor.from === this.descriptor.from &&
      other.descriptor.to === this.descriptor.to &&
      other.theme === this.theme
    )
  }

  toDOM(view: EditorView): HTMLElement {
    const root = document.createElement('div')
    root.className = 'cm-block cm-code-block'

    const toolbar = document.createElement('div')
    toolbar.className = 'cm-block-toolbar'

    const badge = document.createElement('span')
    badge.className = 'cm-code-lang'
    badge.textContent = this.parts.language || 'text'
    toolbar.appendChild(badge)

    const copied = document.createElement('span')
    copied.className = 'cm-code-copied'

    const copyButton = document.createElement('button')
    copyButton.type = 'button'
    copyButton.className = 'cm-block-action cm-code-copy'
    applyIconButton(copyButton, 'bi-clipboard', '复制代码')

    let timer: number | null = null
    copyButton.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      void window.api.clipboard
        .writeText(this.currentCode())
        .then(() => {
          copied.textContent = '已复制'
          copied.classList.add('is-visible')
          if (timer !== null) window.clearTimeout(timer)
          timer = window.setTimeout(() => {
            copied.textContent = ''
            copied.classList.remove('is-visible')
            timer = null
          }, 1600)
        })
        .catch(() => {})
    })

    const editButton = document.createElement('button')
    editButton.type = 'button'
    editButton.className = 'cm-block-action cm-code-edit'
    applyIconButton(editButton, 'bi-code-slash', '编辑代码（Alt 点击编辑源码）')
    editButton.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      if (this.editorPanel) return
      if (event.altKey) this.edit(view)
      else this.startInlineEdit(view)
    })

    toolbar.append(copied, copyButton, editButton)

    const body = document.createElement('div')
    body.className = 'cm-code-body'
    body.addEventListener('click', (event) => {
      if (!this.editorPanel) this.startInlineEdit(view, { x: event.clientX, y: event.clientY })
    })

    const lineCount = Math.max(1, this.parts.code.split('\n').length)
    const gutter = document.createElement('div')
    gutter.className = 'cm-code-gutter'
    for (let index = 1; index <= lineCount; index++) {
      const number = document.createElement('span')
      number.className = 'cm-code-line-number'
      number.textContent = String(index)
      gutter.appendChild(number)
    }

    const pre = document.createElement('pre')
    pre.className = 'cm-code-pre'
    const code = document.createElement('code')
    code.className = 'hljs'
    code.innerHTML = highlightCode(this.parts.code, this.parts.language)
    pre.appendChild(code)
    body.append(gutter, pre)

    root.append(toolbar, body)
    this.root = root
    this.body = body
    return root
  }

  ignoreEvent(): boolean {
    return true
  }

  get estimatedHeight(): number {
    const lines = Math.max(1, this.parts.code.split('\n').length)
    return Math.min(900, 40 + lines * 21)
  }

  private currentCode(): string {
    return this.nested ? this.nested.state.doc.toString() : this.parts.code
  }

  private edit(view: EditorView): void {
    editBlock(view, this.descriptor, this.descriptor.from + this.parts.openingLength + 1)
  }

  private startInlineEdit(view: EditorView, point?: { x: number; y: number }): void {
    if (this.editorPanel || !this.body) return
    this.body.style.display = 'none'

    const panel = document.createElement('div')
    panel.className = 'cm-code-editor'
    const host = document.createElement('div')
    host.className = 'cm-code-editor-host'
    panel.append(host)
    this.root?.appendChild(panel)
    this.editorPanel = panel

    const nested = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: this.parts.code,
        extensions: [
          history(),
          drawSelection(),
          lineNumbers(),
          EditorState.tabSize.of(2),
          syntaxHighlighting(codeHighlightStyle, { fallback: true }),
          codeEditorTheme(this.theme === 'dark'),
          this.languageSlot.of([]),
          keymap.of([
            {
              key: 'Escape',
              run: () => {
                this.finishInlineEdit(view, false)
                return true
              }
            },
            {
              key: 'Mod-Enter',
              run: () => {
                this.finishInlineEdit(view, true)
                return true
              }
            },
            ...historyKeymap,
            indentWithTab,
            ...defaultKeymap
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) view.requestMeasure()
          })
        ]
      })
    })
    this.nested = nested
    void this.loadLanguage(nested, view)
    nested.focus()
    if (point) {
      window.requestAnimationFrame(() => {
        if (this.nested !== nested) return
        const pos = nested.posAtCoords(point)
        if (pos !== null) nested.dispatch({ selection: { anchor: pos } })
        nested.focus()
      })
    }
    this.outsideHandler = (event) => {
      if (!(event.target instanceof Node)) return
      if (this.root?.contains(event.target)) return
      this.finishInlineEdit(view, true)
    }
    document.addEventListener('mousedown', this.outsideHandler, true)
    view.requestMeasure()
  }

  private loadLanguage(nested: EditorView, view: EditorView): void {
    if (!this.parts.language) return
    const description = LanguageDescription.matchLanguageName(
      languages,
      this.parts.language,
      true
    )
    if (!description) return
    void description
      .load()
      .then((support) => {
        if (this.nested !== nested) return
        nested.dispatch({ effects: this.languageSlot.reconfigure(support) })
        view.requestMeasure()
      })
      .catch(() => undefined)
  }

  private finishInlineEdit(view: EditorView, commit: boolean): void {
    const nested = this.nested
    if (!nested) return
    const code = nested.state.doc.toString()
    if (this.outsideHandler) {
      document.removeEventListener('mousedown', this.outsideHandler, true)
      this.outsideHandler = null
    }
    this.nested = null
    nested.destroy()
    this.editorPanel?.remove()
    this.editorPanel = null
    if (this.body) this.body.style.display = ''
    if (commit && code !== this.parts.code) {
      const max = view.state.doc.length
      const from = Math.min(Math.max(this.descriptor.from, 0), max)
      const to = Math.min(Math.max(this.descriptor.to, from), max)
      view.dispatch({ changes: { from, to, insert: serializeCode(this.parts, code) } })
    } else {
      view.requestMeasure()
    }
  }
}

export const createCodeWidget: BlockWidgetFactory = (descriptor, context) => {
  const parts = splitFence(descriptor.content)
  if (!parts.language && descriptor.info) {
    parts.language = descriptor.info.trim().split(/\s+/)[0] ?? ''
  }
  return new CodeBlockWidget(descriptor, parts, context.theme)
}
