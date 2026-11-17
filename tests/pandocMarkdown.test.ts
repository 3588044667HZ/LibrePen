import { describe, expect, it } from 'vitest'
import { preparePandocMarkdown } from '../src/renderer/src/editor/pandocMarkdown'

describe('preparePandocMarkdown', () => {
  it('replaces the toc marker with a linked list and adds heading ids', async () => {
    const result = await preparePandocMarkdown('[toc]\n\n# One\n\n## 子标题\n')

    expect(result).toContain('## 目录')
    expect(result).toContain('- [One](#librepen-heading-3)')
    expect(result).toContain('  - [子标题](#librepen-heading-5)')
    expect(result).toContain('# One {#librepen-heading-3}')
    expect(result).toContain('## 子标题 {#librepen-heading-5}')
    expect(result).not.toContain('[toc]')
  })

  it('prepends a toc when requested without a marker', async () => {
    const result = await preparePandocMarkdown('# One\n', { includeToc: true })

    expect(result.startsWith('## 目录\n')).toBe(true)
    expect(result).toContain('# One {#librepen-heading-1}')
  })

  it('ignores toc markers inside fenced code', async () => {
    const result = await preparePandocMarkdown('```\n[toc]\n```\n\n# One\n')

    expect(result).toContain('[toc]')
    expect(result).not.toContain('## 目录')
  })

  it('replaces mermaid fences with png data urls', async () => {
    const rendered: string[] = []
    const result = await preparePandocMarkdown('~~~mermaid\ngraph LR\nA-->B\n~~~\n', {
      renderMermaid: async (code) => {
        rendered.push(code)
        return 'data:image/png;base64,abc'
      }
    })

    expect(rendered).toEqual(['graph LR\nA-->B'])
    expect(result).toContain('![](data:image/png;base64,abc)')
    expect(result).not.toContain('mermaid')
  })

  it('keeps the mermaid fence when rendering fails', async () => {
    const source = '```mermaid\ngraph LR\nA-->B\n```\n'
    const result = await preparePandocMarkdown(source, { renderMermaid: async () => null })

    expect(result).toBe(source)
  })

  it('converts setext headings when adding ids', async () => {
    const result = await preparePandocMarkdown('[toc]\n\nTitle\n=====\n')

    expect(result).toContain('# Title {#librepen-heading-3}')
    expect(result).not.toContain('=====')
  })
})
