import { ipcMain } from 'electron'
import { listDocuments } from '../services/file-index'

const DOCUMENTS_LIST = 'documents:list'

export function registerDocumentsIpc(): void {
  ipcMain.handle(DOCUMENTS_LIST, async (_event, root: unknown) => {
    if (typeof root !== 'string' || root.length === 0) return []
    try {
      return await listDocuments(root)
    } catch {
      return []
    }
  })
}
