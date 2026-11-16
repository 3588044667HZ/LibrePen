import type {
  AppInfo,
  CommandEvent,
  DirtyState,
  DocPayload,
  DraftEntry,
  DraftSaveRequest,
  ExportDocumentRequest,
  ExportHtmlRequest,
  ExportPdfRequest,
  FileNode,
  ImportImageRequest,
  ImportImageResult,
  OverlayColors,
  RecentStore,
  Result,
  SaveRequest,
  QuickFile,
  SearchRequest,
  SearchResponse,
  Settings,
  ThemeInfo,
  ThemeParts
} from './types'

export type UnsavedChoice = 'save' | 'discard' | 'cancel'

export interface ConfirmOptions {
  message: string
  detail?: string
  confirmLabel?: string
  cancelLabel?: string
}

export interface LibrePenApi {
  app: {
    info(): Promise<AppInfo>
    initialPath(): Promise<string | null>
    getRecent(): Promise<RecentStore>
    onCommand(callback: (event: CommandEvent) => void): () => void
    onOpenPath(callback: (path: string) => void): () => void
  }
  dialog: {
    openFile(): Promise<string | null>
    openFolder(): Promise<string | null>
    confirm(options: ConfirmOptions): Promise<boolean>
    unsavedChanges(title: string): Promise<UnsavedChoice>
    openReferenceDoc(): Promise<string | null>
  }
  files: {
    read(path: string): Promise<Result<DocPayload>>
    save(request: SaveRequest): Promise<Result<DocPayload>>
    saveAs(request: SaveRequest): Promise<Result<DocPayload> | null>
    readDir(path: string, showHidden?: boolean): Promise<Result<FileNode[]>>
    reveal(path: string): Promise<void>
    exists(path: string): Promise<boolean>
    importImage(request: ImportImageRequest): Promise<Result<ImportImageResult>>
    resolveImage(docPath: string | null, src: string): string
    getPathForFile(file: File): string
  }
  recent: {
    list(): Promise<RecentStore>
    add(path: string): Promise<RecentStore>
    addFolder(path: string): Promise<RecentStore>
    clear(): Promise<RecentStore>
  }
  settings: {
    get(): Promise<Settings>
    set(patch: unknown): Promise<Result<Settings>>
    openConfigDir(): Promise<void>
    importTypora(): Promise<Result<unknown>>
  }
  drafts: {
    save(request: DraftSaveRequest): Promise<Result<void>>
    list(): Promise<DraftEntry[]>
    read(id: string): Promise<Result<{ content: string; entry: DraftEntry }>>
    discard(id: string): Promise<void>
  }
  search: {
    content(request: SearchRequest, requestId: number): Promise<Result<SearchResponse>>
    cancel(requestId: number): Promise<void>
  }
  themes: {
    list(): Promise<ThemeInfo[]>
    read(name: string): Promise<ThemeParts>
    openFolder(): Promise<void>
  }
  documents: {
    list(root: string): Promise<QuickFile[]>
  }
  export: {
    html(request: ExportHtmlRequest): Promise<Result<string | null>>
    pdf(request: ExportPdfRequest): Promise<Result<string | null>>
    document(request: ExportDocumentRequest): Promise<Result<string | null>>
    print(html: string): Promise<Result<void>>
  }
  clipboard: {
    readImage(): Promise<{ data: Uint8Array; ext: string } | null>
    readText(): Promise<string>
    writeText(text: string): Promise<void>
  }
  shell: {
    openExternal(url: string): Promise<void>
    openPath(path: string): Promise<void>
  }
  window: {
    minimize(): Promise<void>
    maximize(): Promise<void>
    close(): Promise<void>
    isMaximized(): Promise<boolean>
    setOverlay(colors: OverlayColors): Promise<void>
    popupMenu(x: number, y: number): Promise<void>
    confirmClose(saved: boolean): Promise<void>
    setDirty(state: DirtyState): Promise<void>
    onMaximizedChange(callback: (maximized: boolean) => void): () => void
  }
}
