import { EditorView } from '@codemirror/view'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark'
import type { Settings } from '@shared/types'

export function editorTheme(settings: Settings, dark: boolean) {
  const fontSize = settings.editor.fontSize * settings.editor.fontSizeZoom
  return [
    EditorView.theme(
      {
        '&': {
          height: '100%',
          fontSize: `${fontSize}px`,
          color: 'var(--fg)',
          backgroundColor: 'var(--bg)'
        },
        '&.cm-focused': { outline: 'none' },
        '.cm-scroller': {
          overflow: 'auto',
          fontFamily: 'var(--editor-font)',
          lineHeight: 'var(--editor-line-height)'
        },
        '.cm-content': {
          maxWidth: 'var(--content-width)',
          width: '100%',
          margin: '0 auto',
          padding: '28px 0 45vh',
          caretColor: 'var(--accent)'
        },
        '.cm-line': { padding: '0 40px' },
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
    syntaxHighlighting(dark ? oneDarkHighlightStyle : defaultHighlightStyle, { fallback: true })
  ]
}
