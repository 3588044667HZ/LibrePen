export const IPC = {
  appInfo: 'app:info',
  appInitialPath: 'app:initial-path',
  appCommand: 'app:command',
  appOpenPath: 'app:open-path',
  appGetRecent: 'app:get-recent',

  dialogOpenFile: 'dialog:open-file',
  dialogOpenFolder: 'dialog:open-folder',
  dialogConfirm: 'dialog:confirm',
  dialogUnsaved: 'dialog:unsaved',

  fileRead: 'file:read',
  fileSave: 'file:save',
  fileSaveAs: 'file:save-as',
  fileReadDir: 'file:read-dir',
  fileReveal: 'file:reveal',
  fileImportImage: 'file:import-image',
  fileCheckExists: 'file:check-exists',

  recentList: 'recent:list',
  recentAdd: 'recent:add',
  recentAddFolder: 'recent:add-folder',
  recentClear: 'recent:clear',

  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  settingsOpenDir: 'settings:open-dir',
  settingsImportTypora: 'settings:import-typora',

  draftSave: 'draft:save',
  draftList: 'draft:list',
  draftRead: 'draft:read',
  draftDiscard: 'draft:discard',

  searchContent: 'search:content',
  searchCancel: 'search:cancel',

  exportHtml: 'export:html',
  exportPdf: 'export:pdf',
  printDocument: 'print:document',

  themesList: 'themes:list',
  themesRead: 'themes:read',
  themesOpen: 'themes:open',

  documentsList: 'documents:list',

  clipboardReadImage: 'clipboard:read-image',
  clipboardReadText: 'clipboard:read-text',
  clipboardWriteText: 'clipboard:write-text',

  shellOpenExternal: 'shell:open-external',
  shellOpenPath: 'shell:open-path',

  windowMinimize: 'window:minimize',
  windowMaximize: 'window:maximize',
  windowClose: 'window:close',
  windowIsMaximized: 'window:is-maximized',
  windowSetOverlay: 'window:set-overlay',
  windowPopupMenu: 'window:popup-menu',
  windowConfirmClose: 'window:confirm-close',
  windowMaximizedChanged: 'window:maximized-changed',

  docSetDirty: 'doc:set-dirty',

  fileChanged: 'file:changed'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
