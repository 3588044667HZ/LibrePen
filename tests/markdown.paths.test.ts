import { describe, expect, it } from 'vitest'
import {
  encodeMarkdownUrl,
  isDataImage,
  isImageFile,
  isRemoteImage,
  mdimgUrl,
  nextAvailableName,
  normalizePath,
  relativePath,
  resolveImageUrl,
  sanitizeFileName
} from '../src/shared/markdown'

describe('mdimgUrl', () => {
  it('encodes the absolute path', () => {
    expect(mdimgUrl('C:\\docs\\a b.png')).toBe('mdimg://local/C%3A%5Cdocs%5Ca%20b.png')
  })

  it('appends a rounded mtime cache buster', () => {
    expect(mdimgUrl('C:/a.png', 1234.6)).toBe('mdimg://local/C%3A%2Fa.png?v=1235')
    expect(mdimgUrl('C:/a.png', 0)).toBe('mdimg://local/C%3A%2Fa.png?v=0')
  })

  it('omits the suffix without an mtime', () => {
    expect(mdimgUrl('C:/a.png')).toBe('mdimg://local/C%3A%2Fa.png')
  })
})

describe('image source classifiers', () => {
  it('recognizes image file extensions case-insensitively', () => {
    for (const name of ['a.png', 'a.JPG', 'a.jpeg', 'a.gif', 'a.webp', 'a.svg', 'a.bmp', 'a.avif']) {
      expect(isImageFile(name)).toBe(true)
    }
    for (const name of ['a.txt', 'a.png.bak', 'png', 'a.pngx']) {
      expect(isImageFile(name)).toBe(false)
    }
  })

  it('recognizes remote image sources', () => {
    expect(isRemoteImage('https://x/y.png')).toBe(true)
    expect(isRemoteImage('http://x/y.png')).toBe(true)
    expect(isRemoteImage('//cdn/x.png')).toBe(true)
    expect(isRemoteImage('HTTPS://X/Y.PNG')).toBe(true)
    expect(isRemoteImage('ftp://x/y.png')).toBe(false)
    expect(isRemoteImage('/local/x.png')).toBe(false)
  })

  it('recognizes data image sources', () => {
    expect(isDataImage('data:image/png;base64,AAAA')).toBe(true)
    expect(isDataImage('DATA:IMAGE/PNG;base64,AAAA')).toBe(true)
    expect(isDataImage('data:text/plain,hi')).toBe(false)
    expect(isDataImage('https://x/y.png')).toBe(false)
  })
})

describe('resolveImageUrl', () => {
  it('returns empty for empty sources and relative sources without a document', () => {
    expect(resolveImageUrl(null, '')).toBe('')
    expect(resolveImageUrl(null, '   ')).toBe('')
    expect(resolveImageUrl(null, 'img/x.png')).toBe('')
  })

  it('passes remote, protocol-relative, data and blob sources through', () => {
    expect(resolveImageUrl(null, 'https://example.com/a.png')).toBe('https://example.com/a.png')
    expect(resolveImageUrl(null, '//cdn.example.com/a.png')).toBe('//cdn.example.com/a.png')
    expect(resolveImageUrl(null, 'data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA')
    expect(resolveImageUrl(null, 'blob:abc')).toBe('blob:abc')
  })

  it('resolves relative sources against the document directory', () => {
    expect(resolveImageUrl('C:/docs/a.md', 'img/x.png')).toBe(
      'mdimg://local/C%3A%2Fdocs%2Fimg%2Fx.png'
    )
    expect(resolveImageUrl('C:\\docs\\a.md', 'img/x.png')).toBe(
      'mdimg://local/C%3A%2Fdocs%2Fimg%2Fx.png'
    )
    expect(resolveImageUrl('C:/docs/sub/a.md', '..\\img\\x.png')).toBe(
      'mdimg://local/C%3A%2Fdocs%2Fimg%2Fx.png'
    )
  })

  it('resolves absolute posix and windows paths', () => {
    expect(resolveImageUrl('C:/docs/a.md', '/abs/x.png')).toBe(
      'mdimg://local/%2Fabs%2Fx.png'
    )
    expect(resolveImageUrl(null, 'C:\\abs\\x.png')).toBe('mdimg://local/C%3A%2Fabs%2Fx.png')
  })

  it('converts file urls and decodes their escapes', () => {
    expect(resolveImageUrl(null, 'file:///C:/Pics/a%20b.png')).toBe(
      'mdimg://local/C%3A%2FPics%2Fa%20b.png'
    )
    expect(resolveImageUrl(null, 'file:///home/u/x.png')).toBe(
      'mdimg://local/%2Fhome%2Fu%2Fx.png'
    )
    expect(resolveImageUrl(null, 'file:///C:/Pics/100%25.png')).toBe(
      'mdimg://local/C%3A%2FPics%2F100%25.png'
    )
  })

  it('returns empty for malformed file urls', () => {
    expect(resolveImageUrl(null, 'file:///C:/a%zz.png')).toBe('')
  })

  it('strips angle brackets and decodes ampersands', () => {
    expect(resolveImageUrl(null, '<https://x/a.png>')).toBe('https://x/a.png')
    expect(resolveImageUrl(null, 'https://x/a&amp;b.png')).toBe('https://x/a&b.png')
  })

  it('encodes spaces and CJK characters', () => {
    expect(resolveImageUrl('C:/docs/a.md', 'my image.png')).toBe(
      'mdimg://local/C%3A%2Fdocs%2Fmy%20image.png'
    )
    expect(resolveImageUrl('C:/docs/a.md', '图片.png')).toBe(
      `mdimg://local/${encodeURIComponent('C:/docs/图片.png')}`
    )
  })
})

describe('encodeMarkdownUrl', () => {
  it('encodes spaces and parentheses only', () => {
    expect(encodeMarkdownUrl('a b(1).png')).toBe('a%20b%281%29.png')
    expect(encodeMarkdownUrl('a-b_c.png')).toBe('a-b_c.png')
  })
})

describe('normalizePath', () => {
  it('normalizes separators and dot segments', () => {
    expect(normalizePath('C:\\Users\\a\\..\\b')).toBe('C:/Users/b')
    expect(normalizePath('C:/a/./b/')).toBe('C:/a/b')
    expect(normalizePath('/a//b/')).toBe('/a/b')
    expect(normalizePath('a\\b')).toBe('a/b')
  })

  it('preserves drive and root prefixes', () => {
    expect(normalizePath('C:\\')).toBe('C:/')
    expect(normalizePath('/../a')).toBe('/a')
  })

  it('collapses leading relative parents', () => {
    expect(normalizePath('../a')).toBe('a')
  })

  it('handles empty input', () => {
    expect(normalizePath('')).toBe('')
  })
})

describe('relativePath', () => {
  it('returns a sibling path', () => {
    expect(relativePath('C:\\docs', 'C:\\docs\\img\\a.png')).toBe('img/a.png')
  })

  it('walks up parent directories', () => {
    expect(relativePath('C:/docs/sub', 'C:/docs/img/a.png')).toBe('../img/a.png')
    expect(relativePath('C:/a/b', 'C:/c')).toBe('../../c')
  })

  it('returns just the file name for the same directory', () => {
    expect(relativePath('C:/docs/sub/', 'C:/docs/sub/a.png')).toBe('a.png')
  })

  it('compares paths case-insensitively', () => {
    expect(relativePath('c:/Docs', 'C:/docs/A.PNG')).toBe('A.PNG')
  })

  it('normalizes dot segments before comparing', () => {
    expect(relativePath('C:/a/b', 'C:/a/b/../c')).toBe('../c')
  })

  it('returns the normalized absolute path for a different drive', () => {
    expect(relativePath('C:/docs', 'D:/x/a.png')).toBe('D:/x/a.png')
  })

  it('returns a relative target unchanged when drives differ', () => {
    expect(relativePath('C:/a', 'x/y')).toBe('x/y')
  })

  it('descends into a child directory', () => {
    expect(relativePath('C:/a/b', 'C:/a/b/c/d')).toBe('c/d')
  })
})

describe('sanitizeFileName', () => {
  it('strips the extension', () => {
    expect(sanitizeFileName('photo.png')).toBe('photo')
    expect(sanitizeFileName('a.b.c.png')).toBe('a.b.c')
  })

  it('replaces illegal windows characters', () => {
    expect(sanitizeFileName('a<b>c:d"e/f\\g|h?i*j.png')).toBe('a-b-c-d-e-f-g-h-i-j')
    expect(sanitizeFileName('a\u0001b.png')).toBe('a-b')
  })

  it('falls back for reserved device names', () => {
    expect(sanitizeFileName('CON.txt')).toBe('image')
    expect(sanitizeFileName('con')).toBe('image')
    expect(sanitizeFileName('com1.log')).toBe('image')
    expect(sanitizeFileName('lpt9')).toBe('image')
    expect(sanitizeFileName('CONX')).toBe('CONX')
  })

  it('falls back for empty names and supports a custom fallback', () => {
    expect(sanitizeFileName('')).toBe('image')
    expect(sanitizeFileName('   ')).toBe('image')
    expect(sanitizeFileName('', 'file')).toBe('file')
  })

  it('trims trailing dots and spaces', () => {
    expect(sanitizeFileName('name...   ')).toBe('name')
  })

  it('preserves CJK characters and internal spaces', () => {
    expect(sanitizeFileName('图片 名称.png')).toBe('图片 名称')
  })

  it('truncates long names to 80 characters', () => {
    expect(sanitizeFileName(`${'x'.repeat(100)}.png`)).toBe('x'.repeat(80))
  })
})

describe('nextAvailableName', () => {
  it('returns the base name when free', () => {
    expect(nextAvailableName(new Set(), 'image', 'png')).toBe('image.png')
    expect(nextAvailableName(new Set(), 'photo', '.jpg')).toBe('photo.jpg')
  })

  it('appends increasing numeric suffixes on conflict', () => {
    expect(nextAvailableName(new Set(['image.png']), 'image', 'png')).toBe('image-1.png')
    expect(
      nextAvailableName(new Set(['image.png', 'image-1.png']), 'image', 'png')
    ).toBe('image-2.png')
  })

  it('skips gaps in the suffix sequence', () => {
    expect(nextAvailableName(new Set(['image-1.png']), 'image', 'png')).toBe('image.png')
  })

  it('preserves the extension case', () => {
    expect(nextAvailableName(new Set(), 'image', 'PNG')).toBe('image.PNG')
  })

  it('treats existing names as lowercase, matching the caller contract', () => {
    expect(
      nextAvailableName(new Set(['image.png', 'image-1.png']), 'image', 'png')
    ).toBe('image-2.png')
  })
})
