import { syntaxTree } from '@codemirror/language'
import type { EditorState } from '@codemirror/state'

const EXTERNAL_URL = /^(?:https?:|mailto:)/i
const TRAILING_PUNCTUATION = /[.,;:!?，。；：！？、]+$/

interface SyntaxNodeLike {
  name: string
  from: number
  to: number
  parent: SyntaxNodeLike | null
}

export function normalizeExternalLink(raw: string): string | null {
  const value = raw.trim().replace(/^<|>$/g, '')
  if (!EXTERNAL_URL.test(value)) return null
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && parsed.protocol !== 'mailto:') {
      return null
    }
    return value
  } catch {
    return null
  }
}

export function findLinkAt(state: EditorState, pos: number): string | null {
  let node = syntaxTree(state).resolveInner(pos, -1) as unknown as SyntaxNodeLike | null

  while (node) {
    const raw = state.doc.sliceString(node.from, node.to)
    const target = linkFromNode(node.name, raw, state)
    if (target) return target
    node = node.parent
  }

  return linkAtLine(state, pos)
}

export function selectedLink(state: EditorState): string | null {
  const range = state.selection.main
  if (range.empty) return null
  const text = state.doc.sliceString(range.from, range.to).trim()
  const direct = normalizeExternalLink(text)
  if (direct) return direct
  const inline = /^\[([\s\S]*?)\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+["'][^"']*["'])?\s*\)$/.exec(text)
  if (inline) return normalizeExternalLink(inline[2])
  const reference = /^\[([\s\S]*?)\]\[([^\]]*)\]$/.exec(text)
  if (!reference) return null
  return resolveReference(state, reference[2] || reference[1])
}

function linkFromNode(name: string, raw: string, state: EditorState): string | null {
  if (name === 'Autolink' || name === 'URL') return normalizeExternalLink(raw)
  if (name === 'Link') {
    const inline = /^\[([\s\S]*?)\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+["'][^"']*["'])?\s*\)$/.exec(raw)
    if (inline) return normalizeExternalLink(inline[2])
    const reference = /^\[([\s\S]*?)\]\[([^\]]*)\]$/.exec(raw)
    return reference ? resolveReference(state, reference[2] || reference[1]) : null
  }
  if (name === 'LinkReference') {
    const match = /^\[([\s\S]*?)\]\[([^\]]*)\]$/.exec(raw)
    if (!match) return null
    return resolveReference(state, match[2] || match[1])
  }
  return null
}

function resolveReference(state: EditorState, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp('^ {0,3}\\[(' + escaped + ')\\]:\\s*(<[^>]*>|\\S+)', 'im').exec(
    state.doc.toString()
  )
  return match ? normalizeExternalLink(match[2]) : null
}

function linkAtLine(state: EditorState, pos: number): string | null {
  const line = state.doc.lineAt(pos)
  const offset = pos - line.from
  const regex = /(?:https?:\/\/|mailto:)[^\s<>()]+/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(line.text)) !== null) {
    const end = match.index + match[0].replace(TRAILING_PUNCTUATION, '').length
    if (offset < match.index || offset > end) continue
    return normalizeExternalLink(line.text.slice(match.index, end))
  }
  return null
}
