import type { MouseEvent } from 'react'

interface TitleBarProps {
  title: string
  dirty: boolean
  sidebarVisible: boolean
  platform: string
  onToggleSidebar(): void
}

export function TitleBar({ title, dirty, sidebarVisible, platform, onToggleSidebar }: TitleBarProps) {
  const isWindows = platform === 'win32'

  const openMenu = (event: MouseEvent<HTMLButtonElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    void window.api.window.popupMenu(rect.left, rect.bottom)
  }

  return (
    <header className={`titlebar ${isWindows ? 'native' : ''}`}>
      <div className="titlebar-left">
        <button className="icon-btn" title="菜单" aria-label="菜单" onClick={openMenu}>
          ☰
        </button>
        <button
          className={`icon-btn ${sidebarVisible ? 'active' : ''}`}
          title="切换侧栏"
          aria-label="切换侧栏"
          onClick={onToggleSidebar}
        >
          ▤
        </button>
      </div>
      <div className={`titlebar-title ${dirty ? 'dirty' : ''}`} title={title}>
        {title}
        {dirty ? <span className="dirty-dot">*</span> : null}
      </div>
      {!isWindows ? (
        <div className="window-controls">
          <button aria-label="最小化" onClick={() => void window.api.window.minimize()}>
            ─
          </button>
          <button aria-label="最大化" onClick={() => void window.api.window.maximize()}>
            □
          </button>
          <button
            className="close"
            aria-label="关闭"
            onClick={() => void window.api.window.close()}
          >
            ×
          </button>
        </div>
      ) : (
        <div className="titlebar-actions" />
      )}
    </header>
  )
}
