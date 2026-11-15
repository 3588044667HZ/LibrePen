import { useEffect, useState } from 'react'
import type { FileNode } from '@shared/types'

interface FileTreeProps {
  rootPath: string
  activePath: string | null
  refreshKey: number
  onOpenFile(path: string): void
}

export function FileTree({ rootPath, activePath, refreshKey, onOpenFile }: FileTreeProps) {
  return (
    <div className="file-tree" key={refreshKey}>
      <Directory
        path={rootPath}
        name={baseName(rootPath)}
        depth={0}
        activePath={activePath}
        defaultOpen
        onOpenFile={onOpenFile}
      />
    </div>
  )
}

interface DirectoryProps {
  path: string
  name: string
  depth: number
  activePath: string | null
  defaultOpen?: boolean
  onOpenFile(path: string): void
}

function Directory({ path, name, depth, activePath, defaultOpen, onOpenFile }: DirectoryProps) {
  const [open, setOpen] = useState(Boolean(defaultOpen))
  const [entries, setEntries] = useState<FileNode[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let alive = true
    setEntries(null)
    setError(null)
    void window.api.files.readDir(path).then((result) => {
      if (!alive) return
      if (result.ok) setEntries(result.value ?? [])
      else setError(result.error ?? '无法读取文件夹')
    })
    return () => {
      alive = false
    }
  }, [path, open])

  return (
    <div>
      <button
        className="tree-node"
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => setOpen((value) => !value)}
        title={path}
      >
        <span className="twisty">
          <i className={`bi ${open ? 'bi-chevron-down' : 'bi-chevron-right'}`} aria-hidden="true" />
        </span>
        <span className="tree-icon">
          <i className={`bi ${open ? 'bi-folder2-open' : 'bi-folder2'}`} aria-hidden="true" />
        </span>
        <span className="tree-name">{name}</span>
      </button>
      {open ? (
        error ? (
          <div className="tree-empty">{error}</div>
        ) : entries === null ? (
          <div className="tree-loading">加载中…</div>
        ) : entries.length === 0 ? (
          <div className="tree-empty">空文件夹</div>
        ) : (
          entries.map((entry) =>
            entry.isDirectory ? (
              <Directory
                key={entry.path}
                path={entry.path}
                name={entry.name}
                depth={depth + 1}
                activePath={activePath}
                onOpenFile={onOpenFile}
              />
            ) : (
              <button
                key={entry.path}
                className={`tree-node ${activePath === entry.path ? 'active' : ''}`}
                style={{ paddingLeft: 8 + (depth + 1) * 12 }}
                onClick={() => onOpenFile(entry.path)}
                title={entry.path}
              >
                <span className="twisty" />
                <span className="tree-icon">
                  <i className="bi bi-file-earmark-text" aria-hidden="true" />
                </span>
                <span className="tree-name">{entry.name}</span>
              </button>
            )
          )
        )
      ) : null}
    </div>
  )
}

function baseName(filePath: string): string {
  const clean = filePath.replace(/[\\/]+$/, '')
  const index = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'))
  return index >= 0 ? clean.slice(index + 1) : clean
}
