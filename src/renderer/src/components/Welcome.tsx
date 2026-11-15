import type { DraftEntry, RecentStore } from '@shared/types'

interface WelcomeProps {
  recent: RecentStore
  drafts: DraftEntry[]
  onNew(): void
  onOpenFile(): void
  onOpenFolder(): void
  onOpenRecent(path: string): void
  onOpenFolderPath(path: string): void
  onRestoreDraft(entry: DraftEntry): void
  onDiscardDraft(entry: DraftEntry): void
}

export function Welcome(props: WelcomeProps) {
  return (
    <div className="welcome">
      <div className="welcome-inner">
        <h1>LibrePen</h1>
        <p className="subtitle">一个干净、快速、本地优先的 Markdown 编辑器。</p>
        <div className="welcome-actions">
          <button className="btn primary" onClick={props.onNew}>
            新建文件
          </button>
          <button className="btn" onClick={props.onOpenFile}>
            打开文件
          </button>
          <button className="btn" onClick={props.onOpenFolder}>
            打开文件夹
          </button>
        </div>

        {props.drafts.length > 0 ? (
          <section className="welcome-section">
            <h2>恢复草稿</h2>
            <div className="list">
              {props.drafts.map((entry) => (
                <div className="list-item" key={entry.id}>
                  <span className="name">{entry.displayName}</span>
                  <span className="path">{new Date(entry.savedAt).toLocaleString()}</span>
                  <button className="btn" onClick={() => props.onRestoreDraft(entry)}>
                    恢复
                  </button>
                  <button className="btn danger" onClick={() => props.onDiscardDraft(entry)}>
                    丢弃
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="welcome-section">
          <h2>最近文件</h2>
          <div className="list">
            {props.recent.files.length === 0 ? (
              <div className="empty-hint">还没有最近文件。</div>
            ) : (
              props.recent.files.slice(0, 12).map((entry) => (
                <button
                  className="list-item"
                  key={entry.path}
                  onClick={() => props.onOpenRecent(entry.path)}
                >
                  <span className="name">{entry.name}</span>
                  <span className="path">{entry.path}</span>
                  <span className="meta">{new Date(entry.openedAt).toLocaleDateString()}</span>
                </button>
              ))
            )}
          </div>
        </section>

        {props.recent.folders.length > 0 ? (
          <section className="welcome-section">
            <h2>最近文件夹</h2>
            <div className="list">
              {props.recent.folders.slice(0, 6).map((entry) => (
                <button
                  className="list-item"
                  key={entry.path}
                  onClick={() => props.onOpenFolderPath(entry.path)}
                >
                  <span className="name">{entry.name}</span>
                  <span className="path">{entry.path}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}
