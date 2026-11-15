import { useEffect, useState } from 'react'

interface PromptDialogProps {
  open: boolean
  title: string
  placeholder?: string
  initialValue?: string
  onSubmit(value: string): void
  onClose(): void
}

export function PromptDialog(props: PromptDialogProps) {
  const [value, setValue] = useState(props.initialValue ?? '')

  useEffect(() => {
    if (props.open) setValue(props.initialValue ?? '')
  }, [props.open, props.initialValue])

  if (!props.open) return null

  return (
    <div
      className="dialog-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose()
      }}
    >
      <form
        className="dialog small"
        onSubmit={(event) => {
          event.preventDefault()
          props.onSubmit(value.trim())
          props.onClose()
        }}
      >
        <div className="dialog-header">
          <h2>{props.title}</h2>
        </div>
        <div className="dialog-body">
          <input
            autoFocus
            className="prompt-input"
            value={value}
            placeholder={props.placeholder}
            onChange={(event) => setValue(event.target.value)}
          />
        </div>
        <div className="dialog-footer">
          <button type="button" className="btn" onClick={props.onClose}>
            取消
          </button>
          <button type="submit" className="btn primary">
            确定
          </button>
        </div>
      </form>
    </div>
  )
}
