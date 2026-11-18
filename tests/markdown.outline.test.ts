import { describe, expect, it } from 'vitest'
import { extractOutline, slugify, stripInlineMarkdown } from '../src/shared/markdown'

describe('slugify', () => {
  it('lowercases and hyphenates latin headings', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })

  it('keeps unicode letters and CJK characters', () => {
    expect(slugify('中文 标题')).toBe('中文-标题')
    expect(slugify('Café Déjà')).toBe('café-déjà')
  })

  it('removes html tags and punctuation', () => {
    expect(slugify('<b>Hi!</b>')).toBe('hi')
    expect(slugify('C++')).toBe('c')
  })

  it('collapses repeated whitespace', () => {
    expect(slugify('  Hello   World  ')).toBe('hello-world')
  })

  it('falls back to section when nothing remains', () => {
    expect(slugify('!!!')).toBe('section')
    expect(slugify('   ')).toBe('section')
  })
})

describe('stripInlineMarkdown', () => {
  it('unwraps images and links', () => {
    expect(stripInlineMarkdown('![alt text](img.png)')).toBe('alt text')
    expect(stripInlineMarkdown('[label](https://example.com)')).toBe('label')
    expect(stripInlineMarkdown('[label][ref]')).toBe('label')
  })

  it('unwraps emphasis, code, strike and highlight', () => {
    expect(stripInlineMarkdown('`code`')).toBe('code')
    expect(stripInlineMarkdown('**bold** and __strong__')).toBe('bold and strong')
    expect(stripInlineMarkdown('*em* and _em_')).toBe('em and em')
    expect(stripInlineMarkdown('~~strike~~ ==mark==')).toBe('strike mark')
  })

  it('strips html tags but keeps their text', () => {
    expect(stripInlineMarkdown('<span class="x">text</span>')).toBe('text')
  })

  it('unescapes markdown escapes and trims', () => {
    expect(stripInlineMarkdown('\\*')).toBe('*')
    expect(stripInlineMarkdown('  padded  ')).toBe('padded')
  })

  it('handles nested inline syntax', () => {
    expect(stripInlineMarkdown('[**Bold** link](url)')).toBe('Bold link')
  })
})

describe('extractOutline', () => {
  it('extracts ATX headings at every level', () => {
    const doc = '# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6'
    expect(extractOutline(doc)).toEqual([
      { level: 1, text: 'H1', line: 0, id: 'h1' },
      { level: 2, text: 'H2', line: 1, id: 'h2' },
      { level: 3, text: 'H3', line: 2, id: 'h3' },
      { level: 4, text: 'H4', line: 3, id: 'h4' },
      { level: 5, text: 'H5', line: 4, id: 'h5' },
      { level: 6, text: 'H6', line: 5, id: 'h6' }
    ])
  })

  it('accepts up to three spaces of ATX indentation and rejects deeper indentation', () => {
    expect(extractOutline('   # Indented')).toHaveLength(1)
    expect(extractOutline('    # Too deep')).toHaveLength(0)
  })

  it('ignores seven hashes and headings without text', () => {
    expect(extractOutline('####### Nope')).toEqual([])
    expect(extractOutline('#')).toEqual([])
    expect(extractOutline('###')).toEqual([])
  })

  it('strips closing hashes and inline markup from heading text', () => {
    const items = extractOutline('# Title ###\n## **Bold** [link](url) `code`')
    expect(items.map((item) => item.text)).toEqual(['Title', 'Bold link code'])
    expect(items.map((item) => item.id)).toEqual(['title', 'bold-link-code'])
  })

  it('extracts setext headings with equality and dash underlines', () => {
    const items = extractOutline('Title\n=====\nSub\n-----')
    expect(items).toEqual([
      { level: 1, text: 'Title', line: 0, id: 'title' },
      { level: 2, text: 'Sub', line: 2, id: 'sub' }
    ])
  })

  it('allows setext underlines indented up to three spaces', () => {
    expect(extractOutline('Title\n   ===')).toHaveLength(1)
  })

  it('does not treat list items followed by a rule as setext headings', () => {
    expect(extractOutline('- item\n---')).toEqual([])
  })

  it('ignores hash lines inside backtick and tilde fences', () => {
    expect(extractOutline('```\n# fake\n```\n# real')).toEqual([
      { level: 1, text: 'real', line: 3, id: 'real' }
    ])
    expect(extractOutline('~~~js\n# fake\n~~~\n## real')).toEqual([
      { level: 2, text: 'real', line: 3, id: 'real' }
    ])
    expect(extractOutline('  ```ts\n# fake\n  ```\n# real')).toEqual([
      { level: 1, text: 'real', line: 3, id: 'real' }
    ])
  })

  it('ignores setext-looking lines inside fences', () => {
    expect(extractOutline('```\nFake\n====\n```\n# real')).toEqual([
      { level: 1, text: 'real', line: 4, id: 'real' }
    ])
  })

  it('hides everything after an unclosed fence', () => {
    expect(extractOutline('```\n# fake')).toEqual([])
  })

  it('deduplicates repeated headings', () => {
    const items = extractOutline('# Intro\n# Intro\n## Intro')
    expect(items.map((item) => item.id)).toEqual(['intro', 'intro-1', 'intro-2'])
  })

  it('deduplicates headings that differ only by inline markup', () => {
    const items = extractOutline('# A *b*\n# A b')
    expect(items.map((item) => item.id)).toEqual(['a-b', 'a-b-1'])
  })

  it('supports CJK headings and duplicate CJK slugs', () => {
    const items = extractOutline('# 中文标题\n## 中文标题')
    expect(items).toEqual([
      { level: 1, text: '中文标题', line: 0, id: '中文标题' },
      { level: 2, text: '中文标题', line: 1, id: '中文标题-1' }
    ])
  })

  it('skips YAML front matter', () => {
    expect(extractOutline('---\ntitle: x\n---\n# Real')).toEqual([
      { level: 1, text: 'Real', line: 3, id: 'real' }
    ])
    expect(extractOutline('---\ntitle: x\n...\n# Real')).toHaveLength(1)
  })

  it('treats an unterminated front matter block as empty', () => {
    expect(extractOutline('---\ntitle: x\n# not a heading')).toEqual([])
  })

  it('skips display math blocks', () => {
    expect(extractOutline('$$\n# fake\n$$\n# real')).toEqual([
      { level: 1, text: 'real', line: 3, id: 'real' }
    ])
  })

  it('skips backslash-delimited display math blocks', () => {
    expect(extractOutline('\\[\n# fake\n\\]\n# real')).toEqual([
      { level: 1, text: 'real', line: 3, id: 'real' }
    ])
  })

  it('does not treat blockquote hashes as headings', () => {
    expect(extractOutline('> # quoted')).toEqual([])
  })

  it('reports line numbers correctly for CRLF documents', () => {
    const items = extractOutline('# A\r\n\r\n# B')
    expect(items.map((item) => item.line)).toEqual([0, 2])
  })

  it('accepts a tab after the ATX marker', () => {
    expect(extractOutline('#\tTab')).toEqual([{ level: 1, text: 'Tab', line: 0, id: 'tab' }])
  })

  it('returns an empty outline for empty input', () => {
    expect(extractOutline('')).toEqual([])
  })
})
