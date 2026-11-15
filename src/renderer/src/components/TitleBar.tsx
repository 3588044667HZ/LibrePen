import { useEffect, useRef, useState } from 'react'

interface TitleBarProps {
  title: string
  dirty: boolean
  sidebarVisible: boolean
  sourceMode: boolean
  platform: string
  onToggleSidebar(): void
  onToggleSource(): void
  onCommand(command: string, args?: unknown): void
}

interface MenuItem {
  label: string
  command?: string
  args?: unknown
  icon?: string
  shortcut?: string
  separator?: boolean
}

interface MenuGroup {
  label: string
  items: MenuItem[]
}

const MENUS: MenuGroup[] = [
  {
    label: '文件',
    items: [
      { label: '新建', command: 'new-file', icon: 'bi-file-earmark-plus', shortcut: 'Ctrl+N' },
      { label: '打开', command: 'open-file', icon: 'bi-folder2-open', shortcut: 'Ctrl+O' },
      { label: '打开文件夹', command: 'open-folder', icon: 'bi-folder-plus' },
      { label: '快速打开', command: 'quick-open', icon: 'bi-search', shortcut: 'Ctrl+P' },
      { separator: true, label: '' },
      { label: '保存', command: 'save', icon: 'bi-save', shortcut: 'Ctrl+S' },
      { label: '另存为', command: 'save-as', icon: 'bi-save2', shortcut: 'Ctrl+Shift+S' },
      { label: '恢复最近草稿', command: 'recover-draft', icon: 'bi-clock-history' },
      { separator: true, label: '' },
      { label: '导出 HTML', command: 'export-html', icon: 'bi-filetype-html' },
      { label: '导出 PDF', command: 'export-pdf', icon: 'bi-filetype-pdf' },
      { label: '打印', command: 'print', icon: 'bi-printer', shortcut: 'Ctrl+Shift+P' },
      { separator: true, label: '' },
      { label: '设置', command: 'settings', icon: 'bi-gear', shortcut: 'Ctrl+,' }
    ]
  },
  {
    label: '编辑',
    items: [
      { label: '撤销', command: 'undo', icon: 'bi-arrow-counterclockwise', shortcut: 'Ctrl+Z' },
      { label: '重做', command: 'redo', icon: 'bi-arrow-clockwise', shortcut: 'Ctrl+Y' },
      { separator: true, label: '' },
      { label: '查找', command: 'find', icon: 'bi-search', shortcut: 'Ctrl+F' },
      { label: '替换', command: 'replace', icon: 'bi-arrow-repeat', shortcut: 'Ctrl+H' }
    ]
  },
  {
    label: '段落',
    items: [
      { label: '标题 1', command: 'heading', args: { level: 1 }, icon: 'bi-type-h1' },
      { label: '标题 2', command: 'heading', args: { level: 2 }, icon: 'bi-type-h2' },
      { label: '标题 3', command: 'heading', args: { level: 3 }, icon: 'bi-type-h3' },
      { label: '正文', command: 'heading', args: { level: 0 }, icon: 'bi-paragraph' },
      { separator: true, label: '' },
      { label: '引用', command: 'quote', icon: 'bi-quote' },
      { label: '代码块', command: 'code-fence', icon: 'bi-code-square' },
      { label: '公式块', command: 'math-block', icon: 'bi-superscript' },
      { label: '表格', command: 'table', icon: 'bi-table' },
      { label: '水平线', command: 'hr', icon: 'bi-hr' },
      { label: '目录', command: 'toc', icon: 'bi-list-nested' }
    ]
  },
  {
    label: '格式',
    items: [
      { label: '加粗', command: 'bold', icon: 'bi-type-bold', shortcut: 'Ctrl+B' },
      { label: '斜体', command: 'italic', icon: 'bi-type-italic', shortcut: 'Ctrl+I' },
      { label: '下划线', command: 'underline', icon: 'bi-type-underline', shortcut: 'Ctrl+U' },
      { label: '删除线', command: 'strike', icon: 'bi-type-strikethrough' },
      { label: '高亮', command: 'highlight', icon: 'bi-highlighter' },
      { label: '行内代码', command: 'inline-code', icon: 'bi-code' },
      { separator: true, label: '' },
      { label: '链接', command: 'link', icon: 'bi-link-45deg', shortcut: 'Ctrl+K' },
      { label: '图片', command: 'image', icon: 'bi-image' }
    ]
  },
  {
    label: '视图',
    items: [
      { label: '侧栏', command: 'toggle-sidebar', icon: 'bi-layout-sidebar-inset' },
      { label: '源码模式', command: 'toggle-source', icon: 'bi-code-slash', shortcut: 'Ctrl+/' },
      { label: '专注模式', command: 'toggle-focus', icon: 'bi-bullseye', shortcut: 'F8' },
      { label: '打字机模式', command: 'toggle-typewriter', icon: 'bi-align-center', shortcut: 'F9' },
      { separator: true, label: '' },
      { label: '浅色主题', command: 'set-theme', args: 'light', icon: 'bi-sun' },
      { label: '深色主题', command: 'set-theme', args: 'dark', icon: 'bi-moon' },
      { label: '跟随系统', command: 'set-theme', args: 'system', icon: 'bi-circle-half' },
      { separator: true, label: '' },
      { label: '设置', command: 'settings', icon: 'bi-gear' }
    ]
  }
]

export function TitleBar(props: TitleBarProps) {
  const [openMenu, setOpenMenu] = useState<number | null>(null)
  const rootRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const close = (event: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpenMenu(null)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [])

  const run = (item: MenuItem): void => {
    setOpenMenu(null)
    if (item.command) props.onCommand(item.command, item.args)
  }

  return (
    <header ref={rootRef} className="menubar">
      <div className="menubar-left">
        {MENUS.map((menu, index) => (
          <div className="menu-root" key={menu.label}>
            <button
              className={`menu-trigger ${openMenu === index ? 'active' : ''}`}
              onClick={() => setOpenMenu(openMenu === index ? null : index)}
            >
              {menu.label}
            </button>
            {openMenu === index ? (
              <div className="menu-dropdown" role="menu">
                {menu.items.map((item, itemIndex) =>
                  item.separator ? (
                    <div className="menu-sep" key={`sep-${itemIndex}`} />
                  ) : (
                    <button
                      className="menu-item"
                      key={item.label}
                      role="menuitem"
                      onClick={() => run(item)}
                    >
                      <i className={`bi ${item.icon ?? 'bi-dot'}`} aria-hidden="true" />
                      <span>{item.label}</span>
                      {item.shortcut ? <span className="menu-shortcut">{item.shortcut}</span> : null}
                    </button>
                  )
                )}
              </div>
            ) : null}
          </div>
        ))}
        <button
          className={`menubar-icon ${props.sidebarVisible ? 'active' : ''}`}
          title="切换侧栏"
          aria-label="切换侧栏"
          onClick={props.onToggleSidebar}
        >
          <i className="bi bi-layout-sidebar-inset" aria-hidden="true" />
        </button>
        <button
          className={`menubar-icon ${props.sourceMode ? 'active' : ''}`}
          title="源码模式 (Ctrl+/)"
          aria-label="源码模式"
          onClick={props.onToggleSource}
        >
          <i className="bi bi-code-slash" aria-hidden="true" />
        </button>
      </div>
      <div className={`menubar-title ${props.dirty ? 'dirty' : ''}`} title={props.title}>
        {props.title}
        {props.dirty ? <span className="dirty-dot">*</span> : null}
      </div>
      <div className="window-controls">
        <button aria-label="最小化" onClick={() => void window.api.window.minimize()}>
          <i className="bi bi-dash-lg" />
        </button>
        <button aria-label="最大化" onClick={() => void window.api.window.maximize()}>
          <i className="bi bi-square" />
        </button>
        <button
          className="close"
          aria-label="关闭"
          onClick={() => void window.api.window.close()}
        >
          <i className="bi bi-x-lg" />
        </button>
      </div>
    </header>
  )
}
