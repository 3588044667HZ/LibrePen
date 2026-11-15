import type { Result } from '@shared/types'

export function ok<T>(value: T): Result<T> {
  return { ok: true, value }
}

export function fail(error: unknown): Result<never> {
  const err = error as NodeJS.ErrnoException & { message?: string }
  const raw = err?.code ?? err?.message ?? String(error)
  const code = typeof raw === 'string' && raw.startsWith('E_') ? raw : undefined
  return {
    ok: false,
    error: friendly(raw),
    code
  }
}

export function friendly(raw: string): string {
  const map: Record<string, string> = {
    E_INVALID_PATH: '路径无效',
    E_INVALID_REQUEST: '请求参数无效',
    E_UNSUPPORTED: '不支持的文件类型',
    E_NOT_FOUND: '文件不存在',
    E_OVERSIZE: '文件过大（超过 2 MB）',
    E_EXPORT_TOO_LARGE: '导出内容过大',
    E_CONTENT_TOO_LARGE: '内容过大',
    E_QUERY_TOO_LONG: '搜索内容过长',
    E_CONFLICT: '文件已被外部修改',
    E_REGEX: '正则表达式无效',
    E_SEARCH_ROOT: '搜索目录无效',
    E_NEED_SAVE: '请先保存文档',
    E_INVALID_DRAFT: '草稿数据无效',
    E_INVALID_DRAFT_ID: '草稿标识无效',
    ENOENT: '文件不存在',
    EACCES: '没有访问权限',
    EPERM: '操作不被允许',
    EISDIR: '目标是一个文件夹',
    ENOSPC: '磁盘空间不足'
  }
  return map[raw] ?? raw
}
