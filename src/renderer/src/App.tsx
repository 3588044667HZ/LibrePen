import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent
} from 'react'
import { DEFAULT_SETTINGS } from '@shared/settings'
import type {
  AppInfo,
  DocPayload,
  DraftEntry,
  QuickFile,
  RecentStore,
  SearchHit,
  Settings,
  PandocExportFormat
} from '@shared/types'
import {
  encodeMarkdownUrl,
  extractOutline,
  relativePath,
  type OutlineItem
} from '@shared/markdown'
import { Editor, type EditorHandle } from './editor/Editor'
import { renderExportHtml } from './editor/exportHtml'
import { TitleBar } from './components/TitleBar'
import { Sidebar, type SidebarTab } from './components/Sidebar'
import { SettingsDialog } from './components/SettingsDialog'
import { PromptDialog } from './components/PromptDialog'
import { QuickOpen } from './components/QuickOpen'
import { Toast } from './components/Toast'
import { applyThemeStyles } from './theme/ThemeLoader'

interface PendingReveal {
  line: number
  column: number
  length: number
}

interface PromptState {
  title: string
  placeholder: string
  initialValue: string
  onSubmit(value: string): void
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [recent, setRecent] = useState<RecentStore>({ files: [], folders: [] })
  const [drafts, setDrafts] = useState<DraftEntry[]>([])
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [doc, setDoc] = useState<DocPayload | null>(null)
  const [docKey, setDocKey] = useState(0)
  const [dirty, setDirty] = useState(false)
  const [sourceMode, setSourceMode] = useState(() => {
    try {
      return window.localStorage.getItem('librepen:source-mode') === '1'
    } catch {
      return false
    }
  })
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(260)
  const [tab, setTab] = useState<SidebarTab>('files')
  const [folder, setFolder] = useState<string | null>(null)
  const [folderRefresh, setFolderRefresh] = useState(0)
  const [outline, setOutline] = useState<OutlineItem[]>([])
  const [cursor, setCursor] = useState({ line: 1, column: 1 })
  const [systemDark, setSystemDark] = useState(false)
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [prompt, setPrompt] = useState<PromptState | null>(null)
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickFiles, setQuickFiles] = useState<QuickFile[]>([])

  const editorRef = useRef<EditorHandle>(null)
  const docRef = useRef<DocPayload | null>(null)
  const contentRef = useRef('')
  const savedRef = useRef('')
  const dirtyRef = useRef(false)
  const draftIdRef = useRef('')
  const settingsRef = useRef(settings)
  const pendingRevealRef = useRef<PendingReveal | null>(null)
  const statsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveRef = useRef<(saveAs?: boolean, silent?: boolean) => Promise<boolean>>(async () => false)
  const saveTaskRef = useRef<Promise<boolean> | null>(null)
  const openTokenRef = useRef(0)
  const openFileRef = useRef<(path: string) => Promise<void>>(async () => undefined)
  const commandRef = useRef<(command: string, args?: unknown) => void>(() => undefined)

  const showToast = useCallback((message: string, error = false) => {
    setToast({ message, error })
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), error ? 6000 : 3000)
  }, [])

  const resolvedTheme: 'light' | 'dark' =
    settings.appearance.theme === 'system'
      ? systemDark
        ? 'dark'
        : 'light'
      : settings.appearance.theme

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = (): void => setSystemDark(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme
    document.documentElement.dataset.contentWidth = settings.appearance.contentWidth
    const root = document.documentElement
    root.style.setProperty('--editor-font', settings.editor.fontFamily)
    root.style.setProperty(
      '--editor-font-size',
      `${settings.editor.fontSize * settings.editor.fontSizeZoom}px`
    )
    root.style.setProperty('--editor-line-height', String(settings.editor.lineHeight))
    root.style.setProperty('--sidebar-width', `${sidebarWidth}px`)
  }, [resolvedTheme, settings, sidebarWidth])

  useEffect(() => {
    let alive = true
    void window.api.themes
      .read(settings.appearance.customTheme)
      .then((parts) => {
        if (alive) applyThemeStyles(parts)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [settings.appearance.customTheme])

  useEffect(() => {
    if (!quickOpen) return
    let alive = true
    void (async () => {
      let files: QuickFile[] = []
      if (folder) files = await window.api.documents.list(folder)
      if (files.length === 0) {
        files = recent.files.map((entry) => ({
          path: entry.path,
          name: entry.name,
          relative: entry.path
        }))
      }
      if (alive) setQuickFiles(files)
    })()
    return () => {
      alive = false
    }
  }, [quickOpen, folder, recent.files])

  useEffect(() => {
    if (!docRef.current) return
    void window.api.window.setDirty({
      dirty,
      path: docRef.current.path,
      title: docRef.current.displayName
    })
  }, [dirty, doc, docKey])

  useEffect(() => {
    if (!ready) return
    if (!dirty) return
    const onBlur = (): void => {
      void persistDraft()
    }
    window.addEventListener('blur', onBlur)
    return () => window.removeEventListener('blur', onBlur)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, dirty])

  useEffect(() => {
    if (!ready || !settings.files.autoSave) return
    const interval = Math.max(1, settings.files.autoSaveIntervalMin) * 60_000
    const timer = setInterval(() => {
      if (dirtyRef.current && docRef.current?.path) void saveRef.current(false, true)
    }, interval)
    return () => clearInterval(timer)
  }, [ready, settings.files.autoSave, settings.files.autoSaveIntervalMin])

  useEffect(() => {
    const pending = pendingRevealRef.current
    if (!pending) return
    pendingRevealRef.current = null
    const timer = setTimeout(() => {
      editorRef.current?.revealPosition(pending.line, pending.column, pending.length)
    }, 80)
    return () => clearTimeout(timer)
  }, [docKey])

  useEffect(() => {
    let alive = true
    void (async () => {
      const [loadedSettings, loadedRecent, loadedDrafts, info, initialPath] = await Promise.all([
        window.api.settings.get(),
        window.api.recent.list(),
        window.api.drafts.list(),
        window.api.app.info(),
        window.api.app.initialPath()
      ])
      if (!alive) return
      setSettings(loadedSettings)
      settingsRef.current = loadedSettings
      setRecent(loadedRecent)
      setDrafts(loadedDrafts)
      setAppInfo(info)
      setSidebarVisible(loadedSettings.appearance.sidebarVisible)
      setSidebarWidth(loadedSettings.appearance.sidebarWidth)

      let target = initialPath
      if (!target && loadedSettings.general.restoreWhenLaunch === 'lastFile') {
        target = loadedRecent.files[0]?.path ?? null
      }
      if (target) {
        const exists = await window.api.files.exists(target)
        if (exists) {
          const result = await window.api.files.read(target)
          if (result.ok && result.value) {
            setDocument(result.value)
            void window.api.recent.add(target).then((store) => {
              if (alive) setRecent(store)
            })
          }
        }
      } else if (
        loadedSettings.general.restoreWhenLaunch === 'lastFolder' &&
        loadedRecent.folders[0]
      ) {
        setFolder(loadedRecent.folders[0].path)
      }
      if (!docRef.current) {
        setDocument({
          path: null,
          displayName: '未命名',
          content: '',
          encoding: 'utf8',
          eol: loadedSettings.editor.defaultEol === 'crlf' ? 'crlf' : 'lf',
          finalNewline: true,
          size: 0,
          mtimeMs: 0
        })
      }
      setReady(true)
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === 'p') {
        event.preventDefault()
        setQuickOpen(true)
      } else if (key === ',') {
        event.preventDefault()
        setSettingsOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const offCommand = window.api.app.onCommand((event) => commandRef.current(event.command, event.args))
    const offOpen = window.api.app.onOpenPath((path) => {
      void openFileRef.current(path)
    })
    return () => {
      offCommand()
      offOpen()
    }
  }, [])

  commandRef.current = handleCommand

  function makeId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }

  function setDocument(
    payload: DocPayload,
    options?: { content?: string; savedContent?: string; dirty?: boolean; draftId?: string }
  ): void {
    openTokenRef.current++
    if (statsTimerRef.current) {
      clearTimeout(statsTimerRef.current)
      statsTimerRef.current = null
    }
    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current)
      draftTimerRef.current = null
    }
    const content = options?.content ?? payload.content
    const saved = options?.savedContent ?? content
    const next: DocPayload = { ...payload, content }
    docRef.current = next
    contentRef.current = content
    savedRef.current = saved
    draftIdRef.current = options?.draftId ?? makeId()
    const isDirty = options?.dirty ?? content !== saved
    dirtyRef.current = isDirty
    setDirty(isDirty)
    setDoc(next)
    setDocKey((value) => value + 1)
    setOutline(extractOutline(content))
    setCursor({ line: 1, column: 1 })
  }

  async function refreshRecent(): Promise<void> {
    setRecent(await window.api.recent.list())
  }

  async function refreshDrafts(): Promise<void> {
    setDrafts(await window.api.drafts.list())
  }

  async function updateSettings(patch: unknown): Promise<void> {
    const result = await window.api.settings.set(patch)
    if (result.ok && result.value) {
      settingsRef.current = result.value
      setSettings(result.value)
      const appearance = (patch as { appearance?: { sidebarWidth?: unknown } } | null)?.appearance
      if (appearance && typeof appearance.sidebarWidth === 'number') {
        setSidebarWidth(result.value.appearance.sidebarWidth)
      }
    } else {
      showToast(result.error ?? '设置保存失败', true)
    }
  }

  async function persistDraft(content = contentRef.current): Promise<void> {
    const current = docRef.current
    if (!current) return
    if (!settingsRef.current.files.recovery) return
    if (!dirtyRef.current) return
    await window.api.drafts.save({
      id: draftIdRef.current,
      originalPath: current.path,
      displayName: current.displayName,
      content,
      encoding: current.encoding,
      eol: current.eol,
      finalNewline: current.finalNewline
    })
  }

  function scheduleDraft(content: string): void {
    if (!settingsRef.current.files.recovery) return
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    draftTimerRef.current = setTimeout(() => {
      void persistDraft(content)
    }, 1500)
  }

  function applySaved(payload: DocPayload, content: string, silent: boolean): void {
    const live = editorRef.current?.getContent() ?? content
    const dirtyAfter = live !== content
    const next: DocPayload = { ...payload, content: live }
    docRef.current = next
    savedRef.current = content
    contentRef.current = live
    dirtyRef.current = dirtyAfter
    setDirty(dirtyAfter)
    setDoc(next)
    setOutline(extractOutline(live))
    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current)
      draftTimerRef.current = null
    }
    void window.api.drafts.discard(draftIdRef.current).then(() => refreshDrafts())
    void refreshRecent()
    if (dirtyAfter) scheduleDraft(live)
    if (!silent) showToast('已保存')
  }

  function saveCurrent(saveAs = false, silent = false): Promise<boolean> {
    const active = saveTaskRef.current
    if (active) {
      if (silent) return Promise.resolve(false)
      return active.then(
        () => saveCurrent(saveAs, false),
        () => saveCurrent(saveAs, false)
      )
    }
    const task = performSave(saveAs, silent)
    saveTaskRef.current = task
    void task.then(
      () => {
        if (saveTaskRef.current === task) saveTaskRef.current = null
      },
      () => {
        if (saveTaskRef.current === task) saveTaskRef.current = null
      }
    )
    return task
  }

  async function performSave(saveAs = false, silent = false): Promise<boolean> {
    const current = docRef.current
    if (!current) return false
    const content = editorRef.current?.getContent() ?? contentRef.current
    const base = {
      path: current.path,
      content,
      encoding: current.encoding,
      eol: current.eol,
      finalNewline: current.finalNewline
    }
    let result
    if (saveAs || !current.path) {
      result = await window.api.files.saveAs(base)
    } else {
      result = await window.api.files.save({
        ...base,
        expectedMtimeMs: current.mtimeMs > 0 ? current.mtimeMs : undefined
      })
    }
    if (!result) return false
    if (docRef.current !== current) return result.ok
    if (!result.ok) {
      if (result.code === 'E_CONFLICT') {
        if (silent) {
          showToast(
            '自动保存失败：文件已被外部修改',
            true
          )
          return false
        }
        const overwrite = await window.api.dialog.confirm({
          message: '文件已被外部修改',
          detail: '是否覆盖磁盘上的版本？',
          confirmLabel: '覆盖'
        })
        if (!overwrite) return false
        const retry = await window.api.files.save({ ...base, expectedMtimeMs: undefined })
        if (retry.ok && retry.value) {
          applySaved(retry.value, content, silent)
          return true
        }
        showToast(retry.error ?? '保存失败', true)
        return false
      }
      showToast(result.error ?? '保存失败', true)
      return false
    }
    if (!result.value) return false
    applySaved(result.value, content, silent)
    return true
  }
  saveRef.current = saveCurrent

  async function ensureSaved(): Promise<boolean> {
    if (saveTaskRef.current) await saveTaskRef.current.catch(() => false)
    if (!docRef.current || !dirtyRef.current) return true
    const choice = await window.api.dialog.unsavedChanges(docRef.current.displayName)
    if (choice === 'cancel') return false
    if (choice === 'save') {
      const saved = await saveCurrent(false)
      if (!saved) return false
      if (dirtyRef.current) await persistDraft()
      return true
    }
    await persistDraft()
    return true
  }

  async function openFile(path: string, reveal?: PendingReveal): Promise<void> {
    if (docRef.current?.path === path) {
      if (reveal) editorRef.current?.revealPosition(reveal.line, reveal.column, reveal.length)
      return
    }
    if (!(await ensureSaved())) return
    const token = ++openTokenRef.current
    const result = await window.api.files.read(path)
    if (token !== openTokenRef.current) return
    if (!result.ok || !result.value) {
      showToast(result.error ?? '无法打开文件', true)
      return
    }
    pendingRevealRef.current = reveal ?? null
    setDocument(result.value)
    await window.api.recent.add(path)
    await refreshRecent()
  }
  openFileRef.current = openFile

  async function newFile(): Promise<void> {
    if (!(await ensureSaved())) return
    const current = settingsRef.current
    setDocument({
      path: null,
      displayName: '未命名',
      content: '',
      encoding: 'utf8',
      eol: current.editor.defaultEol === 'crlf' ? 'crlf' : 'lf',
      finalNewline: true,
      size: 0,
      mtimeMs: 0
    })
  }

  async function chooseFile(): Promise<void> {
    const path = await window.api.dialog.openFile()
    if (path) await openFile(path)
  }

  async function openFolderPath(path: string): Promise<void> {
    setFolder(path)
    setSidebarVisible(true)
    setTab('files')
    setFolderRefresh((value) => value + 1)
    setRecent(await window.api.recent.addFolder(path))
  }

  async function chooseFolder(): Promise<void> {
    const path = await window.api.dialog.openFolder()
    if (path) await openFolderPath(path)
  }

  function handleEditorChange(content: string): void {
    contentRef.current = content
    const isDirty = content !== savedRef.current
    if (isDirty !== dirtyRef.current) {
      dirtyRef.current = isDirty
      setDirty(isDirty)
    }
    if (statsTimerRef.current) clearTimeout(statsTimerRef.current)
    statsTimerRef.current = setTimeout(() => {
      setOutline(extractOutline(content))
    }, 250)
    scheduleDraft(content)
  }

  async function handleImage(data: Uint8Array, fileName: string): Promise<void> {
    const current = docRef.current
    if (!current?.path) {
      showToast('请先保存文档，再插入图片', true)
      return
    }
    const rawExt = (fileName.split('.').pop() ?? 'png').toLowerCase()
    const allowed = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif']
    const ext = allowed.includes(rawExt) ? rawExt : 'png'
    const result = await window.api.files.importImage({
      docPath: current.path,
      fileName: fileName || `image.${ext}`,
      ext,
      data
    })
    if (!result.ok || !result.value) {
      showToast(result.error ?? '图片保存失败', true)
      return
    }
    if (docRef.current !== current) return
    const alt = fileName.replace(/\.[^.]+$/, '')
    editorRef.current?.insertImage(alt, result.value.markdownPath)
  }

  async function chooseImage(): Promise<void> {
    const current = docRef.current
    if (!current?.path) {
      showToast('请先保存文档，再插入图片', true)
      return
    }
    const path = await window.api.dialog.openFile()
    if (!path || !/\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(path)) return
    const dir = dirName(current.path)
    const rel = relativePath(dir, path)
    const alt = baseName(path).replace(/\.[^.]+$/, '')
    editorRef.current?.insertImage(alt, encodeMarkdownUrl(rel))
  }

  function exportPayload(): { html: string; base: string; current: DocPayload; content: string } | null {
    const current = docRef.current
    if (!current) return null
    const content = editorRef.current?.getContent() ?? contentRef.current
    const base = current.displayName.replace(/\.[^.]+$/, '')
    const html = renderExportHtml(content, {
      docPath: current.path,
      title: base,
      theme: resolvedTheme,
      settings,
      includeToc: settings.export.html.includeToc
    })
    return { html, base, current, content }
  }

  async function exportHtml(): Promise<void> {
    const payload = exportPayload()
    if (!payload) return
    const suggested = joinPath(dirName(payload.current.path), `${payload.base}.html`)
    const result = await window.api.export.html({ html: payload.html, suggestedName: suggested })
    if (!result.ok) {
      showToast(result.error ?? '导出失败', true)
      return
    }
    if (result.value) {
      showToast('已导出 HTML')
      if (settings.export.general.openAfterExport) await window.api.shell.openPath(result.value)
    }
  }

  async function exportPandoc(format: PandocExportFormat): Promise<void> {
    const current = docRef.current
    if (!current) return
    const content = editorRef.current?.getContent() ?? contentRef.current
    const base = current.displayName.replace(/\.[^.]+$/, '')
    const suggested = joinPath(dirName(current.path), base + '.' + format)
    const labels: Record<PandocExportFormat, string> = {
      docx: 'Word',
      odt: 'ODT',
      rtf: 'RTF',
      epub: 'EPUB'
    }
    const result = await window.api.export.document({
      format,
      markdown: content,
      docPath: current.path,
      suggestedName: suggested,
      title: base,
      referenceDoc:
        format === 'docx' ? settings.export.docx.referenceDoc || undefined : undefined
    })
    if (!result.ok) {
      showToast(result.error ?? labels[format] + ' 导出失败', true)
      return
    }
    if (result.value) {
      showToast('已导出 ' + labels[format])
      if (settings.export.general.openAfterExport) await window.api.shell.openPath(result.value)
    }
  }

  async function exportPdf(): Promise<void> {
    const payload = exportPayload()
    if (!payload) return
    const suggested = joinPath(dirName(payload.current.path), `${payload.base}.pdf`)
    const result = await window.api.export.pdf({
      html: payload.html,
      suggestedName: suggested,
      pageSize: settings.export.pdf.pageSize,
      marginMm: settings.export.pdf.marginMm,
      printBackground: settings.export.pdf.printBackground
    })
    if (!result.ok) {
      showToast(result.error ?? 'PDF 导出失败', true)
      return
    }
    if (result.value) {
      showToast('已导出 PDF')
      if (settings.export.general.openAfterExport) await window.api.shell.openPath(result.value)
    }
  }

  async function printDocument(): Promise<void> {
    const payload = exportPayload()
    if (!payload) return
    const result = await window.api.export.print(payload.html)
    if (!result.ok) showToast(result.error ?? '打印失败', true)
  }

  async function restoreDraft(entry: DraftEntry): Promise<void> {
    if (!(await ensureSaved())) return
    const token = ++openTokenRef.current
    const result = await window.api.drafts.read(entry.id)
    if (token !== openTokenRef.current) return
    if (!result.ok || !result.value) {
      showToast(result.error ?? '草稿无法读取', true)
      return
    }
    const { content, entry: draft } = result.value
    let mtimeMs = 0
    if (draft.originalPath) {
      const disk = await window.api.files.read(draft.originalPath)
      if (disk.ok && disk.value) mtimeMs = disk.value.mtimeMs
    }
    if (token !== openTokenRef.current) return
    setDocument(
      {
        path: draft.originalPath,
        displayName: draft.displayName,
        content,
        encoding: draft.encoding,
        eol: draft.eol,
        finalNewline: draft.finalNewline,
        size: content.length,
        mtimeMs
      },
      { content, savedContent: '', dirty: true, draftId: draft.id }
    )
    showToast('已恢复草稿')
  }

  async function handleImportTypora(): Promise<void> {
    const result = await window.api.settings.importTypora()
    if (result.ok && result.value) {
      const next = result.value as Settings
      settingsRef.current = next
      setSettings(next)
      showToast('已从 Typora 导入设置')
    } else {
      showToast(result.error ?? '导入失败', true)
    }
  }

  function handleCommand(command: string, args?: unknown): void {
    switch (command) {
      case 'new-file':
        void newFile()
        return
      case 'open-file':
        void chooseFile()
        return
      case 'open-folder':
        void chooseFolder()
        return
      case 'open-folder-path': {
        const path = (args as { path?: string } | undefined)?.path
        if (path) void openFolderPath(path)
        return
      }
      case 'save':
        void saveCurrent(false)
        return
      case 'save-as':
        void saveCurrent(true)
        return
      case 'save-and-close':
        void (async () => {
          const saved = await saveCurrent(false)
          if (saved && dirtyRef.current) await persistDraft()
          await window.api.window.confirmClose(saved)
        })()
        return
      case 'export-html':
        void exportHtml()
        return
      case 'export-docx':
        void exportPandoc('docx')
        return
      case 'export-odt':
        void exportPandoc('odt')
        return
      case 'export-rtf':
        void exportPandoc('rtf')
        return
      case 'export-epub':
        void exportPandoc('epub')
        return
      case 'export-pdf':
        void exportPdf()
        return
      case 'print':
        void printDocument()
        return
      case 'toggle-sidebar':
        setSidebarVisible((value) => {
          const next = !value
          void updateSettings({ appearance: { sidebarVisible: next } })
          return next
        })
        return
      case 'toggle-source':
        setSourceMode((value) => {
          const next = !value
          try {
            window.localStorage.setItem('librepen:source-mode', next ? '1' : '0')
          } catch {}
          return next
        })
        return
      case 'toggle-focus':
        void updateSettings({ editor: { focusMode: !settingsRef.current.editor.focusMode } })
        return
      case 'toggle-typewriter':
        void updateSettings({
          editor: { typewriterMode: !settingsRef.current.editor.typewriterMode }
        })
        return
      case 'quick-open':
        setQuickOpen(true)
        return
      case 'recover-draft': {
        const entry = drafts[0]
        if (entry) void restoreDraft(entry)
        else showToast('没有可恢复的草稿')
        return
      }
      case 'set-theme': {
        const theme = args
        if (theme === 'light' || theme === 'dark' || theme === 'system') {
          void updateSettings({ appearance: { theme } })
        }
        return
      }
      case 'clear-recent':
        void window.api.recent.clear().then((store) => {
          setRecent(store)
          showToast('已清空最近记录')
        })
        return
      case 'settings':
        setSettingsOpen(true)
        return
      case 'image':
        void chooseImage()
        return
      case 'link':
        setPrompt({
          title: '插入链接',
          placeholder: 'https://example.com',
          initialValue: 'https://',
          onSubmit: (url) => {
            if (url) editorRef.current?.insertLink(url)
          }
        })
        return
      case 'open-folder-path-from-menu': {
        const path = (args as { path?: string } | undefined)?.path
        if (path) void openFolderPath(path)
        return
      }
      default:
        editorRef.current?.command(command, args)
    }
  }

  const startResize = (event: ReactMouseEvent): void => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = sidebarWidth
    let latest = startWidth
    const onMove = (moveEvent: MouseEvent): void => {
      latest = Math.min(400, Math.max(240, startWidth + moveEvent.clientX - startX))
      setSidebarWidth(latest)
    }
    const onUp = (): void => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      void updateSettings({ appearance: { sidebarWidth: latest } })
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  if (!ready) return <div className="loading-screen" />

  return (
    <div className="app">
      <TitleBar
        title={doc ? doc.displayName : 'LibrePen'}
        dirty={dirty}
        sidebarVisible={sidebarVisible}
        platform={appInfo?.platform ?? 'win32'}
        sourceMode={sourceMode}
        onToggleSidebar={() => handleCommand('toggle-sidebar')}
        onToggleSource={() => handleCommand('toggle-source')}
        onCommand={(command, args) => handleCommand(command, args)}
      />
      <div className="workspace">
        {sidebarVisible ? (
          <>
            <Sidebar
              tab={tab}
              folder={folder}
              recent={recent}
              outline={outline}
              cursorLine={cursor.line}
              activePath={doc?.path ?? null}
              refreshKey={folderRefresh}
              onTab={setTab}
              onOpenFile={(path) => void openFile(path)}
              onRefresh={() => setFolderRefresh((value) => value + 1)}
              onJump={(line) => editorRef.current?.scrollToLine(line)}
              onOpenHit={(hit: SearchHit) =>
                void openFile(hit.path, {
                  line: hit.line,
                  column: hit.column,
                  length: Math.max(1, hit.ranges[0] ? hit.ranges[0][1] - hit.ranges[0][0] : 1)
                })
              }
            />
            <div className="sidebar-resizer" onMouseDown={startResize} />
          </>
        ) : null}
        <main className="main">
          {doc ? (
            <Editor
              key={docKey}
              ref={editorRef}
              initialContent={doc.content}
              docPath={doc.path}
              settings={settings}
              theme={resolvedTheme}
              sourceMode={sourceMode}
              onChange={handleEditorChange}
              onCursor={(line, column) => setCursor({ line, column })}
              onImage={(data, fileName) => handleImage(data, fileName)}
              onDropPath={(path) => openFile(path)}
            />
          ) : (
            <div className="loading-screen" />
          )}
        </main>
      </div>
      <QuickOpen
        open={quickOpen}
        files={quickFiles}
        onOpen={(path) => {
          setQuickOpen(false)
          void openFile(path)
        }}
        onClose={() => setQuickOpen(false)}
      />
      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onChange={(patch) => void updateSettings(patch)}
        onOpenConfigDir={() => void window.api.settings.openConfigDir()}
        onImportTypora={() => void handleImportTypora()}
      />
      <PromptDialog
        open={Boolean(prompt)}
        title={prompt?.title ?? ''}
        placeholder={prompt?.placeholder}
        initialValue={prompt?.initialValue}
        onSubmit={(value) => {
          prompt?.onSubmit(value)
          setPrompt(null)
        }}
        onClose={() => setPrompt(null)}
      />
      <Toast message={toast?.message ?? null} error={toast?.error} />
    </div>
  )
}

function dirName(filePath: string | null): string {
  if (!filePath) return ''
  const index = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  return index >= 0 ? filePath.slice(0, index) : ''
}

function baseName(filePath: string): string {
  const index = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  return index >= 0 ? filePath.slice(index + 1) : filePath
}

function joinPath(dir: string, name: string): string {
  if (!dir) return name
  const separator = dir.includes('\\') ? '\\' : '/'
  return `${dir.replace(/[\\/]+$/, '')}${separator}${name}`
}
