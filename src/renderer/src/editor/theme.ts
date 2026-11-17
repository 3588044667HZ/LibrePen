import { EditorView } from '@codemirror/view'
import { defaultHighlightStyle, HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark'
import type { Settings } from '@shared/types'

const markdownOverride = HighlightStyle.define([
  { tag: tags.heading, textDecoration: 'none', fontWeight: 'inherit' },
  { tag: tags.link, textDecoration: 'none' }
])

function sourceHighlightStyle(dark: boolean) {
  const link = 'var(--source-link)'
  return HighlightStyle.define([
    { tag: tags.heading1, fontSize: '1.75em', fontWeight: '700', color: 'var(--source-heading)' },
    { tag: tags.heading2, fontSize: '1.5em', fontWeight: '700', color: dark ? '#ff7b9c' : '#c7254e' },
    { tag: tags.heading3, fontSize: '1.3em', fontWeight: '700', color: dark ? '#ff7b9c' : '#c7254e' },
    { tag: tags.heading4, fontSize: '1.15em', fontWeight: '700', color: dark ? '#ff7b9c' : '#c7254e' },
    { tag: tags.heading5, fontSize: '1.05em', fontWeight: '700', color: dark ? '#ff7b9c' : '#c7254e' },
    { tag: tags.heading6, fontSize: '1em', fontWeight: '700', color: dark ? '#ff7b9c' : '#c7254e' },
    { tag: tags.strong, fontWeight: '700' },
    { tag: tags.emphasis, fontStyle: 'italic' },
    { tag: tags.strikethrough, textDecoration: 'line-through' },
    { tag: tags.monospace, fontFamily: 'var(--mono)', backgroundColor: 'var(--code-bg)', borderRadius: '3px' },
    { tag: tags.link, color: link, textDecoration: 'underline' },
    { tag: tags.url, color: link, textDecoration: 'underline' },
    { tag: tags.quote, color: 'var(--quote-fg)' },
    { tag: tags.tagName, color: 'var(--source-html-tag)' },
    { tag: tags.attributeName, color: 'var(--source-html-attr)' },
    { tag: tags.attributeValue, color: 'var(--source-html-value)' },
    { tag: tags.keyword, color: dark ? '#ff7b72' : '#d73a49' },
    { tag: tags.string, color: dark ? '#a5d6ff' : '#032f62' },
    { tag: tags.comment, color: dark ? '#8b949e' : '#6a737d', fontStyle: 'italic' },
    { tag: tags.number, color: dark ? '#79c0ff' : '#005cc5' },
    { tag: tags.operator, color: dark ? '#ff7b72' : '#d73a49' }
  ])
}

export function editorTheme(settings: Settings, dark: boolean, sourceMode = false) {
  const fontSize = settings.editor.fontSize * settings.editor.fontSizeZoom
  return [
    EditorView.theme(
      {
        '&': {
          height: '100%',
          fontSize: `${fontSize}px`,
          color: 'var(--editor-fg)',
          backgroundColor: 'var(--bg)'
        },
        '&.cm-focused': { outline: 'none' },
        '.cm-scroller': {
          overflow: 'auto',
          fontFamily: 'var(--editor-font)',
          lineHeight: 'var(--editor-line-height)'
        },
        '.cm-content': {
          flex: '0 1 auto',
          maxWidth: 'var(--content-width, 920px)',
          width: 'calc(100% - var(--content-gutter, 48px) - var(--content-gutter, 48px))',
          margin: '0 auto',
          padding: '30px 0 45vh',
          caretColor: 'var(--accent)'
        },
        '.cm-line': { padding: '0 var(--content-padding-x, 30px)' },
        '.cm-gutters': {
          backgroundColor: 'var(--bg)',
          color: 'var(--fg-muted)',
          border: 'none',
          paddingLeft: '12px'
        },
        '.cm-activeLine': { backgroundColor: 'transparent' },
        '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--accent)' },
        '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
          backgroundColor: 'var(--selection)'
        },
        '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
        '.cm-searchMatch': { backgroundColor: 'var(--search-match)', outline: '1px solid var(--accent)' },
        '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--search-selected)' },
        '.cm-panels': { backgroundColor: 'var(--bg-alt)', color: 'var(--fg)' },
        '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--border)' },
        '.cm-search.cm-panel': { padding: '8px 12px' },
        '.cm-textfield': {
          backgroundColor: 'var(--bg)',
          color: 'var(--fg)',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          padding: '3px 6px'
        },
        '.cm-button': {
          backgroundColor: 'var(--bg-alt)',
          backgroundImage: 'none',
          color: 'var(--fg)',
          border: '1px solid var(--border)',
          borderRadius: '4px'
        },
        '.cm-tooltip': {
          backgroundColor: 'var(--bg-alt)',
          border: '1px solid var(--border)',
          color: 'var(--fg)'
        },
        '.cm-md-code-line': {
          backgroundColor: 'var(--code-bg)',
          fontFamily: 'var(--mono)',
          fontSize: '0.92em'
        },
        '.cm-md-code-fence': { backgroundColor: 'var(--code-bg)', color: 'var(--fg-muted)' },
        '.cm-md-html': { color: 'var(--fg-muted)' },
        '.cm-md-within-code': {}
      },
      { dark }
    ),
    syntaxHighlighting(dark ? oneDarkHighlightStyle : defaultHighlightStyle, { fallback: true }),
    sourceMode ? syntaxHighlighting(sourceHighlightStyle(dark)) : syntaxHighlighting(markdownOverride)
  ]
}
