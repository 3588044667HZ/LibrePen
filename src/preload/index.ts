import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { LibrePenApi } from '@shared/api'
import { IPC } from '@shared/ipc'
import { resolveImageUrl } from '@shared/markdown'
import type { CommandEvent } from '@shared/types'

function on<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: LibrePenApi = {
  app: {
    info: () => ipcRenderer.invoke(IPC.appInfo),
    initialPath: () => ipcRenderer.invoke(IPC.appInitialPath),
    getRecent: () => ipcRenderer.invoke(IPC.appGetRecent),
    onCommand: (callback) => on<CommandEvent>(IPC.appCommand, callback),
    onOpenPath: (callback) => on<string>(IPC.appOpenPath, callback)
  },
  dialog: {
    openFile: () => ipcRenderer.invoke(IPC.dialogOpenFile),
    openFolder: () => ipcRenderer.invoke(IPC.dialogOpenFolder),
    confirm: (options) => ipcRenderer.invoke(IPC.dialogConfirm, options),
    unsavedChanges: (title) => ipcRenderer.invoke(IPC.dialogUnsaved, title),
    openReferenceDoc: () => ipcRenderer.invoke(IPC.dialogOpenReferenceDoc)
  },
  files: {
    read: (path) => ipcRenderer.invoke(IPC.fileRead, path),
    save: (request) => ipcRenderer.invoke(IPC.fileSave, request),
    saveAs: (request) => ipcRenderer.invoke(IPC.fileSaveAs, request),
    readDir: (path, showHidden) => ipcRenderer.invoke(IPC.fileReadDir, path, showHidden),
    reveal: (path) => ipcRenderer.invoke(IPC.fileReveal, path),
    exists: (path) => ipcRenderer.invoke(IPC.fileCheckExists, path),
    importImage: (request) => ipcRenderer.invoke(IPC.fileImportImage, request),
    resolveImage: (docPath, src) => resolveImageUrl(docPath, src),
    getPathForFile: (file) => {
      try {
        return webUtils.getPathForFile(file)
      } catch {
        return ''
      }
    }
  },
  recent: {
    list: () => ipcRenderer.invoke(IPC.recentList),
    add: (path) => ipcRenderer.invoke(IPC.recentAdd, path),
    addFolder: (path) => ipcRenderer.invoke(IPC.recentAddFolder, path),
    clear: () => ipcRenderer.invoke(IPC.recentClear)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    set: (patch) => ipcRenderer.invoke(IPC.settingsSet, patch),
    openConfigDir: () => ipcRenderer.invoke(IPC.settingsOpenDir),
    importTypora: () => ipcRenderer.invoke(IPC.settingsImportTypora)
  },
  drafts: {
    save: (request) => ipcRenderer.invoke(IPC.draftSave, request),
    list: () => ipcRenderer.invoke(IPC.draftList),
    read: (id) => ipcRenderer.invoke(IPC.draftRead, id),
    discard: (id) => ipcRenderer.invoke(IPC.draftDiscard, id)
  },
  search: {
    content: (request, requestId) => ipcRenderer.invoke(IPC.searchContent, request, requestId),
    cancel: (requestId) => ipcRenderer.invoke(IPC.searchCancel, requestId)
  },
  themes: {
    list: () => ipcRenderer.invoke(IPC.themesList),
    read: (name) => ipcRenderer.invoke(IPC.themesRead, name),
    openFolder: () => ipcRenderer.invoke(IPC.themesOpen)
  },
  documents: {
    list: (root) => ipcRenderer.invoke(IPC.documentsList, root)
  },
  export: {
    html: (request) => ipcRenderer.invoke(IPC.exportHtml, request),
    pdf: (request) => ipcRenderer.invoke(IPC.exportPdf, request),
    document: (request) => ipcRenderer.invoke(IPC.exportDocument, request),
    print: (html) => ipcRenderer.invoke(IPC.printDocument, html)
  },
  clipboard: {
    readImage: () => ipcRenderer.invoke(IPC.clipboardReadImage),
    readText: () => ipcRenderer.invoke(IPC.clipboardReadText),
    writeText: (text) => ipcRenderer.invoke(IPC.clipboardWriteText, text)
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke(IPC.shellOpenExternal, url),
    openPath: (path) => ipcRenderer.invoke(IPC.shellOpenPath, path)
  },
  window: {
    minimize: () => ipcRenderer.invoke(IPC.windowMinimize),
    maximize: () => ipcRenderer.invoke(IPC.windowMaximize),
    close: () => ipcRenderer.invoke(IPC.windowClose),
    isMaximized: () => ipcRenderer.invoke(IPC.windowIsMaximized),
    setOverlay: (colors) => ipcRenderer.invoke(IPC.windowSetOverlay, colors),
    popupMenu: (x, y) => ipcRenderer.invoke(IPC.windowPopupMenu, x, y),
    confirmClose: (saved) => ipcRenderer.invoke(IPC.windowConfirmClose, saved),
    setDirty: (state) => ipcRenderer.invoke(IPC.docSetDirty, state),
    onMaximizedChange: (callback) => on<boolean>(IPC.windowMaximizedChanged, callback)
  }
}

contextBridge.exposeInMainWorld('api', api)
