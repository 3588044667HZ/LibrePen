import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { DraftSaveRequest } from '@shared/types'
import type { AppContext } from '../context'
import { fail, ok } from './result'

export function registerDraftsIpc(ctx: AppContext): void {
  ipcMain.handle(IPC.draftSave, (_event, request: unknown) => {
    try {
      ctx.drafts.save(request as DraftSaveRequest)
      return ok(undefined)
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle(IPC.draftList, () => ctx.drafts.list())

  ipcMain.handle(IPC.draftRead, (_event, id: unknown) => {
    try {
      if (typeof id !== 'string') throw new Error('E_INVALID_DRAFT_ID')
      const result = ctx.drafts.read(id)
      if (!result) throw new Error('E_NOT_FOUND')
      return ok(result)
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle(IPC.draftDiscard, (_event, id: unknown) => {
    try {
      if (typeof id !== 'string') throw new Error('E_INVALID_DRAFT_ID')
      ctx.drafts.discard(id)
      return ok(undefined)
    } catch (error) {
      return fail(error)
    }
  })
}
