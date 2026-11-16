import type { WidgetType } from '@codemirror/view'

export type BlockKind = 'table' | 'code' | 'math' | 'mermaid' | 'toc' | 'frontmatter' | 'html'

export interface BlockDescriptor {
  kind: BlockKind
  from: number
  to: number
  content: string
  info?: string
}

export interface BlockRenderContext {
  docPath: string | null
  theme: 'light' | 'dark'
  resolveImage: (docPath: string | null, src: string) => string
}

export type BlockWidgetFactory = (
  descriptor: BlockDescriptor,
  context: BlockRenderContext
) => WidgetType
