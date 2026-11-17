import { WidgetType, type EditorView } from '@codemirror/view'
import { editBlock } from './blockState'
import { applyIconButton } from './iconButton'
import { renderInlineMarkdown } from '../inlineMarkdown'
import {
  addColumn,
  addRow,
  moveColumn,
  moveRow,
  parseTable,
  removeColumn,
  removeRow,
  serializeTable,
  setCell,
  type TableAlignment,
  type TableModel
} from './tableModel'
import type { BlockDescriptor, BlockWidgetFactory } from './types'

function emptyModel(): TableModel {
  return { header: [''], alignments: ['none'], rows: [] }
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

class TableWidget extends WidgetType {
  private readonly descriptor: BlockDescriptor
  private model: TableModel
  private container: HTMLElement | null = null
  private tableHost: HTMLElement | null = null
  private panel: HTMLElement | null = null
  private contextMenu: HTMLElement | null = null
  private contextCleanup: (() => void) | null = null
  private focusedRow = -1
  private focusedCol = 0
  private columnWidths: number[] | null = null
  private rowHeights: number[] | null = null

  constructor(descriptor: BlockDescriptor) {
    super()
    this.descriptor = descriptor
    this.model = parseTable(descriptor.content) ?? emptyModel()
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof TableWidget &&
      other.descriptor.content === this.descriptor.content &&
      other.descriptor.from === this.descriptor.from &&
      other.descriptor.to === this.descriptor.to
    )
  }

  toDOM(view: EditorView): HTMLElement {
    const block = document.createElement('div')
    block.className = 'cm-block cm-table-block'
    block.style.position = 'relative'

    const host = document.createElement('div')
    host.className = 'cm-table-scroll'
    host.appendChild(this.renderTable(view))
    block.appendChild(host)
    block.appendChild(this.renderToolbar(view))

    this.container = block
    this.tableHost = host
    return block
  }

  ignoreEvent(): boolean {
    return true
  }

  private renderToolbar(view: EditorView): HTMLElement {
    const toolbar = document.createElement('div')
    toolbar.className = 'cm-block-toolbar'
    toolbar.addEventListener('mousedown', (event) => event.stopPropagation())
    toolbar.addEventListener('click', (event) => event.stopPropagation())
    toolbar.appendChild(this.createButton('bi-pencil-square', '编辑表格', () => this.openPanel(view, -1, 0)))
    toolbar.appendChild(
      this.createButton('bi-code-slash', '编辑源码', () =>
        editBlock(view, this.descriptor, this.descriptor.from)
      )
    )
    toolbar.appendChild(
      this.createButton('bi-arrow-counterclockwise', '重置列宽/行高', () => {
        this.columnWidths = null
        this.rowHeights = null
        this.refreshPreview(view)
        view.requestMeasure()
      })
    )
    return toolbar
  }

  private renderTable(view: EditorView): HTMLTableElement {
    const table = document.createElement('table')
    table.className = 'cm-table-render'

    const colgroup = document.createElement('colgroup')
    this.model.header.forEach(() => colgroup.appendChild(document.createElement('col')))
    table.appendChild(colgroup)

    const thead = document.createElement('thead')
    const headerRow = document.createElement('tr')
    this.model.header.forEach((value, column) => {
      const th = document.createElement('th')
      th.scope = 'col'
      th.innerHTML = renderInlineMarkdown(value)
      th.dataset.row = '-1'
      th.dataset.col = String(column)
      th.classList.add(`cm-table-align-${this.model.alignments[column] ?? 'none'}`)
      headerRow.appendChild(th)
    })
    thead.appendChild(headerRow)

    const tbody = document.createElement('tbody')
    this.model.rows.forEach((row, rowIndex) => {
      const tr = document.createElement('tr')
      row.forEach((value, column) => {
        const td = document.createElement('td')
        td.innerHTML = renderInlineMarkdown(value)
        td.dataset.row = String(rowIndex)
        td.dataset.col = String(column)
        td.classList.add(`cm-table-align-${this.model.alignments[column] ?? 'none'}`)
        tr.appendChild(td)
      })
      tbody.appendChild(tr)
    })

    const rows = [headerRow, ...Array.from(tbody.rows)]
    rows.forEach((row, rowIndex) => {
      Array.from(row.cells).forEach((cell) => {
        cell.appendChild(this.createRowResizer(view, table, rowIndex))
      })
    })
    headerRow.querySelectorAll('th').forEach((th, column) => {
      th.appendChild(this.createColResizer(view, table, column))
    })

    table.append(thead, tbody)
    this.applySizes(table)
    table.addEventListener('mousedown', (event) => event.stopPropagation())
    table.addEventListener('contextmenu', (event) => {
      if (!(event.target instanceof HTMLElement)) return
      const cell = event.target.closest<HTMLTableCellElement>('th, td')
      if (!cell) return
      event.preventDefault()
      event.stopPropagation()
      this.openTableMenu(view, event, Number(cell.dataset.row ?? '-1'), Number(cell.dataset.col ?? '0'))
    })
    table.addEventListener('click', (event) => {
      if (!(event.target instanceof HTMLElement)) return
      const cell = event.target.closest<HTMLTableCellElement>('th, td')
      if (!cell) return
      event.preventDefault()
      event.stopPropagation()
      const row = Number(cell.dataset.row ?? '-1')
      const column = Number(cell.dataset.col ?? '0')
      this.openPanel(view, row, column)
    })
    return table
  }

  private createColResizer(view: EditorView, table: HTMLTableElement, column: number): HTMLElement {
    const handle = document.createElement('span')
    handle.className = 'cm-table-col-resizer'
    handle.title = '拖动调整列宽'
    handle.addEventListener('mousedown', (event) => this.startColumnResize(view, table, column, event))
    handle.addEventListener('click', (event) => event.stopPropagation())
    return handle
  }

  private createRowResizer(view: EditorView, table: HTMLTableElement, row: number): HTMLElement {
    const handle = document.createElement('span')
    handle.className = 'cm-table-row-resizer'
    handle.title = '拖动调整行高'
    handle.addEventListener('mousedown', (event) => this.startRowResize(view, table, row, event))
    handle.addEventListener('click', (event) => event.stopPropagation())
    return handle
  }

  private applySizes(table: HTMLTableElement): void {
    if (this.columnWidths && this.columnWidths.length !== this.model.header.length) {
      this.columnWidths = null
    }
    if (this.rowHeights && this.rowHeights.length !== table.rows.length) {
      this.rowHeights = null
    }
    const cols = table.querySelectorAll('col')
    if (this.columnWidths) {
      table.style.tableLayout = 'fixed'
      table.style.width = `${this.columnWidths.reduce((sum, width) => sum + width, 0)}px`
      cols.forEach((col, index) => {
        col.style.width = `${this.columnWidths![index]}px`
      })
    } else {
      table.style.tableLayout = 'auto'
      table.style.width = '100%'
      cols.forEach((col) => {
        col.style.width = ''
      })
    }
    Array.from(table.rows).forEach((row, index) => {
      const height = this.rowHeights?.[index]
      row.style.height = height ? `${height}px` : ''
    })
  }

  private startColumnResize(
    view: EditorView,
    table: HTMLTableElement,
    column: number,
    event: MouseEvent
  ): void {
    event.preventDefault()
    event.stopPropagation()
    const header = table.rows[0]
    if (!header) return
    if (!this.columnWidths || this.columnWidths.length !== this.model.header.length) {
      this.columnWidths = Array.from(header.cells).map((cell) =>
        Math.max(60, Math.round(cell.getBoundingClientRect().width))
      )
      this.applySizes(table)
    }
    const startX = event.clientX
    const start = this.columnWidths.slice()
    const move = (moveEvent: MouseEvent): void => {
      if (!this.columnWidths) return
      this.columnWidths[column] = Math.min(900, Math.max(60, start[column] + moveEvent.clientX - startX))
      this.applySizes(table)
    }
    const up = (): void => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      document.body.classList.remove('cm-table-resizing')
      view.requestMeasure()
    }
    document.body.classList.add('cm-table-resizing')
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  private startRowResize(
    view: EditorView,
    table: HTMLTableElement,
    row: number,
    event: MouseEvent
  ): void {
    event.preventDefault()
    event.stopPropagation()
    if (!this.rowHeights || this.rowHeights.length !== table.rows.length) {
      this.rowHeights = Array.from(table.rows).map((item) =>
        Math.max(24, Math.round(item.getBoundingClientRect().height))
      )
      this.applySizes(table)
    }
    const startY = event.clientY
    const start = this.rowHeights.slice()
    const move = (moveEvent: MouseEvent): void => {
      if (!this.rowHeights) return
      this.rowHeights[row] = Math.min(600, Math.max(24, start[row] + moveEvent.clientY - startY))
      this.applySizes(table)
    }
    const up = (): void => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      document.body.classList.remove('cm-table-resizing')
      view.requestMeasure()
    }
    document.body.classList.add('cm-table-resizing')
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  private openTableMenu(view: EditorView, event: MouseEvent, row: number, column: number): void {
    this.closeTableMenu()
    if (this.panel) this.syncFromInputs()
    const menu = document.createElement('div')
    menu.className = 'cm-table-context-menu'
    menu.setAttribute('role', 'menu')
    const bodyRow = row >= 0 ? row : 0
    const add = (label: string, shortcut: string, action: () => void, disabled = false): void => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'cm-table-context-item'
      button.disabled = disabled
      const text = document.createElement('span')
      text.textContent = label
      button.appendChild(text)
      if (shortcut) {
        const hint = document.createElement('span')
        hint.className = 'cm-table-context-shortcut'
        hint.textContent = shortcut
        button.appendChild(hint)
      }
      button.addEventListener('click', (clickEvent) => {
        clickEvent.preventDefault()
        clickEvent.stopPropagation()
        if (disabled) return
        action()
        this.closeTableMenu()
      })
      menu.appendChild(button)
    }
    const separator = (): void => {
      const line = document.createElement('div')
      line.className = 'cm-table-context-separator'
      menu.appendChild(line)
    }
    add('上方插入行', 'Ctrl+Enter', () => this.commitTable(view, addRow(this.model, bodyRow)))
    add('下方插入行', '', () => this.commitTable(view, addRow(this.model, bodyRow + 1)))
    add('左侧插入列', '', () => this.commitTable(view, addColumn(this.model, column)))
    add('右侧插入列', '', () => this.commitTable(view, addColumn(this.model, column + 1)))
    separator()
    add('上移该行', 'Alt+↑', () => this.commitTable(view, moveRow(this.model, row, row - 1)), row <= 0)
    add('下移该行', 'Alt+↓', () => this.commitTable(view, moveRow(this.model, row, row + 1)), row < 0 || row >= this.model.rows.length - 1)
    add('左移该列', 'Alt+←', () => this.commitTable(view, moveColumn(this.model, column, column - 1)), column <= 0)
    add('右移该列', 'Alt+→', () => this.commitTable(view, moveColumn(this.model, column, column + 1)), column >= this.model.header.length - 1)
    separator()
    add('删除行', 'Ctrl+Shift+⌫', () => this.commitTable(view, removeRow(this.model, row)), row < 0)
    add('删除列', '', () => this.commitTable(view, removeColumn(this.model, column)), this.model.header.length <= 1)
    separator()
    add('复制表格', '', () => { void window.api.clipboard.writeText(serializeTable(this.model)) })
    add('格式化表格源码', '', () => this.commitTable(view, this.model))
    separator()
    add('删除表格', '', () => this.removeTable(view))
    document.body.appendChild(menu)
    const rect = menu.getBoundingClientRect()
    const left = Math.max(8, Math.min(event.clientX, window.innerWidth - rect.width - 8))
    const top = Math.max(8, Math.min(event.clientY, window.innerHeight - rect.height - 8))
    menu.style.left = left + 'px'
    menu.style.top = top + 'px'
    const close = (closeEvent: MouseEvent): void => {
      if (!menu.contains(closeEvent.target as Node)) this.closeTableMenu()
    }
    const key = (keyEvent: KeyboardEvent): void => {
      if (keyEvent.key === 'Escape') this.closeTableMenu()
    }
    document.addEventListener('mousedown', close, true)
    document.addEventListener('keydown', key)
    this.contextCleanup = () => {
      document.removeEventListener('mousedown', close, true)
      document.removeEventListener('keydown', key)
    }
    this.contextMenu = menu
  }

  private commitTable(view: EditorView, model: TableModel): void {
    this.model = model
    const text = serializeTable(model)
    const max = view.state.doc.length
    const from = Math.min(Math.max(this.descriptor.from, 0), max)
    const to = Math.min(Math.max(this.descriptor.to, from), max)
    view.dispatch({ changes: { from, to, insert: text } })
  }

  private removeTable(view: EditorView): void {
    const max = view.state.doc.length
    const from = Math.min(Math.max(this.descriptor.from, 0), max)
    const to = Math.min(Math.max(this.descriptor.to, from), max)
    view.dispatch({ changes: { from, to, insert: '' } })
  }

  private closeTableMenu(): void {
    this.contextCleanup?.()
    this.contextCleanup = null
    this.contextMenu?.remove()
    this.contextMenu = null
  }

  private openPanel(view: EditorView, row: number, column: number): void {
    this.syncFromInputs()
    const rowIndex = clampInt(row, -1, this.model.rows.length - 1, -1)
    const columnIndex = clampInt(column, 0, this.model.header.length - 1, 0)
    this.renderPanel(view, { row: rowIndex, col: columnIndex })
  }

  private renderPanel(view: EditorView, focus?: { row: number; col: number }): void {
    this.closePanel()
    if (focus) {
      this.focusedRow = focus.row
      this.focusedCol = focus.col
    }

    const panel = document.createElement('div')
    panel.className = 'cm-table-panel'
    panel.addEventListener('mousedown', (event) => event.stopPropagation())
    panel.addEventListener('click', (event) => event.stopPropagation())
    panel.addEventListener('keydown', (event) => this.handlePanelKey(view, event))
    panel.addEventListener('focusin', (event) => this.handleFocus(event))

    const grid = document.createElement('div')
    grid.className = 'cm-table-panel-grid'
    grid.style.gridTemplateColumns = `repeat(${Math.max(1, this.model.header.length)}, minmax(110px, 1fr))`
    this.model.header.forEach((value, column) => {
      grid.appendChild(this.createInput(value, -1, column, true))
    })
    this.model.rows.forEach((row, rowIndex) => {
      row.forEach((value, column) => {
        grid.appendChild(this.createInput(value, rowIndex, column, false))
      })
    })

    const actions = document.createElement('div')
    actions.className = 'cm-table-panel-actions'
    actions.appendChild(this.createButton('bi-plus-lg', '添加行', () => this.handleAddRow(view)))
    actions.appendChild(this.createButton('bi-dash-lg', '删除行', () => this.handleRemoveRow(view)))
    actions.appendChild(this.createButton('bi-plus-lg', '添加列', () => this.handleAddColumn(view)))
    actions.appendChild(this.createButton('bi-dash-lg', '删除列', () => this.handleRemoveColumn(view)))
    actions.appendChild(this.createButton('bi-text-left', '左对齐', () => this.handleAlign(view, 'left')))
    actions.appendChild(this.createButton('bi-text-center', '居中', () => this.handleAlign(view, 'center')))
    actions.appendChild(this.createButton('bi-text-right', '右对齐', () => this.handleAlign(view, 'right')))
    actions.appendChild(
      this.createButton('bi-check-lg', '应用', () => this.apply(view), 'cm-table-btn-primary')
    )
    actions.appendChild(this.createButton('bi-x-lg', '取消', () => this.cancel(view)))

    panel.append(grid, actions)
    this.panel = panel
    this.container?.appendChild(panel)
    this.container?.classList.add('cm-table-editing')
    view.requestMeasure()
    if (focus) this.focusInput(focus.row, focus.col)
  }

  private createInput(
    value: string,
    row: number,
    column: number,
    header: boolean
  ): HTMLInputElement {
    const input = document.createElement('input')
    input.type = 'text'
    input.className = header
      ? 'cm-table-panel-input cm-table-panel-input-header'
      : 'cm-table-panel-input'
    input.value = value
    input.dataset.row = String(row)
    input.dataset.col = String(column)
    input.setAttribute(
      'aria-label',
      header ? `表头 ${column + 1}` : `第 ${row + 1} 行第 ${column + 1} 列`
    )
    return input
  }

  private createButton(
    icon: string,
    label: string,
    action: () => void,
    extraClass?: string
  ): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = extraClass ? `cm-table-btn ${extraClass}` : 'cm-table-btn'
    applyIconButton(button, icon, label)
    button.addEventListener('mousedown', (event) => event.preventDefault())
    button.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      action()
    })
    return button
  }

  private handlePanelKey(view: EditorView, event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      this.cancel(view)
      return
    }
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
      event.preventDefault()
      this.apply(view)
    }
  }

  private handleFocus(event: FocusEvent): void {
    const target = event.target
    if (!(target instanceof HTMLInputElement)) return
    if (!target.classList.contains('cm-table-panel-input')) return
    const row = Number(target.dataset.row)
    const column = Number(target.dataset.col)
    if (Number.isInteger(row)) this.focusedRow = row
    if (Number.isInteger(column)) this.focusedCol = column
  }

  private handleAddRow(view: EditorView): void {
    this.syncFromInputs()
    const index = this.focusedRow >= 0 ? this.focusedRow + 1 : this.model.rows.length
    this.model = addRow(this.model, index)
    this.refreshPreview(view)
    this.renderPanel(view, { row: index, col: this.focusedCol })
  }

  private handleRemoveRow(view: EditorView): void {
    this.syncFromInputs()
    if (this.model.rows.length === 0) {
      this.renderPanel(view)
      return
    }
    const index =
      this.focusedRow >= 0
        ? Math.min(this.focusedRow, this.model.rows.length - 1)
        : this.model.rows.length - 1
    this.model = removeRow(this.model, index)
    this.refreshPreview(view)
    const row = this.model.rows.length === 0 ? -1 : Math.min(index, this.model.rows.length - 1)
    this.renderPanel(view, { row, col: this.focusedCol })
  }

  private handleAddColumn(view: EditorView): void {
    this.syncFromInputs()
    const index = this.focusedCol + 1
    this.model = addColumn(this.model, index)
    this.refreshPreview(view)
    this.renderPanel(view, { row: this.focusedRow, col: index })
  }

  private handleRemoveColumn(view: EditorView): void {
    this.syncFromInputs()
    if (this.model.header.length <= 1) {
      this.renderPanel(view)
      return
    }
    const index = clampInt(this.focusedCol, 0, this.model.header.length - 1, 0)
    this.model = removeColumn(this.model, index)
    this.refreshPreview(view)
    const column = Math.min(index, this.model.header.length - 1)
    this.renderPanel(view, { row: this.focusedRow, col: column })
  }

  private handleAlign(view: EditorView, alignment: TableAlignment): void {
    this.syncFromInputs()
    const column = clampInt(this.focusedCol, 0, this.model.header.length - 1, 0)
    const alignments = this.model.alignments.slice()
    alignments[column] = alignment
    this.model = { ...this.model, alignments }
    this.refreshPreview(view)
    this.renderPanel(view, { row: this.focusedRow, col: column })
  }

  private syncFromInputs(): void {
    if (!this.panel) return
    const inputs = this.panel.querySelectorAll<HTMLInputElement>('input.cm-table-panel-input')
    let model = this.model
    inputs.forEach((input) => {
      const row = Number(input.dataset.row)
      const column = Number(input.dataset.col)
      if (!Number.isInteger(row) || !Number.isInteger(column)) return
      model = setCell(model, row, column, input.value)
    })
    this.model = model
  }

  private refreshPreview(view: EditorView): void {
    if (!this.tableHost) return
    this.tableHost.replaceChildren(this.renderTable(view))
  }

  private focusInput(row: number, column: number): void {
    const panel = this.panel
    if (!panel) return
    const target = panel.querySelector<HTMLInputElement>(
      `input.cm-table-panel-input[data-row="${row}"][data-col="${column}"]`
    )
    const input = target ?? panel.querySelector<HTMLInputElement>('input.cm-table-panel-input')
    input?.focus()
  }

  private apply(view: EditorView): void {
    this.syncFromInputs()
    const text = serializeTable(this.model)
    const max = view.state.doc.length
    const from = Math.min(Math.max(this.descriptor.from, 0), max)
    const to = Math.min(Math.max(this.descriptor.to, from), max)
    this.closePanel()
    view.dispatch({ changes: { from, to, insert: text } })
  }

  private cancel(view: EditorView): void {
    this.model = parseTable(this.descriptor.content) ?? emptyModel()
    this.closePanel()
    this.refreshPreview(view)
    view.requestMeasure()
  }

  private closePanel(): void {
    this.panel?.remove()
    this.panel = null
    this.container?.classList.remove('cm-table-editing')
  }
}

export const createTableWidget: BlockWidgetFactory = (descriptor) => new TableWidget(descriptor)
