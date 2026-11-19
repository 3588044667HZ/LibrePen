import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent
} from 'react'
import { Compartment, EditorState } from '@codemirror/state'
import {
  drawSelection,
  dropCursor,
  EditorView,
  keymap,
  lineNumbers,
  placeholder as placeholderExt,
  type ViewUpdate
} from '@codemirror/view'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  redo,
  undo
} from '@codemirror/commands'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { openSearchPanel, search, searchKeymap } from '@codemirror/search'
import {
  deleteMarkupBackward,
  insertNewlineContinueMarkup,
  markdown,
  markdownKeymap,
  markdownLanguage
} from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import type { Settings } from '@shared/types'
import {
  lineRangeForSelection,
  toggleBlockPrefix,
  type BlockPrefix
} from '@shared/markdown'
import { livePreview } from './livePreview'
import { sourceSyntax } from './sourceSyntax'
import { clampDragPoint, limitDragStep } from './dragGuard'
import { editorTheme } from './theme'
import { findBlockAt, setBlockEdit } from './blocks/blockState'
import { focusModeExtension, typewriterModeExtension } from './effects'
import { markdownAutocomplete } from './autocomplete'
import { findLinkAt, selectedLink } from './links'

export interface EditorHandle {
  getContent(): string
  focus(): void
  command(id: string, args?: unknown): void
  insertText(text: string): void
  insertLink(url: string): void
  insertImage(alt: string, src: string): void
  revealPosition(line: number, column: number, length?: number): void
  scrollToLine(line: number): void
}

interface ContextMenuItem {
  label: string
  command?: string
  args?: unknown
  shortcut?: string
  icon?: string
  separator?: boolean
  children?: ContextMenuItem[]
}

const CONTEXT_MENU_ITEMS: ContextMenuItem[] = [
  { label: '标题', icon: 'bi-type', children: [
    { label: '一级标题', command: 'heading', args: { level: 1 }, shortcut: 'Ctrl+1', icon: 'bi-type-h1' },
    { label: '二级标题', command: 'heading', args: { level: 2 }, shortcut: 'Ctrl+2', icon: 'bi-type-h2' },
    { label: '三级标题', command: 'heading', args: { level: 3 }, shortcut: 'Ctrl+3', icon: 'bi-type-h3' },
    { label: '四级标题', command: 'heading', args: { level: 4 }, shortcut: 'Ctrl+4', icon: 'bi-type-h4' },
    { label: '五级标题', command: 'heading', args: { level: 5 }, shortcut: 'Ctrl+5', icon: 'bi-type-h5' },
    { label: '六级标题', command: 'heading', args: { level: 6 }, shortcut: 'Ctrl+6', icon: 'bi-type-h6' },
    { label: '正文', command: 'heading', args: { level: 0 }, shortcut: 'Ctrl+0', icon: 'bi-paragraph' }
  ] },
  { label: '格式', icon: 'bi-fonts', children: [
    { label: '加粗', command: 'bold', shortcut: 'Ctrl+B', icon: 'bi-type-bold' },
    { label: '斜体', command: 'italic', shortcut: 'Ctrl+I', icon: 'bi-type-italic' },
    { label: '删除线', command: 'strike', icon: 'bi-type-strikethrough' },
    { label: '高亮', command: 'highlight', icon: 'bi-highlighter' },
    { label: '行内代码', command: 'inline-code', icon: 'bi-code' },
    { label: '下划线', command: 'underline', shortcut: 'Ctrl+U', icon: 'bi-type-underline' }
  ] },
  { label: '段落', icon: 'bi-paragraph', children: [
    { label: '引用', command: 'quote', icon: 'bi-quote' },
    { label: '无序列表', command: 'bullet', icon: 'bi-list-ul' },
    { label: '有序列表', command: 'ordered', icon: 'bi-list-ol' },
    { label: '任务列表', command: 'task', icon: 'bi-check2-square' }
  ] },
  { label: '插入', icon: 'bi-plus-square', children: [
    { label: '代码块', command: 'code-fence', shortcut: 'Ctrl+Shift+K', icon: 'bi-code-square' },
    { label: '公式块', command: 'math-block', shortcut: 'Ctrl+Shift+M', icon: 'bi-superscript' },
    { label: '表格', command: 'table', shortcut: 'Ctrl+T', icon: 'bi-table' },
    { label: '水平线', command: 'hr', shortcut: 'Ctrl+Shift+R', icon: 'bi-hr' },
    { label: '目录', command: 'toc', icon: 'bi-list-nested' }
  ] },
  { separator: true, label: '' },
  { label: '粘贴为纯文本', command: 'paste-plain', shortcut: 'Ctrl+Shift+V', icon: 'bi-clipboard' },
  { label: '清除格式', command: 'clear-format', icon: 'bi-eraser' },
  { label: '撤销', command: 'undo', shortcut: 'Ctrl+Z', icon: 'bi-arrow-counterclockwise' },
  { label: '重做', command: 'redo', shortcut: 'Ctrl+Y', icon: 'bi-arrow-clockwise' }
]

interface EditorProps {
  initialContent: string
  docPath: string | null
  settings: Settings
  theme: 'light' | 'dark'
  sourceMode: boolean
  onChange(content: string): void
  onCursor(line: number, column: number): void
  onImage(data: Uint8Array, fileName: string): Promise<void> | void
  onDropPath(path: string): Promise<void> | void
}

export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(props, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contextMenuRef = useRef<HTMLDivElement | null>(null)
  const submenuRef = useRef<HTMLDivElement | null>(null)
  const [submenu, setSubmenu] = useState<{
    key: string
    items: ContextMenuItem[]
    x: number
    y: number
  } | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const propsRef = useRef(props)
  propsRef.current = props

  const compartments = useRef({
    wrap: new Compartment(),
    numbers: new Compartment(),
    tabSize: new Compartment(),
    theme: new Compartment(),
    live: new Compartment(),
    autoPair: new Compartment(),
    focus: new Compartment(),
    typewriter: new Compartment(),
    spellcheck: new Compartment()
  }).current

  useLayoutEffect(() => {
    const menu = contextMenuRef.current
    if (!contextMenu || !menu) return
    const margin = 8
    const rect = menu.getBoundingClientRect()
    const x = Math.max(margin, Math.min(contextMenu.x, window.innerWidth - rect.width - margin))
    const y = Math.max(margin, Math.min(contextMenu.y, window.innerHeight - rect.height - margin))
    if (x !== contextMenu.x || y !== contextMenu.y) setContextMenu({ x, y })
  }, [contextMenu])

  useLayoutEffect(() => {
    const menu = submenuRef.current
    if (!submenu || !menu) return
    const margin = 8
    const rect = menu.getBoundingClientRect()
    const parent = contextMenuRef.current?.getBoundingClientRect()
    let x = submenu.x
    if (parent && x + rect.width > window.innerWidth - margin) {
      x = parent.left - rect.width - 4
    }
    x = Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin))
    const y = Math.max(margin, Math.min(submenu.y, window.innerHeight - rect.height - margin))
    if (x !== submenu.x || y !== submenu.y) setSubmenu({ ...submenu, x, y })
  }, [submenu])

  useImperativeHandle(
    ref,
    () => ({
      getContent: () => viewRef.current?.state.doc.toString() ?? props.initialContent,
      focus: () => viewRef.current?.focus(),
      command: (id, args) => {
        const view = viewRef.current
        if (view) runCommand(view, id, args)
      },
      insertText: (text) => {
        const view = viewRef.current
        if (!view) return
        const { from, to } = view.state.selection.main
        view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } })
        view.focus()
      },
      insertLink: (url) => {
        const view = viewRef.current
        if (!view) return
        const { from, to } = view.state.selection.main
        const selected = view.state.sliceDoc(from, to) || 'text'
        const insert = `[${selected}](${url})`
        const urlStart = from + selected.length + 3
        view.dispatch({
          changes: { from, to, insert },
          selection: { anchor: urlStart, head: urlStart + url.length }
        })
        view.focus()
      },
      insertImage: (alt, src) => {
        const view = viewRef.current
        if (!view) return
        const { from, to } = view.state.selection.main
        const insert = `![${alt}](${src})`
        view.dispatch({
          changes: { from, to, insert },
          selection: { anchor: from + insert.length }
        })
        view.focus()
      },
      revealPosition: (line, column, length = 0) => {
        const view = viewRef.current
        if (!view) return
        const lineInfo = view.state.doc.line(Math.min(Math.max(1, line), view.state.doc.lines))
        const anchor = Math.min(lineInfo.to, lineInfo.from + Math.max(0, column - 1))
        const block = findBlockAt(view.state, anchor)
        view.dispatch({
          selection: { anchor, head: Math.min(lineInfo.to, anchor + length) },
          effects: block
            ? [setBlockEdit.of({ from: block.from, to: block.to }), EditorView.scrollIntoView(anchor, { y: 'center' })]
            : EditorView.scrollIntoView(anchor, { y: 'center' })
        })
        view.focus()
      },
      scrollToLine: (line) => {
        const view = viewRef.current
        if (!view) return
        const lineInfo = view.state.doc.line(Math.min(Math.max(1, line), view.state.doc.lines))
        const block = findBlockAt(view.state, lineInfo.from)
        view.dispatch({
          selection: { anchor: lineInfo.from },
          effects: block
            ? [setBlockEdit.of({ from: block.from, to: block.to }), EditorView.scrollIntoView(lineInfo.from, { y: 'start' })]
            : EditorView.scrollIntoView(lineInfo.from, { y: 'start' })
        })
        view.focus()
      }
    }),
    [props.initialContent]
  )

  useEffect(() => {
    const parent = containerRef.current
    if (!parent) return
    const settings = propsRef.current.settings
    const dark = propsRef.current.theme === 'dark'

    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: propsRef.current.initialContent,
        extensions: [
          history(),
          drawSelection(),
          dropCursor(),
          search({ top: true }),
          placeholderExt('开始写作…'),
          EditorView.contentAttributes.of({ id: 'write' }),
          markdownAutocomplete(),
          markdown({ base: markdownLanguage, codeLanguages: languages }),
          compartments.tabSize.of(EditorState.tabSize.of(settings.editor.tabSize)),
          compartments.wrap.of(settings.editor.lineWrapping ? EditorView.lineWrapping : []),
          compartments.numbers.of(settings.editor.showLineNumbers ? lineNumbers() : []),
          compartments.theme.of(editorTheme(settings, dark, propsRef.current.sourceMode)),
          compartments.live.of(
            propsRef.current.sourceMode
              ? sourceSyntax()
              : settings.editor.livePreview
                ? livePreview({
                    docPath: propsRef.current.docPath,
                    inlineMath: settings.editor.inlineMath,
                    theme: propsRef.current.theme,
                    resolveImage: window.api.files.resolveImage
                  })
                : []
          ),
          compartments.autoPair.of(settings.editor.autoPair ? closeBrackets() : []),
          compartments.focus.of(settings.editor.focusMode ? focusModeExtension() : []),
          compartments.typewriter.of(settings.editor.typewriterMode ? typewriterModeExtension() : []),
          compartments.spellcheck.of(
            EditorView.contentAttributes.of({
              spellcheck: settings.editor.spellcheck ? 'true' : 'false'
            })
          ),
          keymap.of([
            ...markdownKeymap,
            { key: 'Enter', run: insertNewlineContinueMarkup },
            { key: 'Backspace', run: deleteMarkupBackward },
            ...closeBracketsKeymap,
            ...searchKeymap,
            ...historyKeymap,
            indentWithTab,
            ...defaultKeymap
          ]),
          EditorView.updateListener.of((update: ViewUpdate) => {
            if (update.docChanged) {
              propsRef.current.onChange(update.state.doc.toString())
            }
            if (update.docChanged || update.selectionSet) {
              const head = update.state.selection.main.head
              const line = update.state.doc.lineAt(head)
              propsRef.current.onCursor(line.number, head - line.from + 1)
            }
          }),
          EditorView.domEventHandlers({
            mousedown: (event, view) => {
              trackPreviewClick(event, view, propsRef.current.sourceMode)
              if (trackDocumentEndClick(event, view)) return true
              return handleLinkClick(event, view)
            },
            click: (event, view) => {
              if (handlePreviewClick(event, view)) return true
              return handleDocumentEndClick(event, view)
            },
            paste: (event) => handlePaste(event),
            drop: (event) => handleDrop(event),
            contextmenu: (event) => {
              event.preventDefault()
              setContextMenu({
                x: Math.min(event.clientX, window.innerWidth - 220),
                y: Math.min(event.clientY, window.innerHeight - 260)
              })
              return true
            }
          })
        ]
      })
    })
    viewRef.current = view
    view.focus()
    propsRef.current.onCursor(1, 1)

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!props.sourceMode) return
    const view = viewRef.current
    if (!view) return
    let dragging = false
    let dispatching = false
    let lastX = 0
    let lastY = 0
    let lastTime = 0
    const content = view.contentDOM

    const onDown = (event: MouseEvent): void => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
      if (!(event.target instanceof Node) || !content.contains(event.target)) return
      dragging = true
      lastX = event.clientX
      lastY = event.clientY
      lastTime = event.timeStamp || performance.now()
    }

    const onMove = (event: MouseEvent): void => {
      if (!dragging || dispatching) return
      if (event.buttons === 0) {
        event.stopImmediatePropagation()
        return
      }
      const rect = view.scrollDOM.getBoundingClientRect()
      const now = event.timeStamp || performance.now()
      const point = limitDragStep(
        { x: lastX, y: lastY },
        clampDragPoint({ x: event.clientX, y: event.clientY }, rect),
        now - lastTime
      )
      const x = point.x
      const y = point.y
      lastX = x
      lastY = y
      lastTime = now
      if (x === event.clientX && y === event.clientY) return
      event.stopImmediatePropagation()
      dispatching = true
      content.dispatchEvent(
        new MouseEvent('mousemove', {
          bubbles: true,
          cancelable: true,
          view: window,
          detail: event.detail,
          screenX: event.screenX,
          screenY: event.screenY,
          clientX: x,
          clientY: y,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          metaKey: event.metaKey,
          button: event.button,
          buttons: event.buttons
        })
      )
      dispatching = false
    }

    const onUp = (): void => {
      dragging = false
    }

    const onWheel = (): void => {
      dragging = false
    }

    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('mousemove', onMove, true)
    document.addEventListener('mouseup', onUp, true)
    document.addEventListener('wheel', onWheel, true)
    window.addEventListener('blur', onUp)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('mousemove', onMove, true)
      document.removeEventListener('mouseup', onUp, true)
      document.removeEventListener('wheel', onWheel, true)
      window.removeEventListener('blur', onUp)
    }
  }, [props.sourceMode])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const settings = props.settings
    view.dispatch({
      effects: [
        compartments.wrap.reconfigure(settings.editor.lineWrapping ? EditorView.lineWrapping : []),
        compartments.numbers.reconfigure(settings.editor.showLineNumbers ? lineNumbers() : []),
        compartments.tabSize.reconfigure(EditorState.tabSize.of(settings.editor.tabSize)),
        compartments.theme.reconfigure(editorTheme(settings, props.theme === 'dark', props.sourceMode)),
        compartments.live.reconfigure(
          props.sourceMode
            ? sourceSyntax()
            : settings.editor.livePreview
              ? livePreview({
                  docPath: props.docPath,
                  inlineMath: settings.editor.inlineMath,
                  theme: props.theme,
                  resolveImage: window.api.files.resolveImage
                })
              : []
        ),
        compartments.autoPair.reconfigure(settings.editor.autoPair ? closeBrackets() : []),
        compartments.focus.reconfigure(settings.editor.focusMode ? focusModeExtension() : []),
        compartments.typewriter.reconfigure(
          settings.editor.typewriterMode ? typewriterModeExtension() : []
        ),
        compartments.spellcheck.reconfigure(
          EditorView.contentAttributes.of({
            spellcheck: settings.editor.spellcheck ? 'true' : 'false'
          })
        )
      ]
    })
  }, [props.settings, props.sourceMode, props.docPath, props.theme, compartments])

  function handlePaste(event: ClipboardEvent): boolean {
    const data = event.clipboardData
    if (!data) return false
    const files: File[] = []
    for (const item of Array.from(data.items)) {
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file && isImageFile(file)) files.push(file)
      }
    }
    for (const file of Array.from(data.files)) {
      if (isImageFile(file)) files.push(file)
    }
    const unique = uniqueFiles(files)
    if (unique.length === 0) return false
    event.preventDefault()
    void sendImages(unique)
    return true
  }

  function handleDrop(event: DragEvent): boolean {
    const transfer = event.dataTransfer
    if (!transfer) return false
    const files = uniqueFiles(Array.from(transfer.files))
    if (files.length === 0) return false
    const images = files.filter(isImageFile)
    const docs = files.filter((file) => !isImageFile(file))
    if (images.length > 0) {
      event.preventDefault()
      void sendImages(images)
    }
    if (docs.length > 0) {
      event.preventDefault()
      void openDroppedFiles(docs)
    }
    return images.length > 0 || docs.length > 0
  }

  async function openDroppedFiles(files: File[]): Promise<void> {
    for (const file of files) {
      const filePath = window.api.files.getPathForFile(file)
      if (filePath) await propsRef.current.onDropPath(filePath)
    }
  }

  async function sendImages(files: File[]): Promise<void> {
    for (const file of files) {
      const buffer = await file.arrayBuffer()
      await propsRef.current.onImage(new Uint8Array(buffer), file.name || 'image.png')
    }
  }

  const closeContextMenu = (): void => {
    setSubmenu(null)
    setContextMenu(null)
  }

  const runContext = (id: string, args?: unknown): void => {
    closeContextMenu()
    const view = viewRef.current
    if (view) runCommand(view, id, args)
  }

  const showSubmenu = (
    event: ReactMouseEvent<HTMLButtonElement>,
    key: string,
    items: ContextMenuItem[]
  ): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    setSubmenu({ key, items, x: rect.right + 2, y: rect.top })
  }

  const renderContextItems = (items: ContextMenuItem[], prefix: string) =>
    items.map((item, index) => {
      if (item.separator) {
        return <div className="editor-context-sep" key={prefix + '-sep-' + index} />
      }
      const hasChildren = Boolean(item.children?.length)
      return (
        <button
          key={prefix + ':' + item.command + ':' + item.label}
          type="button"
          onMouseEnter={(event) => {
            if (hasChildren) showSubmenu(event, prefix + ':' + item.label, item.children!)
            else setSubmenu(null)
          }}
          onClick={(event) => {
            if (hasChildren) showSubmenu(event, prefix + ':' + item.label, item.children!)
            else runContext(item.command!, item.args)
          }}
        >
          <i className={'bi ' + item.icon} aria-hidden="true" />
          <span>{item.label}</span>
          {hasChildren ? (
            <i className="bi bi-chevron-right editor-context-chevron" aria-hidden="true" />
          ) : item.shortcut ? (
            <span className="editor-context-shortcut">{item.shortcut}</span>
          ) : null}
        </button>
      )
    })

  return (
    <>
      <div
        ref={containerRef}
        className={`editor-host ${props.sourceMode ? 'source-mode' : ''}`}
      />
      {contextMenu ? (
        <div
          className="editor-context-backdrop"
          onMouseDown={closeContextMenu}
          onPointerDown={closeContextMenu}
          onClick={closeContextMenu}
        >
          <div
            ref={contextMenuRef}
            className="editor-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            {renderContextItems(CONTEXT_MENU_ITEMS, 'root')}
          </div>
          {submenu ? (
            <div
              ref={submenuRef}
              className="editor-context-menu editor-context-submenu"
              style={{ left: submenu.x, top: submenu.y }}
              onMouseDown={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
              {renderContextItems(submenu.items, submenu.key)}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  )
})

function runCommand(view: EditorView, id: string, args?: unknown): void {
  const state = view.state
  const selection = state.selection.main
  const doc = state.doc.toString()

  const dispatchInsert = (insert: string, selectFrom: number, selectTo: number): void => {
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert },
      selection: { anchor: selectFrom, head: selectTo },
      scrollIntoView: true
    })
    view.focus()
  }

  const toggleInline = (before: string, after: string, placeholder: string): void => {
    const selected = state.sliceDoc(selection.from, selection.to)
    const beforeOutside = state.sliceDoc(
      Math.max(0, selection.from - before.length),
      selection.from
    )
    const afterOutside = state.sliceDoc(selection.to, selection.to + after.length)
    if (selected && beforeOutside === before && afterOutside === after) {
      view.dispatch({
        changes: [
          { from: selection.from - before.length, to: selection.from, insert: '' },
          { from: selection.to, to: selection.to + after.length, insert: '' }
        ],
        selection: {
          anchor: selection.from - before.length,
          head: selection.to - before.length
        }
      })
      view.focus()
      return
    }
    if (selection.from === selection.to) {
      const insert = before + placeholder + after
      view.dispatch({
        changes: { from: selection.from, insert },
        selection: {
          anchor: selection.from + before.length,
          head: selection.from + before.length + placeholder.length
        }
      })
      view.focus()
      return
    }
    const insert = before + selected + after
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert },
      selection: {
        anchor: selection.from + before.length,
        head: selection.from + before.length + selected.length
      }
    })
    view.focus()
  }

  const applyBlock = (prefix: BlockPrefix): void => {
    const result = toggleBlockPrefix(doc, selection.from, selection.to, prefix)
    const { start, end } = lineRangeForSelection(doc, selection.from, selection.to)
    const inserted = result.doc.slice(start, result.to)
    view.dispatch({
      changes: { from: start, to: Math.max(end, start), insert: inserted },
      selection: { anchor: start, head: start + inserted.length },
      scrollIntoView: true
    })
    view.focus()
  }

  const currentHeading = (): number => {
    const line = state.doc.lineAt(selection.head)
    const match = /^(#{1,6})\s/.exec(line.text)
    return match ? match[1].length : 0
  }

  switch (id) {
    case 'undo':
      undo(view)
      return
    case 'redo':
      redo(view)
      return
    case 'find':
    case 'replace':
      openSearchPanel(view)
      return
    case 'bold':
      toggleInline('**', '**', 'bold')
      return
    case 'italic':
      toggleInline('*', '*', 'italic')
      return
    case 'strike':
      toggleInline('~~', '~~', 'text')
      return
    case 'highlight':
      toggleInline('==', '==', 'text')
      return
    case 'inline-code':
      toggleInline('`', '`', 'code')
      return
    case 'underline':
      toggleInline('<u>', '</u>', 'text')
      return
    case 'superscript':
      toggleInline('^', '^', 'text')
      return
    case 'subscript':
      toggleInline('~', '~', 'text')
      return
    case 'heading': {
      const level = Number((args as { level?: number } | undefined)?.level ?? 1)
      applyBlock(`heading${Math.max(0, Math.min(6, level))}` as BlockPrefix)
      return
    }
    case 'heading-up': {
      const level = currentHeading()
      applyBlock(`heading${Math.max(0, level - 1)}` as BlockPrefix)
      return
    }
    case 'heading-down': {
      const level = currentHeading()
      applyBlock(`heading${Math.min(6, level === 0 ? 1 : level + 1)}` as BlockPrefix)
      return
    }
    case 'quote':
      applyBlock('quote')
      return
    case 'bullet-list':
    case 'bullet':
      applyBlock('bullet')
      return
    case 'ordered-list':
    case 'ordered':
      applyBlock('ordered')
      return
    case 'task-list':
    case 'task':
      applyBlock('task')
      return
    case 'code-fence': {
      const selected = state.sliceDoc(selection.from, selection.to)
      if (selected) {
        const insert = '```\n' + selected + '\n```'
        dispatchInsert(insert, selection.from, selection.from + insert.length)
      } else {
        const insert = '```\n\n```'
        view.dispatch({
          changes: { from: selection.from, insert },
          selection: { anchor: selection.from + 4 }
        })
        view.focus()
      }
      return
    }
    case 'math-block': {
      const selected = state.sliceDoc(selection.from, selection.to)
      if (selected) {
        const insert = '$$\n' + selected + '\n$$'
        view.dispatch({
          changes: { from: selection.from, to: selection.to, insert },
          selection: {
            anchor: selection.from + 3,
            head: selection.from + 3 + selected.length
          }
        })
      } else {
        const insert = '$$\n\n$$'
        view.dispatch({
          changes: { from: selection.from, insert },
          selection: { anchor: selection.from + 3 }
        })
      }
      view.focus()
      return
    }
    case 'table': {
      const insert = '| Column 1 | Column 2 |\n| --- | --- |\n| Text | Text |'
      const first = insert.indexOf('Column 1')
      dispatchInsert(insert, selection.from + first, selection.from + first + 8)
      return
    }
    case 'hr': {
      const insert = '\n---\n'
      dispatchInsert(insert, selection.from + insert.length, selection.from + insert.length)
      return
    }
    case 'toc': {
      const insert = '[toc]\n'
      dispatchInsert(insert, selection.from + insert.length, selection.from + insert.length)
      return
    }
    case 'clear-format': {
      const { start, end } = lineRangeForSelection(doc, selection.from, selection.to)
      const block = doc.slice(start, end)
      const cleaned = stripFormattingBlock(block)
      view.dispatch({
        changes: { from: start, to: end, insert: cleaned },
        selection: { anchor: start, head: start + cleaned.length }
      })
      view.focus()
      return
    }
    case 'paste-plain': {
      void window.api.clipboard.readText().then((text) => {
        if (text) {
          const current = view.state.selection.main
          view.dispatch({
            changes: { from: current.from, to: current.to, insert: text },
            selection: { anchor: current.from + text.length }
          })
          view.focus()
        }
      })
      return
    }
    default:
      return
  }
}

function stripFormatting(line: string): string {
  const withoutBlock = line
    .replace(/^\s{0,3}#{1,6}\s+/, '')
    .replace(/^\s{0,3}>\s?/, '')
    .replace(/^(\s*)[-*+]\s+\[[ xX]\]\s+/, '$1')
    .replace(/^(\s*)[-*+]\s+/, '$1')
    .replace(/^(\s*)\d+[.)]\s+/, '$1')
  return withoutBlock
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/==(.+?)==/g, '$1')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, '$1')
    .replace(/<\/?u>/gi, '')
    .replace(/\^([^^\n]+)\^/g, '$1')
    .replace(/(?<!~)~([^~\n]+)~(?!~)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
}

function stripFormattingBlock(block: string): string {
  const lines = block.split('\n')
  const out: string[] = []
  let fence: string | null = null
  for (const line of lines) {
    const match = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
    if (fence) {
      out.push(line)
      if (match && match[1][0] === fence) fence = null
      continue
    }
    if (match) {
      fence = match[1][0]
      out.push(line)
      continue
    }
    out.push(stripFormatting(line))
  }
  return out.join('\n')
}

function handleLinkClick(event: MouseEvent, view: EditorView): boolean {
  if (event.button !== 0 || (!event.ctrlKey && !event.metaKey)) return false
  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
  const target = (pos === null ? null : findLinkAt(view.state, pos)) ?? selectedLink(view.state)
  if (!target) return false
  event.preventDefault()
  event.stopPropagation()
  void window.api.shell.openExternal(target).catch(() => undefined)
  return true
}

let documentEndDown: { x: number; y: number; button: number } | null = null
let previewClickDown: { x: number; y: number; button: number; position: number; line: number } | null = null

function trackPreviewClick(event: MouseEvent, view: EditorView, sourceMode: boolean): void {
  previewClickDown = null
  if (sourceMode) return
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
  if (!(event.target instanceof Element)) return
  if (!view.contentDOM.contains(event.target)) return
  if (event.target.closest('.cm-block')) return
  const lineElement = event.target.closest('.cm-line')
  if (!lineElement) return
  try {
    const lineStart = view.posAtDOM(lineElement, 0)
    const line = view.state.doc.lineAt(lineStart)
    const caret = caretPositionAt(event.clientX, event.clientY)
    let position = line.from
    if (caret && view.contentDOM.contains(caret.startContainer)) {
      try {
        const candidate = view.posAtDOM(caret.startContainer, caret.startOffset)
        if (view.state.doc.lineAt(candidate).number === line.number) position = candidate
      } catch {}
    }
    previewClickDown = {
      x: event.clientX,
      y: event.clientY,
      button: event.button,
      position,
      line: line.number
    }
  } catch {}
}

function handlePreviewClick(event: MouseEvent, view: EditorView): boolean {
  const down = previewClickDown
  previewClickDown = null
  if (!down || down.button !== 0) return false
  if (event.button !== 0) return false
  if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 4) return false
  const currentLine = view.state.doc.lineAt(view.state.selection.main.head)
  if (currentLine.number === down.line) return false
  view.dispatch({ selection: { anchor: down.position } })
  return true
}

function caretPositionAt(x: number, y: number): Range | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
  }
  if (doc.caretRangeFromPoint) return doc.caretRangeFromPoint(x, y)
  const position = doc.caretPositionFromPoint?.(x, y)
  if (!position) return null
  const range = document.createRange()
  range.setStart(position.offsetNode, position.offset)
  range.collapse(true)
  return range
}

function trackDocumentEndClick(event: MouseEvent, view: EditorView): boolean {
  if (event.button !== 0) return false
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return false
  const content = view.contentDOM.getBoundingClientRect()
  if (
    event.clientX < content.left ||
    event.clientX > content.right ||
    event.clientY < content.top ||
    event.clientY > content.bottom
  ) {
    return false
  }
  const coords = view.coordsAtPos(view.state.doc.length)
  if (!coords || event.clientY <= coords.bottom + 2) return false
  documentEndDown = { x: event.clientX, y: event.clientY, button: event.button }
  event.preventDefault()
  return true
}

function handleDocumentEndClick(event: MouseEvent, view: EditorView): boolean {
  const down = documentEndDown
  documentEndDown = null
  if (!down || down.button !== 0) return false
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return false
  if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 4) return false
  if (
    event.button !== 0 ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return false
  }
  const content = view.contentDOM.getBoundingClientRect()
  if (
    event.clientX < content.left ||
    event.clientX > content.right ||
    event.clientY < content.top ||
    event.clientY > content.bottom
  ) {
    return false
  }
  const target = event.target
  if (target instanceof Element && target.closest('.cm-block')) return false
  const last = view.state.doc.line(view.state.doc.lines)
  const coords = view.coordsAtPos(view.state.doc.length)
  if (!coords || event.clientY <= coords.bottom + 2) return false
  event.preventDefault()
  if (last.text.trim().length > 0) {
    const end = view.state.doc.length
    view.dispatch({
      changes: { from: end, insert: '\n' },
      selection: { anchor: end + 1 },
      scrollIntoView: true
    })
  } else {
    view.dispatch({
      selection: { anchor: view.state.doc.length },
      scrollIntoView: true
    })
  }
  view.focus()
  return true
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(file.name)
}

function uniqueFiles(files: File[]): File[] {
  const seen = new Set<string>()
  const unique: File[] = []
  for (const file of files) {
    const key = `${file.name}:${file.size}:${file.lastModified}:${file.type}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(file)
  }
  return unique
}
