import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode
} from 'react'

export interface QuickOpenFile {
  path: string
  name: string
  relative: string
}

export interface QuickOpenProps {
  open: boolean
  files: QuickOpenFile[]
  onOpen(path: string): void
  onClose(): void
  placeholder?: string
}

interface ScoredFile {
  file: QuickOpenFile
  score: number
  indices: number[]
}

interface SubsequenceMatch {
  score: number
  indices: number[]
}

const MAX_RESULTS = 40
const MAX_LENGTH_PENALTY = 120
const SEPARATOR = /[\s/._-]/

export function QuickOpen(props: QuickOpenProps) {
  const { open, files, onOpen, onClose, placeholder } = props
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  const baseId = useId()
  const results = useMemo(() => rankFiles(query, files), [query, files])
  const activeFile = results[active]

  useEffect(() => {
    if (!open) {
      setQuery('')
      setActive(0)
      return
    }
    setActive(0)
    const input = inputRef.current
    if (input) {
      input.focus()
      input.select()
    }
  }, [open])

  useEffect(() => {
    setActive((current) => {
      if (results.length === 0) return 0
      return Math.min(current, results.length - 1)
    })
  }, [results.length])

  useEffect(() => {
    if (!open) return
    const item = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
    if (item && typeof item.scrollIntoView === 'function') item.scrollIntoView({ block: 'nearest' })
  }, [active, open, results.length])

  if (!open) return null

  const choose = (file: QuickOpenFile | undefined): void => {
    if (!file) return
    onOpen(file.path)
    onClose()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      event.stopPropagation()
      if (results.length > 0) setActive((current) => (current + 1) % results.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
      if (results.length > 0) {
        setActive((current) => (current - 1 + results.length) % results.length)
      }
    } else if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      choose(activeFile?.file)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
  }

  const listId = `${baseId}-list`
  const activeId = activeFile ? `${baseId}-option-${active}` : undefined

  return (
    <div
      className="quickopen-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="quickopen" role="dialog" aria-modal="true" aria-label="快速打开文件">
        <input
          ref={inputRef}
          className="quickopen-input"
          type="text"
          value={query}
          autoFocus
          spellCheck={false}
          placeholder={placeholder ?? '输入文件名或路径…'}
          aria-label="搜索文件"
          role="combobox"
          aria-expanded={true}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
          }}
          onKeyDown={handleKeyDown}
        />
        <div className="quickopen-summary" aria-hidden="true">
          {query.trim().length > 0
            ? `${results.length} 个匹配`
            : `${Math.min(files.length, MAX_RESULTS)} / ${files.length} 个文件`}
        </div>
        <ul className="quickopen-results" id={listId} role="listbox" aria-label="文件列表" ref={listRef}>
          {results.length === 0 ? (
            <li className="quickopen-empty" role="presentation">
              没有匹配的文件
            </li>
          ) : (
            results.map((result, index) => (
              <li
                key={result.file.path}
                id={`${baseId}-option-${index}`}
                className={`quickopen-item${index === active ? ' active' : ''}`}
                role="option"
                aria-selected={index === active}
                data-index={index}
                title={result.file.relative}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(result.file)}
              >
                <span className="quickopen-path">
                  {highlight(result.file.relative, result.indices)}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}

function rankFiles(query: string, files: QuickOpenFile[]): ScoredFile[] {
  const trimmed = query.trim()
  if (trimmed.length === 0) {
    return files.slice(0, MAX_RESULTS).map((file) => ({ file, score: 0, indices: [] }))
  }
  const needle = trimmed.toLowerCase()
  const ranked: ScoredFile[] = []
  for (const file of files) {
    const relative = matchSubsequence(needle, file.relative)
    const name = matchSubsequence(needle, file.name)
    const best = relative ?? name
    if (!best) continue
    let score = best.score
    if (name) score += 400
    if (file.name.toLowerCase().startsWith(needle)) score += 600
    if (file.relative.toLowerCase().startsWith(needle)) score += 200
    ranked.push({ file, score, indices: relative ? relative.indices : [] })
  }
  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.file.relative.localeCompare(b.file.relative, undefined, {
      numeric: true,
      sensitivity: 'base'
    })
  })
  return ranked.slice(0, MAX_RESULTS)
}

function matchSubsequence(needle: string, target: string): SubsequenceMatch | null {
  if (needle.length === 0) return { score: 0, indices: [] }
  const haystack = target.toLowerCase()
  const indices: number[] = []
  let queryIndex = 0
  let previous = -2
  let score = 0
  for (let index = 0; index < haystack.length && queryIndex < needle.length; index++) {
    if (haystack[index] !== needle[queryIndex]) continue
    indices.push(index)
    score += 12
    if (index === previous + 1) score += 18
    else if (index === 0 || SEPARATOR.test(haystack[index - 1])) score += 16
    previous = index
    queryIndex++
  }
  if (queryIndex < needle.length) return null
  score -= Math.min(MAX_LENGTH_PENALTY, target.length - needle.length)
  return { score, indices }
}

function highlight(text: string, indices: number[]): ReactNode {
  if (indices.length === 0) return text
  const marked = new Set(indices)
  const parts: ReactNode[] = []
  let plainStart = 0
  let index = 0
  while (index < text.length) {
    if (!marked.has(index)) {
      index++
      continue
    }
    if (index > plainStart) parts.push(text.slice(plainStart, index))
    let end = index + 1
    while (end < text.length && marked.has(end)) end++
    parts.push(<mark key={`${index}-${end}`}>{text.slice(index, end)}</mark>)
    index = end
    plainStart = end
  }
  if (plainStart < text.length) parts.push(text.slice(plainStart))
  return parts
}
