import { describe, expect, it } from 'vitest'
import {
  addColumn,
  addRow,
  cycleAlign,
  escapeCell,
  moveColumn,
  moveRow,
  parseTable,
  removeColumn,
  removeRow,
  serializeTable,
  setCell,
  type TableModel
} from '../src/renderer/src/editor/blocks/tableModel'

function parse(markdown: string): TableModel {
  const model = parseTable(markdown)
  if (!model) throw new Error(`Expected a table: ${markdown}`)
  return model
}

function sample(): TableModel {
  return {
    header: ['Name', 'Age'],
    alignments: ['none', 'right'],
    rows: [
      ['Alice', '30'],
      ['Bob', '25']
    ]
  }
}

describe('parseTable', () => {
  it('parses a basic table with optional outer pipes', () => {
    const model = parse('Name | Age\n--- | ---\nAlice | 30\nBob | 25')
    expect(model.header).toEqual(['Name', 'Age'])
    expect(model.alignments).toEqual(['none', 'none'])
    expect(model.rows).toEqual([
      ['Alice', '30'],
      ['Bob', '25']
    ])
  })

  it('parses leading and trailing pipes and trims cells', () => {
    const model = parse('|  Name  | Age |\n| --- | --- |\n|  Alice  |  30  |')
    expect(model.header).toEqual(['Name', 'Age'])
    expect(model.rows).toEqual([['Alice', '30']])
  })

  it('parses alignment markers', () => {
    const model = parse('| a | b | c | d |\n| :--- | :---: | ---: | --- |\n| 1 | 2 | 3 | 4 |')
    expect(model.alignments).toEqual(['left', 'center', 'right', 'none'])
  })

  it('parses two-hyphen delimiter cells', () => {
    const model = parse('a | b | c\n:-- | :-: | --:\n1 | 2 | 3')
    expect(model.alignments).toEqual(['left', 'center', 'right'])
  })

  it('supports escaped pipes inside cells', () => {
    const model = parse('| a \\| b | c |\n| --- | --- |\n| d \\| e | f |')
    expect(model.header).toEqual(['a | b', 'c'])
    expect(model.rows).toEqual([['d | e', 'f']])
  })

  it('pads short body rows and drops extra cells', () => {
    const model = parse('| a | b |\n| --- | --- |\n| 1 |\n| 2 | 3 | 4 |')
    expect(model.rows).toEqual([
      ['1', ''],
      ['2', '3']
    ])
  })

  it('accepts a table without body rows', () => {
    const model = parse('| a | b |\n| --- | :---: |')
    expect(model.header).toEqual(['a', 'b'])
    expect(model.rows).toEqual([])
  })

  it('parses CRLF input and surrounding blank lines', () => {
    const model = parse('\r\n| a | b |\r\n| --- | --- |\r\n| 1 | 2 |\r\n')
    expect(model.header).toEqual(['a', 'b'])
    expect(model.rows).toEqual([['1', '2']])
  })

  it('stops body parsing at a blank line', () => {
    const model = parse('| a |\n| --- |\n| 1 |\n\nnot a row')
    expect(model.rows).toEqual([['1']])
  })
})

describe('malformed tables', () => {
  it('returns null for empty or single-line input', () => {
    expect(parseTable('')).toBeNull()
    expect(parseTable('a | b')).toBeNull()
  })

  it('returns null when the delimiter row is invalid', () => {
    expect(parseTable('a | b\nxx | yy')).toBeNull()
    expect(parseTable('a | b\n: | :')).toBeNull()
    expect(parseTable('a | b\n--- | -:-')).toBeNull()
  })

  it('returns null when header and delimiter widths differ', () => {
    expect(parseTable('a | b | c\n--- | ---')).toBeNull()
    expect(parseTable('a\n--- | ---')).toBeNull()
  })
})

describe('serializeTable', () => {
  it('round-trips a parsed model', () => {
    const source = '| Name | Age |\n| --- | ---: |\n| Alice | 30 |\n| Bob | 25 |'
    const model = parse(source)
    const text = serializeTable(model)
    expect(parseTable(text)).toEqual(model)
    expect(text.split('\n')).toHaveLength(4)
  })

  it('produces consistent leading and trailing pipes', () => {
    const text = serializeTable(sample())
    const lines = text.split('\n')
    expect(lines).toHaveLength(4)
    for (const line of lines) {
      expect(line.startsWith('| ')).toBe(true)
      expect(line.endsWith(' |')).toBe(true)
    }
  })

  it('serializes alignment markers', () => {
    const model: TableModel = {
      header: ['l', 'c', 'r', 'n'],
      alignments: ['left', 'center', 'right', 'none'],
      rows: []
    }
    const lines = serializeTable(model).split('\n')
    expect(lines[1]).toContain(':---')
    expect(lines[1]).toContain(':---:')
    expect(lines[1]).toContain('---:')
    expect(parseTable(serializeTable(model))?.alignments).toEqual(model.alignments)
  })

  it('escapes pipes when serializing', () => {
    const model: TableModel = {
      header: ['a | b', 'c'],
      alignments: ['none', 'none'],
      rows: [['d | e', 'f']]
    }
    const text = serializeTable(model)
    expect(text).toContain('a \\| b')
    expect(text).toContain('d \\| e')
    expect(parseTable(text)).toEqual(model)
  })

  it('always writes a header and delimiter, even without body rows', () => {
    const text = serializeTable({ header: ['a', 'b'], alignments: ['none', 'none'], rows: [] })
    expect(text.split('\n')).toHaveLength(2)
    expect(parseTable(text)?.rows).toEqual([])
  })

  it('handles a completely empty model', () => {
    const text = serializeTable({ header: [], alignments: [], rows: [] })
    expect(text.split('\n')).toHaveLength(2)
    const model = parseTable(text)
    expect(model).not.toBeNull()
    expect(model?.header).toEqual([''])
    expect(model?.rows).toEqual([])
  })
})

describe('escapeCell', () => {
  it('escapes pipes', () => {
    expect(escapeCell('a|b')).toBe('a\\|b')
    expect(escapeCell('|')).toBe('\\|')
  })

  it('trims and flattens newlines', () => {
    expect(escapeCell('  a  ')).toBe('a')
    expect(escapeCell('a\nb')).toBe('a b')
    expect(escapeCell('a\r\nb')).toBe('a b')
  })

  it('leaves ordinary backslashes alone', () => {
    expect(escapeCell('a\\b')).toBe('a\\b')
  })
})

describe('row operations', () => {
  it('adds a row at the end by default', () => {
    const model = sample()
    const next = addRow(model)
    expect(next.rows).toHaveLength(3)
    expect(next.rows[2]).toEqual(['', ''])
    expect(model.rows).toHaveLength(2)
  })

  it('adds a row at an index and clamps the index', () => {
    const model = sample()
    expect(addRow(model, 0).rows[0]).toEqual(['', ''])
    expect(addRow(model, 99).rows[2]).toEqual(['', ''])
  })

  it('does not share row arrays with the source model', () => {
    const model = sample()
    const next = addRow(model, 0)
    next.rows[1][0] = 'changed'
    expect(model.rows[0][0]).toBe('Alice')
  })

  it('removes a row without mutating the source', () => {
    const model = sample()
    const next = removeRow(model, 0)
    expect(next.rows).toEqual([['Bob', '25']])
    expect(model.rows).toHaveLength(2)
  })

  it('ignores out-of-range row removal', () => {
    const model = sample()
    expect(removeRow(model, -1)).toBe(model)
    expect(removeRow(model, 9)).toBe(model)
  })
})

describe('column operations', () => {
  it('adds a column at the end by default', () => {
    const model = sample()
    const next = addColumn(model)
    expect(next.header).toEqual(['Name', 'Age', ''])
    expect(next.alignments).toEqual(['none', 'right', 'none'])
    expect(next.rows).toEqual([
      ['Alice', '30', ''],
      ['Bob', '25', '']
    ])
    expect(model.header).toHaveLength(2)
  })

  it('adds a column at an index', () => {
    const next = addColumn(sample(), 0)
    expect(next.header).toEqual(['', 'Name', 'Age'])
    expect(next.rows[0]).toEqual(['', 'Alice', '30'])
    expect(next.alignments).toEqual(['none', 'none', 'right'])
  })

  it('adds a column to a model without rows', () => {
    const model: TableModel = { header: ['a'], alignments: ['none'], rows: [] }
    expect(addColumn(model).header).toEqual(['a', ''])
  })

  it('removes a column from header, alignments and rows', () => {
    const next = removeColumn(sample(), 1)
    expect(next.header).toEqual(['Name'])
    expect(next.alignments).toEqual(['none'])
    expect(next.rows).toEqual([['Alice'], ['Bob']])
  })

  it('does not remove the last column or invalid columns', () => {
    const single: TableModel = { header: ['a'], alignments: ['none'], rows: [['1']] }
    expect(removeColumn(single, 0)).toBe(single)
    const model = sample()
    expect(removeColumn(model, 5)).toBe(model)
    expect(removeColumn(model, -1)).toBe(model)
  })
})

describe('setCell', () => {
  it('sets header cells with row -1', () => {
    const model = sample()
    const next = setCell(model, -1, 0, '  Title  ')
    expect(next.header).toEqual(['Title', 'Age'])
    expect(model.header).toEqual(['Name', 'Age'])
  })

  it('sets body cells and trims the value', () => {
    const next = setCell(sample(), 1, 1, ' 99 ')
    expect(next.rows[1]).toEqual(['Bob', '99'])
  })

  it('ignores invalid rows and columns', () => {
    const model = sample()
    expect(setCell(model, 0, 5, 'x')).toBe(model)
    expect(setCell(model, 0, -1, 'x')).toBe(model)
    expect(setCell(model, 5, 0, 'x')).toBe(model)
    expect(setCell(model, -2, 0, 'x')).toBe(model)
  })
})

describe('cycleAlign', () => {
  it('cycles none, left, center, right and back', () => {
    let model = sample()
    model = cycleAlign(model, 0)
    expect(model.alignments[0]).toBe('left')
    model = cycleAlign(model, 0)
    expect(model.alignments[0]).toBe('center')
    model = cycleAlign(model, 0)
    expect(model.alignments[0]).toBe('right')
    model = cycleAlign(model, 0)
    expect(model.alignments[0]).toBe('none')
  })

  it('does not mutate the source model', () => {
    const model = sample()
    const next = cycleAlign(model, 0)
    expect(model.alignments[0]).toBe('none')
    expect(next.alignments[0]).toBe('left')
  })

  it('ignores an invalid column', () => {
    const model = sample()
    expect(cycleAlign(model, 5)).toBe(model)
    expect(cycleAlign(model, -1)).toBe(model)
  })
})

describe('moveRow', () => {
  it('moves a body row without mutating the source', () => {
    const model = sample()
    const next = moveRow(model, 0, 1)
    expect(next.rows).toEqual([
      ['Bob', '25'],
      ['Alice', '30']
    ])
    expect(model.rows[0]).toEqual(['Alice', '30'])
  })

  it('ignores invalid row moves', () => {
    const model = sample()
    expect(moveRow(model, -1, 0)).toBe(model)
    expect(moveRow(model, 0, 5)).toBe(model)
  })
})

describe('moveColumn', () => {
  it('moves header, alignments, and cells together', () => {
    const model = sample()
    const next = moveColumn(model, 0, 1)
    expect(next.header).toEqual(['Age', 'Name'])
    expect(next.alignments).toEqual(['right', 'none'])
    expect(next.rows[0]).toEqual(['30', 'Alice'])
  })

  it('ignores invalid column moves', () => {
    const model = sample()
    expect(moveColumn(model, -1, 0)).toBe(model)
    expect(moveColumn(model, 0, 5)).toBe(model)
  })
})
