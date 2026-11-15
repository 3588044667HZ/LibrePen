import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { SearchRequest } from '@shared/types'
import type { AppContext } from '../context'
import { assertSafePath } from '../lib/paths'
import { fail, ok } from './result'

export function registerSearchIpc(ctx: AppContext): void {
  ipcMain.handle(IPC.searchContent, async (_event, raw: unknown, requestId: unknown) => {
    try {
      if (!raw || typeof raw !== 'object') throw new Error('E_INVALID_REQUEST')
      const request = raw as Partial<SearchRequest>
      if (typeof request.root !== 'string' || !request.root) throw new Error('E_SEARCH_ROOT')
      const root = assertSafePath(request.root)
      if (typeof request.query !== 'string') throw new Error('E_INVALID_REQUEST')
      if (typeof requestId !== 'number' || !Number.isFinite(requestId)) {
        throw new Error('E_INVALID_REQUEST')
      }
      const response = await ctx.search.content(
        {
          root,
          query: request.query,
          caseSensitive: request.caseSensitive === true,
          regex: request.regex === true,
          wholeWord: request.wholeWord === true,
          maxResults:
            typeof request.maxResults === 'number' && Number.isFinite(request.maxResults)
              ? request.maxResults
              : undefined
        },
        requestId
      )
      return ok(response)
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle(IPC.searchCancel, (_event, requestId: unknown) => {
    if (typeof requestId === 'number' && Number.isFinite(requestId)) {
      ctx.search.cancel(requestId)
    }
  })
}
