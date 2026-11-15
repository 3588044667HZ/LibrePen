interface ToastProps {
  message: string | null
  error?: boolean
}

export function Toast({ message, error }: ToastProps) {
  if (!message) return null
  return (
    <div className={`toast ${error ? 'error' : ''}`} role="status">
      {message}
    </div>
  )
}
