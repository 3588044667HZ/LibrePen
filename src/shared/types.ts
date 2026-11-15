export type Eol = 'lf' | 'crlf'

export type Encoding =
  | 'utf8'
  | 'utf8-bom'
  | 'utf16le'
  | 'utf16be'
  | 'gbk'
  | 'big5'
  | 'shift_jis'
  | 'latin1'

export interface DocPayload {
  path: string | null
  displayName: string
  content: string
  encoding: Encoding
  eol: Eol
  finalNewline: boolean
  size: number
  mtimeMs: number
}

export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  mtimeMs: number
}

export interface RecentEntry {
  path: string
  name: string
  openedAt: number
  pinned?: boolean
}

export interface DraftEntry {
  id: string
  originalPath: string | null
  displayName: string
  savedAt: number
  encoding: Encoding
  eol: Eol
  finalNewline: boolean
  preview: string
}

export interface SearchHit {
  path: string
  file: string
  line: number
  column: number
  preview: string
  ranges: Array<[number, number]>
}

export interface SearchResponse {
  hits: SearchHit[]
  truncated: boolean
  scannedFiles: number
}

export interface SaveRequest {
  path: string | null
  content: string
  encoding?: Encoding
  eol?: Eol
  finalNewline?: boolean
  expectedMtimeMs?: number
}

export interface DraftSaveRequest {
  id: string
  originalPath: string | null
  displayName: string
  content: string
  encoding: Encoding
  eol: Eol
  finalNewline: boolean
}

export interface ImportImageRequest {
  docPath: string | null
  fileName: string
  ext: string
  data: Uint8Array
}

export interface ImportImageResult {
  absPath: string
  markdownPath: string
}

export interface AppInfo {
  version: string
  electron: string
  chrome: string
  node: string
  platform: string
  userData: string
}

export interface CommandEvent {
  command: string
  args?: unknown
}

export interface DirtyState {
  dirty: boolean
  path: string | null
  title: string
}

export interface OverlayColors {
  color: string
  symbolColor: string
}

export interface ExportHtmlRequest {
  html: string
  suggestedName: string
}

export interface ExportPdfRequest {
  html: string
  suggestedName: string
  pageSize?: 'A4' | 'Letter' | 'A5' | 'Legal'
  marginMm?: number
  printBackground?: boolean
}

export interface SearchRequest {
  root: string
  query: string
  caseSensitive: boolean
  regex: boolean
  wholeWord: boolean
  maxResults?: number
}

export interface ExportSettings {
  html: {
    theme: 'current' | 'light' | 'dark'
    includeToc: boolean
    fontSize?: number
  }
  pdf: {
    pageSize: 'A4' | 'Letter' | 'A5' | 'Legal'
    marginMm: number
    printBackground: boolean
  }
  general: {
    openAfterExport: boolean
    defaultFolder: 'same' | 'ask'
  }
  pandoc: {
    path?: string
  }
}

export interface Settings {
  version: number
  general: {
    language: 'zh-CN' | 'en-US'
    restoreWhenLaunch: 'new' | 'lastFolder' | 'lastFile'
    confirmExit: boolean
  }
  editor: {
    fontFamily: string
    fontSize: number
    lineHeight: number
    tabSize: number
    lineWrapping: boolean
    showLineNumbers: boolean
    autoPair: boolean
    livePreview: boolean
    inlineMath: boolean
    highlightSyntax: boolean
    smartPunctuation: boolean
    spellcheck: boolean
    typewriterMode: boolean
    focusMode: boolean
    defaultEol: 'auto' | 'lf' | 'crlf'
    finalNewline: 'auto' | 'always' | 'never'
    fontSizeZoom: number
  }
  files: {
    autoSave: boolean
    autoSaveIntervalMin: number
    recovery: boolean
    defaultExtension: string
    recentLimit: number
    showHiddenFiles: boolean
    imageFolder: 'assets' | 'same' | 'custom'
    imageCustomFolder: string
    copyImagesOnPaste: boolean
  }
  appearance: {
    theme: 'system' | 'light' | 'dark'
    sidebarVisible: boolean
    sidebarWidth: number
    contentWidth: 'narrow' | 'wide'
    showStatusBar: boolean
  }
  export: ExportSettings
  advanced: {
    keybindings: Record<string, string>
    typoraConfigPath?: string
    devTools: boolean
  }
  window: {
    x?: number
    y?: number
    width: number
    height: number
    maximized: boolean
  }
}

export interface Result<T> {
  ok: boolean
  value?: T
  error?: string
  code?: string
}

export interface RecentStore {
  files: RecentEntry[]
  folders: RecentEntry[]
}

export interface SessionStore {
  lastFolder: string | null
  lastFile: string | null
  sidebarWidth: number
  sidebarVisible: boolean
  sourceMode: boolean
}

export interface WindowBounds {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}
