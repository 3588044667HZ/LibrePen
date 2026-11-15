export type TableAlignment = 'none' | 'left' | 'center' | 'right'

export interface TableModel {
  header: string[]
  alignments: TableAlignment[]
  rows: string[][]
}

const DELIMITERS: Record<TableAlignment, string> = {
  none: '---',
  left: ':---',
  center: ':---:',
  right: '---:'
}

export function parseTable(markdown: string): TableModel | null {
  const lines = markdown
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())

  while (lines.length > 0 && lines[0] === '') lines.shift()
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  if (lines.length < 2) return null

  const header = splitRow(lines[0])
  const delimiter = splitRow(lines[1])
  if (header.length === 0 || delimiter.length !== header.length) return null

  const alignments: TableAlignment[] = []
  for (const cell of delimiter) {
    const match = /^(:?)(-+)(:?)$/.exec(cell)
    if (!match) return null
    if (match[1] && match[3]) alignments.push('center')
    else if (match[1]) alignments.push('left')
    else if (match[3]) alignments.push('right')
    else alignments.push('none')
  }

  const rows: string[][] = []
  for (let index = 2; index < lines.length; index++) {
    const line = lines[index]
    if (line === '') break
    const cells = splitRow(line)
    const row: string[] = []
    for (let column = 0; column < header.length; column++) {
      row.push(cells[column] ?? '')
    }
    rows.push(row)
  }

  return { header, alignments, rows }
}

export function serializeTable(model: TableModel): string {
  const width = Math.max(
    1,
    model.header.length,
    model.alignments.length,
    ...model.rows.map((row) => row.length)
  )
  const header: string[] = []
  for (let column = 0; column < width; column++) {
    header.push(escapeCell(model.header[column] ?? ''))
  }
  const alignments: TableAlignment[] = []
  const delimiters: string[] = []
  for (let column = 0; column < width; column++) {
    const alignment = model.alignments[column] ?? 'none'
    alignments.push(alignment)
    delimiters.push(DELIMITERS[alignment])
  }
  const rows = model.rows.map((row) => {
    const cells: string[] = []
    for (let column = 0; column < width; column++) {
      cells.push(escapeCell(row[column] ?? ''))
    }
    return cells
  })

  const widths: number[] = []
  for (let column = 0; column < width; column++) {
    let cellWidth = Math.max(header[column].length, delimiters[column].length)
    for (const row of rows) cellWidth = Math.max(cellWidth, row[column].length)
    widths.push(cellWidth)
  }

  const format = (cells: string[]): string =>
    `| ${cells.map((cell, column) => cell.padEnd(widths[column])).join(' | ')} |`

  return [format(header), format(delimiters), ...rows.map(format)].join('\n')
}

export function addRow(model: TableModel, at?: number): TableModel {
  const index = clampIndex(at ?? model.rows.length, 0, model.rows.length)
  const row = model.header.map(() => '')
  const rows = model.rows.map((cells) => cells.slice())
  rows.splice(index, 0, row)
  return { ...model, rows }
}

export function removeRow(model: TableModel, index: number): TableModel {
  if (!Number.isInteger(index) || index < 0 || index >= model.rows.length) return model
  const rows = model.rows.map((cells) => cells.slice())
  rows.splice(index, 1)
  return { ...model, rows }
}

export function addColumn(model: TableModel, at?: number): TableModel {
  const width = model.header.length
  const index = clampIndex(at ?? width, 0, width)
  const header = model.header.slice()
  header.splice(index, 0, '')
  const alignments = model.alignments.slice()
  alignments.splice(index, 0, 'none')
  const rows = model.rows.map((row) => {
    const cells = row.slice()
    cells.splice(index, 0, '')
    return cells
  })
  return { header, alignments, rows }
}

export function removeColumn(model: TableModel, index: number): TableModel {
  const width = model.header.length
  if (width <= 1) return model
  if (!Number.isInteger(index) || index < 0 || index >= width) return model
  const header = model.header.slice()
  header.splice(index, 1)
  const alignments = model.alignments.slice()
  alignments.splice(index, 1)
  const rows = model.rows.map((row) => {
    const cells = row.slice()
    cells.splice(index, 1)
    return cells
  })
  return { header, alignments, rows }
}

export function setCell(model: TableModel, row: number, col: number, value: string): TableModel {
  const width = model.header.length
  if (!Number.isInteger(col) || col < 0 || col >= width) return model
  if (!Number.isInteger(row)) return model
  const text = value.trim()
  if (row === -1) {
    const header = model.header.slice()
    header[col] = text
    return { ...model, header }
  }
  if (row < 0 || row >= model.rows.length) return model
  const rows = model.rows.map((cells, index) => {
    if (index !== row) return cells
    const next = cells.slice()
    next[col] = text
    return next
  })
  return { ...model, rows }
}

export function cycleAlign(model: TableModel, col: number): TableModel {
  if (!Number.isInteger(col) || col < 0 || col >= model.header.length) return model
  const current = model.alignments[col] ?? 'none'
  const next: TableAlignment =
    current === 'none'
      ? 'left'
      : current === 'left'
        ? 'center'
        : current === 'center'
          ? 'right'
          : 'none'
  const alignments = model.alignments.slice()
  alignments[col] = next
  return { ...model, alignments }
}

export function escapeCell(value: string): string {
  return value
    .trim()
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|')
}

function splitRow(line: string): string[] {
  const text = line.trim()
  if (text === '') return ['']
  const cells: string[] = []
  let current = ''
  let seenPipe = false
  let leadingPipe = false
  let trailingPipe = false

  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (char === '\\' && text[index + 1] === '|') {
      current += '|'
      trailingPipe = false
      index++
      continue
    }
    if (char === '|') {
      if (!seenPipe && current.trim() === '') leadingPipe = true
      cells.push(current)
      current = ''
      seenPipe = true
      trailingPipe = true
      continue
    }
    current += char
    trailingPipe = false
  }

  cells.push(current)
  if (leadingPipe) cells.shift()
  if (trailingPipe) cells.pop()
  return cells.map((cell) => cell.trim())
}

function clampIndex(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return max
  return Math.min(max, Math.max(min, Math.trunc(value)))
}
