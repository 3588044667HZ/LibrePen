import type { OutlineItem } from '@shared/markdown'

interface OutlinePanelProps {
  outline: OutlineItem[]
  cursorLine: number
  onJump(line: number): void
}

export function OutlinePanel({ outline, cursorLine, onJump }: OutlinePanelProps) {
  if (outline.length === 0) {
    return <div className="empty-hint">当前文档没有标题。</div>
  }
  let activeLine = -1
  for (const item of outline) {
    if (item.line + 1 <= cursorLine) activeLine = item.line
    else break
  }
  return (
    <div>
      {outline.map((item) => (
        <button
          key={`${item.line}-${item.id}`}
          className={`outline-item outline-level-${Math.min(6, item.level)} ${
            item.line === activeLine ? 'active' : ''
          }`}
          title={item.text}
          onClick={() => onJump(item.line + 1)}
        >
          {item.text}
        </button>
      ))}
    </div>
  )
}
