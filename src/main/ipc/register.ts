import { registerFilesIpc } from './files'
import { registerSettingsIpc } from './settings'
import { registerRecentIpc } from './recent'
import { registerDraftsIpc } from './drafts'
import { registerSearchIpc } from './search'
import { registerExportIpc } from './export'
import { registerClipboardIpc } from './clipboard'
import { registerWindowIpc } from './window'
import { registerThemesIpc } from './themes'
import { registerDocumentsIpc } from './documents'
import type { AppContext } from '../context'

export function registerIpc(ctx: AppContext): void {
  registerFilesIpc(ctx)
  registerSettingsIpc(ctx)
  registerRecentIpc(ctx)
  registerDraftsIpc(ctx)
  registerSearchIpc(ctx)
  registerExportIpc(ctx)
  registerClipboardIpc()
  registerWindowIpc(ctx)
  registerThemesIpc()
  registerDocumentsIpc()
}
