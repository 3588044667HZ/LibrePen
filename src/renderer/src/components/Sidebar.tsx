import type { OutlineItem } from '@shared/markdown'
import type { RecentStore, SearchHit } from '@shared/types'
import { FileTree } from './FileTree'
import { OutlinePanel } from './OutlinePanel'
import { SearchPanel } from './SearchPanel'

export type SidebarTab = 'files' | 'outline' | 'search'

interface SidebarProps {
  tab: SidebarTab
  folder: string | null
  recent: RecentStore
  outline: OutlineItem[]
  cursorLine: number
  activePath: string | null
  refreshKey: number
  onTab(tab: SidebarTab): void
  onOpenFile(path: string): void
  onOpenFolder(): void
  onNewFile(): void
  onRefresh(): void
  onJump(line: number): void
  onOpenHit(hit: SearchHit): void
}

export function Sidebar(props: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-tabs" role="tablist">
        <button
          className={props.tab === 'files' ? 'active' : ''}
          role="tab"
          aria-selected={props.tab === 'files'}
          onClick={() => props.onTab('files')}
        >
          文件
        </button>
        <button
          className={props.tab === 'outline' ? 'active' : ''}
          role="tab"
          aria-selected={props.tab === 'outline'}
          onClick={() => props.onTab('outline')}
        >
          大纲
        </button>
        <button
          className={props.tab === 'search' ? 'active' : ''}
          role="tab"
          aria-selected={props.tab === 'search'}
          onClick={() => props.onTab('search')}
        >
          搜索
        </button>
      </div>
      <div className="sidebar-content">
        {props.tab === 'files' ? (
          props.folder ? (
            <FileTree
              rootPath={props.folder}
              activePath={props.activePath}
              refreshKey={props.refreshKey}
              onOpenFile={props.onOpenFile}
            />
          ) : (
            <>
              <div className="section-label">最近文件</div>
              {props.recent.files.length === 0 ? (
                <div className="empty-hint">还没有最近文件。</div>
              ) : (
                props.recent.files.slice(0, 30).map((entry) => (
                  <button
                    key={entry.path}
                    className={`tree-node ${props.activePath === entry.path ? 'active' : ''}`}
                    title={entry.path}
                    onClick={() => props.onOpenFile(entry.path)}
                  >
                    <span className="twisty" />
                    <span className="tree-icon">·</span>
                    <span className="tree-name">{entry.name}</span>
                  </button>
                ))
              )}
            </>
          )
        ) : null}
        {props.tab === 'outline' ? (
          <OutlinePanel outline={props.outline} cursorLine={props.cursorLine} onJump={props.onJump} />
        ) : null}
        {props.tab === 'search' ? (
          <SearchPanel folder={props.folder} onOpenHit={props.onOpenHit} />
        ) : null}
      </div>
      <div className="sidebar-footer">
        <button onClick={props.onNewFile}>新建</button>
        <button onClick={props.onOpenFolder}>文件夹</button>
        <button onClick={props.onRefresh}>刷新</button>
      </div>
    </aside>
  )
}
