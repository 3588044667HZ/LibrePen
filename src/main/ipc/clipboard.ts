import { clipboard, ipcMain } from 'electron'
import { IPC } from '@shared/ipc'

const MAX_CLIPBOARD_IMAGE = 32 * 1024 * 1024

export function registerClipboardIpc(): void {
  ipcMain.handle(IPC.clipboardReadImage, async () => {
    try {
      const items = await clipboard.read()
      for (const item of items) {
        const type = item.types.find((value) => value.toLowerCase().startsWith('image/'))
        if (!type) continue
        let payload: unknown
        try {
          payload = await item.getType(type)
        } catch {
          continue
        }
        if (typeof payload === 'string' || !(payload instanceof Blob)) continue
        const blob = payload
        if (blob.size === 0 || blob.size > MAX_CLIPBOARD_IMAGE) continue
        const data = new Uint8Array(await blob.arrayBuffer())
        const mime = type.split(';')[0].toLowerCase()
        const ext =
          mime === 'image/jpeg'
            ? 'jpg'
            : mime === 'image/svg+xml'
              ? 'svg'
              : mime.split('/')[1] || 'png'
        return { data, ext }
      }
    } catch {
      return null
    }
    return null
  })

  ipcMain.handle(IPC.clipboardReadText, () => clipboard.readText())

  ipcMain.handle(IPC.clipboardWriteText, async (_event, text: string) => {
    if (typeof text === 'string') await clipboard.writeText(text)
  })
}
