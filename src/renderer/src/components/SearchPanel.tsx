import { useEffect, useRef, useState } from 'react'
import type { SearchHit } from '@shared/types'

interface SearchPanelProps {
  folder: string | null
  onOpenHit(hit: SearchHit): void
}

export function SearchPanel({ folder, onOpenHit }: SearchPanelProps) {
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [regex, setRegex] = useState(false)
  const [hits, setHits] = useState<SearchHit[]>([])
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef(0)

  useEffect(() => {
    if (!folder || query.trim().length === 0) {
      setHits([])
      setError(null)
      setLoading(false)
      setTruncated(false)
      return
    }
    const id = ++requestRef.current
    const timer = setTimeout(() => {
      setLoading(true)
      setError(null)
      void window.api.search
        .content(
          {
            root: folder,
            query,
            caseSensitive,
            wholeWord,
            regex,
            maxResults: 5000
          },
          id
        )
        .then((result) => {
          if (requestRef.current !== id) return
          setLoading(false)
          if (result.ok && result.value) {
            setHits(result.value.hits)
            setTruncated(result.value.truncated)
          } else {
            setHits([])
            setError(result.error ?? '搜索失败')
          }
        })
        .catch((error: unknown) => {
          if (requestRef.current !== id) return
          setLoading(false)
          setHits([])
          setError(error instanceof Error ? error.message : '搜索失败')
        })
    }, 300)
    return () => {
      clearTimeout(timer)
      if (requestRef.current === id) {
        requestRef.current++
        void window.api.search.cancel(id)
      }
    }
  }, [folder, query, caseSensitive, wholeWord, regex])

  return (
    <div>
      <div className="search-controls">
        <input
          className="search-input"
          value={query}
          placeholder="搜索文件夹内容"
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="search-options">
          <button
            className={caseSensitive ? 'active' : ''}
            title="区分大小写"
            onClick={() => setCaseSensitive((value) => !value)}
          >
            Aa
          </button>
          <button
            className={wholeWord ? 'active' : ''}
            title="整词匹配"
            onClick={() => setWholeWord((value) => !value)}
          >
            词
          </button>
          <button
            className={regex ? 'active' : ''}
            title="正则表达式"
            onClick={() => setRegex((value) => !value)}
          >
            .*
          </button>
        </div>
      </div>
      {!folder ? (
        <div className="empty-hint">请先打开一个文件夹。</div>
      ) : loading ? (
        <div className="search-summary">搜索中…</div>
      ) : error ? (
        <div className="search-empty">{error}</div>
      ) : query.trim().length === 0 ? (
        <div className="empty-hint">输入关键词开始搜索。</div>
      ) : (
        <>
          <div className="search-summary">
            {hits.length} 个结果{truncated ? '（已截断，请细化搜索）' : ''}
          </div>
          {hits.length === 0 ? (
            <div className="search-empty">没有匹配项。</div>
          ) : (
            hits.map((hit, index) => (
              <button
                key={`${hit.path}-${hit.line}-${index}`}
                className="search-result"
                onClick={() => onOpenHit(hit)}
                title={`${hit.path}:${hit.line}`}
              >
                <span className="file">
                  {hit.file}:{hit.line}
                </span>
                <span className="preview">{renderPreview(hit)}</span>
              </button>
            ))
          )}
        </>
      )}
    </div>
  )
}

function renderPreview(hit: SearchHit) {
  const parts: Array<{ text: string; mark: boolean }> = []
  let cursor = 0
  for (const [from, to] of hit.ranges) {
    if (from > cursor) parts.push({ text: hit.preview.slice(cursor, from), mark: false })
    parts.push({ text: hit.preview.slice(from, to), mark: true })
    cursor = to
  }
  if (cursor < hit.preview.length) parts.push({ text: hit.preview.slice(cursor), mark: false })
  return parts.map((part, index) =>
    part.mark ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>
  )
}
