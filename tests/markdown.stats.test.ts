import { describe, expect, it } from 'vitest'
import { countWords } from '../src/shared/markdown'

describe('countWords', () => {
  it('counts English words', () => {
    const stats = countWords('Hello world')
    expect(stats).toEqual({ words: 2, chars: 10, lines: 1, readingMinutes: 1 })
  })

  it('counts words with punctuation, apostrophes, hyphens and underscores', () => {
    expect(countWords('Hello, world! 123').words).toBe(3)
    expect(countWords("don't well-known snake_case").words).toBe(3)
  })

  it('counts CJK characters individually', () => {
    expect(countWords('你好世界')).toEqual({ words: 4, chars: 4, lines: 1, readingMinutes: 1 })
    expect(countWords('こんにちは')).toMatchObject({ words: 5 })
    expect(countWords('안녕하세요')).toMatchObject({ words: 5 })
  })

  it('ignores CJK punctuation', () => {
    const stats = countWords('你好，世界。')
    expect(stats.words).toBe(4)
    expect(stats.chars).toBe(6)
  })

  it('counts mixed latin and CJK text', () => {
    expect(countWords('Hello 世界 test').words).toBe(4)
    expect(countWords('你好world').words).toBe(3)
  })

  it('returns zeroes for empty text', () => {
    expect(countWords('')).toEqual({ words: 0, chars: 0, lines: 0, readingMinutes: 0 })
  })

  it('does not count whitespace as characters', () => {
    expect(countWords('a b\nc')).toEqual({ words: 3, chars: 3, lines: 2, readingMinutes: 1 })
  })

  it('counts lines for trailing newlines and CRLF', () => {
    expect(countWords('a\n').lines).toBe(2)
    expect(countWords('a\r\nb').lines).toBe(2)
  })

  it('excludes fenced code blocks from the word count', () => {
    expect(countWords('```js\nconst x = 1\n```').words).toBe(0)
    expect(countWords('# Title\n\n```\ncode here now\n```').words).toBe(1)
    expect(countWords('~~~\n# not a heading\n~~~').words).toBe(0)
  })

  it('excludes front matter from the word count', () => {
    expect(countWords('---\ntitle: Secret\n---\nVisible').words).toBe(1)
  })

  it('counts inline code as words', () => {
    expect(countWords('Use `npm install` now').words).toBe(4)
  })

  it('does not count emoji as words', () => {
    expect(countWords('😀 😀').words).toBe(0)
  })

  it('computes reading minutes at 200 words per minute', () => {
    expect(countWords('word '.repeat(200)).readingMinutes).toBe(1)
    expect(countWords('word '.repeat(201)).readingMinutes).toBe(2)
    expect(countWords('word '.repeat(400)).readingMinutes).toBe(2)
    expect(countWords('word '.repeat(401)).readingMinutes).toBe(3)
  })
})
