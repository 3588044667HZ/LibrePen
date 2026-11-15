import { describe, expect, it } from 'vitest'
import {
  applyHeadingLine,
  insertLink,
  insertTableSnippet,
  lineRangeForSelection,
  stripBom,
  toggleBlockPrefix,
  wrapInline,
  type BlockPrefix
} from '../src/shared/markdown'

function toggle(doc: string, prefix: BlockPrefix) {
  return toggleBlockPrefix(doc, 0, doc.length, prefix)
}

describe('lineRangeForSelection', () => {
  it('expands a selection to whole lines', () => {
    expect(lineRangeForSelection('abc\ndef\nghi', 1, 4)).toEqual({ start: 0, end: 7 })
  })

  it('handles a collapsed cursor inside a line', () => {
    expect(lineRangeForSelection('abc\ndef\nghi', 5, 5)).toEqual({ start: 4, end: 7 })
  })

  it('handles the last line without a trailing newline', () => {
    expect(lineRangeForSelection('abc', 1, 3)).toEqual({ start: 0, end: 3 })
    expect(lineRangeForSelection('a\nb', 2, 2)).toEqual({ start: 2, end: 3 })
  })
})

describe('toggleBlockPrefix headings', () => {
  it('applies heading levels to every selected line', () => {
    expect(toggle('a\nb', 'heading1').doc).toBe('# a\n# b')
    expect(toggle('a', 'heading6').doc).toBe('###### a')
  })

  it('replaces an existing heading level', () => {
    expect(toggle('# a', 'heading2').doc).toBe('## a')
    expect(toggle('  # a', 'heading2').doc).toBe('## a')
  })

  it('toggles off when every line already has the level', () => {
    expect(toggle('# a\n# b', 'heading1').doc).toBe('a\nb')
    expect(toggle('### a\n### b', 'heading3').doc).toBe('a\nb')
  })

  it('normalizes mixed heading levels instead of removing them', () => {
    expect(toggle('# a\n## b', 'heading1').doc).toBe('# a\n# b')
  })

  it('removes any heading with level zero', () => {
    expect(toggle('## a\n### b', 'heading0').doc).toBe('a\nb')
    expect(toggle('a\nb', 'heading0').doc).toBe('a\nb')
  })

  it('returns the full block range', () => {
    const result = toggle('a\nb', 'heading1')
    expect(result.from).toBe(0)
    expect(result.to).toBe(result.doc.length)
  })
})

describe('toggleBlockPrefix quote', () => {
  it('adds a quote marker to each non-empty line', () => {
    expect(toggle('a\nb', 'quote').doc).toBe('> a\n> b')
    expect(toggle('a\n\nb', 'quote').doc).toBe('> a\n\n> b')
  })

  it('strips leading indentation when adding a quote', () => {
    expect(toggle('  a\n b', 'quote').doc).toBe('> a\n> b')
  })

  it('removes the quote marker when all lines are quoted', () => {
    expect(toggle('> a\n> b', 'quote').doc).toBe('a\nb')
    expect(toggle('>no space', 'quote').doc).toBe('no space')
    expect(toggle(' > a', 'quote').doc).toBe('a')
  })
})

describe('toggleBlockPrefix lists', () => {
  it('adds and removes bullet markers', () => {
    expect(toggle('a\n  b', 'bullet').doc).toBe('- a\n  - b')
    expect(toggle('- a\n* b\n+ c', 'bullet').doc).toBe('a\nb\nc')
  })

  it('preserves blank lines when toggling bullets', () => {
    expect(toggle('- a\n\n- b', 'bullet').doc).toBe('a\n\nb')
  })

  it('adds and removes ordered markers', () => {
    expect(toggle('a\n  b', 'ordered').doc).toBe('1. a\n  1. b')
    expect(toggle('1. a\n2) b\n10. c', 'ordered').doc).toBe('a\nb\nc')
    expect(toggle('3. a', 'ordered').doc).toBe('a')
  })

  it('adds and removes task markers', () => {
    expect(toggle('a\n  b', 'task').doc).toBe('- [ ] a\n  - [ ] b')
    expect(toggle('- [ ] a\n- [x] b\n* [X] c', 'task').doc).toBe('a\nb\nc')
  })

  it('only rewrites the selected lines', () => {
    const doc = 'one\ntwo\nthree'
    const result = toggleBlockPrefix(doc, 5, 10, 'bullet')
    expect(result.doc).toBe('one\n- two\n- three')
    expect(result.from).toBe(4)
    expect(result.to).toBe(result.doc.length)
  })
})

describe('applyHeadingLine', () => {
  it('adds, replaces and removes heading markers', () => {
    expect(applyHeadingLine('A', 1)).toBe('# A')
    expect(applyHeadingLine('# A', 2)).toBe('## A')
    expect(applyHeadingLine('  ### A', 1)).toBe('# A')
    expect(applyHeadingLine('## A', 0)).toBe('A')
    expect(applyHeadingLine('A', 0)).toBe('A')
  })

  it('keeps the requested level when it already matches', () => {
    expect(applyHeadingLine('###### A', 6)).toBe('###### A')
  })
})

describe('wrapInline', () => {
  it('wraps an empty selection with a placeholder and selects it', () => {
    expect(wrapInline('', 0, 0, '**')).toEqual({ doc: '**text**', from: 2, to: 6 })
    expect(wrapInline('', 0, 0, '**', 'link')).toEqual({ doc: '**link**', from: 2, to: 6 })
  })

  it('wraps a selected range', () => {
    expect(wrapInline('hello', 0, 5, '**')).toEqual({
      doc: '**hello**',
      from: 2,
      to: 7
    })
    expect(wrapInline('hello', 1, 4, '**')).toEqual({
      doc: 'h**ell**o',
      from: 3,
      to: 6
    })
  })

  it('toggles existing markers off', () => {
    expect(wrapInline('**hello**', 2, 7, '**')).toEqual({
      doc: 'hello',
      from: 0,
      to: 5
    })
    expect(wrapInline('__hello__', 2, 7, '__')).toEqual({
      doc: 'hello',
      from: 0,
      to: 5
    })
    expect(wrapInline('*em*', 1, 3, '*')).toEqual({ doc: 'em', from: 0, to: 2 })
  })

  it('leaves surrounding text intact when unwrapping', () => {
    expect(wrapInline('a **b** c', 4, 5, '**')).toEqual({ doc: 'a b c', from: 2, to: 3 })
  })

  it('wraps a selection that already includes markers again', () => {
    expect(wrapInline('**hello**', 0, 9, '**')).toEqual({
      doc: '****hello****',
      from: 2,
      to: 11
    })
  })

  it('handles nested markers when the outer pair surrounds the selection', () => {
    expect(wrapInline('**a *b* c**', 2, 9, '**')).toEqual({
      doc: 'a *b* c',
      from: 0,
      to: 7
    })
  })

  it('wraps a collapsed cursor with the placeholder', () => {
    expect(wrapInline('hello', 2, 2, '*')).toEqual({ doc: 'he*text*llo', from: 3, to: 7 })
  })
})

describe('insertLink', () => {
  it('inserts a placeholder link and selects the url', () => {
    const result = insertLink('hello', 2, 2)
    expect(result.doc).toBe('he[text](url)llo')
    expect(result.doc.slice(result.from, result.to)).toBe('url')
    expect(result.from).toBe(9)
  })

  it('uses the selection as the link label', () => {
    const result = insertLink('hello', 0, 5, 'https://example.com')
    expect(result.doc).toBe('[hello](https://example.com)')
    expect(result.from).toBe(8)
    expect(result.doc.slice(result.from, result.to)).toBe('https://example.com')
  })

  it('wraps an existing link when the selection is a link', () => {
    const result = insertLink('[a](b)', 0, 6)
    expect(result.doc).toBe('[[a](b)](url)')
    expect(result.doc.slice(result.from, result.to)).toBe('url')
  })

  it('keeps surrounding text', () => {
    const result = insertLink('see hello!', 4, 9)
    expect(result.doc).toBe('see [hello](url)!')
    expect(result.doc.slice(result.from, result.to)).toBe('url')
  })

  it('uses a custom url for an empty selection', () => {
    const result = insertLink('', 0, 0, 'x')
    expect(result.doc).toBe('[text](x)')
    expect(result.doc.slice(result.from, result.to)).toBe('x')
  })
})

describe('insertTableSnippet', () => {
  it('inserts a table and selects the first cell', () => {
    const result = insertTableSnippet('abc', 1, 2)
    expect(result.doc).toBe(
      'a| Column 1 | Column 2 |\n| --- | --- |\n| Text | Text |c'
    )
    expect(result.cursorOffset).toBe(2)
    expect(result.from).toBe(3)
    expect(result.doc.slice(result.from, result.to)).toBe('Column 1')
  })
})

describe('stripBom', () => {
  it('removes a leading byte order mark', () => {
    expect(stripBom('\uFEFFhello')).toBe('hello')
  })

  it('leaves text without a BOM unchanged', () => {
    expect(stripBom('hello')).toBe('hello')
    expect(stripBom('')).toBe('')
  })
})
