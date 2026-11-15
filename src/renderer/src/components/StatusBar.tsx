import type { WordStats } from '@shared/markdown'

interface StatusBarProps {
  stats: WordStats
  cursor: { line: number; column: number }
  encoding: string
  eol: 'lf' | 'crlf'
  dirty: boolean
  sourceMode: boolean
  focusMode: boolean
  typewriterMode: boolean
  hasDoc: boolean
  onToggleSource(): void
  onToggleFocus(): void
  onToggleTypewriter(): void
}

export function StatusBar(props: StatusBarProps) {
  return (
    <footer className="statusbar ty-footer">
      <span>{props.stats.words} 字</span>
      <span>{props.stats.chars} 字符</span>
      <span>{props.stats.lines} 行</span>
      {props.stats.readingMinutes > 0 ? <span>约 {props.stats.readingMinutes} 分钟</span> : null}
      <span className="spacer" />
      {props.hasDoc ? (
        <>
          <span>
            Ln {props.cursor.line}, Col {props.cursor.column}
          </span>
          <span>{props.encoding}</span>
          <span>{props.eol === 'crlf' ? 'CRLF' : 'LF'}</span>
          <span>{props.dirty ? '未保存' : '已保存'}</span>
          <button
            className={props.focusMode ? 'active' : ''}
            onClick={props.onToggleFocus}
            title="专注模式 (F8)"
          >
            专注
          </button>
          <button
            className={props.typewriterMode ? 'active' : ''}
            onClick={props.onToggleTypewriter}
            title="打字机模式 (F9)"
          >
            打字机
          </button>
          <button
            className={props.sourceMode ? 'active' : ''}
            onClick={props.onToggleSource}
            title="切换源码模式 (Ctrl+/)"
          >
            源码
          </button>
        </>
      ) : (
        <span>就绪</span>
      )}
    </footer>
  )
}
