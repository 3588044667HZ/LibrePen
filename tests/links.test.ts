import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import {
  findLinkAt,
  normalizeExternalLink,
  selectedLink
} from '../src/renderer/src/editor/links'

function state(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [markdown()] })
}

function positionOf(doc: string, needle: string, offset = 0): number {
  const index = doc.indexOf(needle)
  if (index < 0) throw new Error('needle not found')
  return index + offset
}

describe('link navigation', () => {
  it('normalizes external links and rejects unsafe protocols', () => {
    expect(normalizeExternalLink('<https://example.com>')).toBe('https://example.com')
    expect(normalizeExternalLink('mailto:test@example.com')).toBe('mailto:test@example.com')
    expect(normalizeExternalLink('file:///etc/passwd')).toBeNull()
    expect(normalizeExternalLink('javascript:alert(1)')).toBeNull()
  })

  it('finds an inline link when clicking its text', () => {
    const doc = 'Read [the docs](https://example.com/docs) now.'
    const editor = state(doc)
    const pos = positionOf(doc, 'the docs', 2)
    expect(findLinkAt(editor, pos)).toBe('https://example.com/docs')
  })

  it('finds a bare URL and strips trailing punctuation', () => {
    const doc = 'See https://example.com/docs, then continue.'
    const editor = state(doc)
    expect(findLinkAt(editor, positionOf(doc, 'example.com'))).toBe('https://example.com/docs')
  })

  it('finds a reference link definition', () => {
    const doc = '[docs][ref]\n\n[ref]: https://example.com/ref\n'
    const editor = state(doc)
    expect(findLinkAt(editor, positionOf(doc, 'docs'))).toBe('https://example.com/ref')
  })

  it('uses selected URL when no link is under the pointer', () => {
    const doc = 'Selected: https://example.com/selected'
    const editor = EditorState.create({
      doc,
      selection: { anchor: positionOf(doc, 'https://example.com/selected'), head: doc.length },
      extensions: [markdown()]
    })
    expect(selectedLink(editor)).toBe('https://example.com/selected')
  })
})
