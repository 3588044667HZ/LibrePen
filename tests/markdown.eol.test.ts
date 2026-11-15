import { describe, expect, it } from 'vitest'
import {
  applyFinalNewline,
  detectEol,
  hasFinalNewline,
  normalizeEol
} from '../src/shared/markdown'

describe('detectEol', () => {
  it('defaults to lf for empty and lf-only text', () => {
    expect(detectEol('')).toBe('lf')
    expect(detectEol('a\nb')).toBe('lf')
  })

  it('detects crlf text', () => {
    expect(detectEol('a\r\nb')).toBe('crlf')
    expect(detectEol('a\r\nb\r\n')).toBe('crlf')
  })

  it('picks the majority ending for mixed files', () => {
    expect(detectEol('a\nb\nc\r\n')).toBe('lf')
    expect(detectEol('a\r\nb\r\nc\n')).toBe('crlf')
  })

  it('prefers crlf on a tie', () => {
    expect(detectEol('a\r\nb\n')).toBe('crlf')
  })

  it('treats lone carriage returns as lf', () => {
    expect(detectEol('a\rb')).toBe('lf')
  })
})

describe('normalizeEol', () => {
  it('normalizes mixed endings to lf', () => {
    expect(normalizeEol('a\r\nb\rc\nd', 'lf')).toBe('a\nb\nc\nd')
  })

  it('normalizes mixed endings to crlf', () => {
    expect(normalizeEol('a\r\nb\rc\nd', 'crlf')).toBe('a\r\nb\r\nc\r\nd')
  })

  it('leaves text without line endings unchanged', () => {
    expect(normalizeEol('abc', 'lf')).toBe('abc')
    expect(normalizeEol('abc', 'crlf')).toBe('abc')
  })

  it('handles empty text', () => {
    expect(normalizeEol('', 'crlf')).toBe('')
  })

  it('converts in both directions', () => {
    expect(normalizeEol('a\r\nb', 'lf')).toBe('a\nb')
    expect(normalizeEol('a\nb', 'crlf')).toBe('a\r\nb')
  })
})

describe('hasFinalNewline', () => {
  it('detects lf, crlf and cr endings', () => {
    expect(hasFinalNewline('a\n')).toBe(true)
    expect(hasFinalNewline('a\r\n')).toBe(true)
    expect(hasFinalNewline('a\r')).toBe(true)
  })

  it('returns false without a trailing newline or for empty text', () => {
    expect(hasFinalNewline('a')).toBe(false)
    expect(hasFinalNewline('')).toBe(false)
  })
})

describe('applyFinalNewline', () => {
  it('collapses trailing newlines to exactly one', () => {
    expect(applyFinalNewline('a\n\n\n', true, 'lf')).toBe('a\n')
    expect(applyFinalNewline('a\r\n\r\n', true, 'crlf')).toBe('a\r\n')
  })

  it('adds a missing newline with the requested eol', () => {
    expect(applyFinalNewline('a', true, 'lf')).toBe('a\n')
    expect(applyFinalNewline('a', true, 'crlf')).toBe('a\r\n')
  })

  it('removes trailing newlines when disabled', () => {
    expect(applyFinalNewline('a\n', false)).toBe('a')
    expect(applyFinalNewline('a\n\r\n', false, 'crlf')).toBe('a')
  })

  it('handles empty text', () => {
    expect(applyFinalNewline('', true, 'lf')).toBe('\n')
    expect(applyFinalNewline('', false)).toBe('')
  })

  it('is idempotent', () => {
    const once = applyFinalNewline('a', true, 'crlf')
    expect(applyFinalNewline(once, true, 'crlf')).toBe(once)
  })
})
