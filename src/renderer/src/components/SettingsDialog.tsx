import { useEffect, useState } from 'react'
import type { Settings, ThemeInfo } from '@shared/types'

interface SettingsDialogProps {
  open: boolean
  settings: Settings
  onClose(): void
  onChange(patch: unknown): void
  onOpenConfigDir(): void
  onImportTypora(): void
}

type Tab = 'general' | 'editor' | 'files' | 'appearance' | 'export' | 'advanced'

export function SettingsDialog(props: SettingsDialogProps) {
  const [tab, setTab] = useState<Tab>('general')
  const [themes, setThemes] = useState<ThemeInfo[]>([])

  const refreshThemes = (): void => {
    void window.api.themes.list().then(setThemes)
  }

  useEffect(() => {
    if (!props.open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') props.onClose()
    }
    window.addEventListener('keydown', onKey)
    refreshThemes()
    return () => window.removeEventListener('keydown', onKey)
  }, [props.open, props.onClose])

  if (!props.open) return null
  const { settings } = props

  const patchEditor = (patch: Partial<Settings['editor']>): void =>
    props.onChange({ editor: patch })
  const patchFiles = (patch: Partial<Settings['files']>): void => props.onChange({ files: patch })
  const patchAppearance = (patch: Partial<Settings['appearance']>): void =>
    props.onChange({ appearance: patch })
  const patchGeneral = (patch: Partial<Settings['general']>): void =>
    props.onChange({ general: patch })
  const patchExport = (patch: Record<string, unknown>): void => props.onChange({ export: patch })

  return (
    <div
      className="dialog-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose()
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-label="设置">
        <div className="dialog-header">
          <h2>设置</h2>
          <button className="icon-btn" aria-label="关闭设置" onClick={props.onClose}>
            ×
          </button>
        </div>
        <div className="settings-tabs">
          {(
            [
              ['general', '通用'],
              ['editor', '编辑器'],
              ['files', '文件'],
              ['appearance', '外观'],
              ['export', '导出'],
              ['advanced', '高级']
            ] as Array<[Tab, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              className={tab === value ? 'active' : ''}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="dialog-body">
          {tab === 'general' ? (
            <>
              <Row label="启动时" hint="决定应用启动后恢复什么内容">
                <select
                  value={settings.general.restoreWhenLaunch}
                  onChange={(event) =>
                    patchGeneral({
                      restoreWhenLaunch: event.target.value as Settings['general']['restoreWhenLaunch']
                    })
                  }
                >
                  <option value="new">显示欢迎页</option>
                  <option value="lastFile">恢复上次文件</option>
                  <option value="lastFolder">恢复上次文件夹</option>
                </select>
              </Row>
              <Row label="关闭前确认" hint="有未保存修改时询问">
                <Toggle
                  checked={settings.general.confirmExit}
                  onChange={(value) => patchGeneral({ confirmExit: value })}
                />
              </Row>
            </>
          ) : null}

          {tab === 'editor' ? (
            <>
              <Row label="字体" hint="CSS font-family">
                <input
                  type="text"
                  value={settings.editor.fontFamily}
                  onChange={(event) => patchEditor({ fontFamily: event.target.value })}
                />
              </Row>
              <Row label="字号">
                <NumberInput
                  value={settings.editor.fontSize}
                  min={12}
                  max={24}
                  onChange={(value) => patchEditor({ fontSize: value })}
                />
              </Row>
              <Row label="行高">
                <NumberInput
                  value={settings.editor.lineHeight}
                  min={1.4}
                  max={2.2}
                  step={0.05}
                  onChange={(value) => patchEditor({ lineHeight: value })}
                />
              </Row>
              <Row label="Tab 宽度">
                <select
                  value={settings.editor.tabSize}
                  onChange={(event) => patchEditor({ tabSize: Number(event.target.value) })}
                >
                  <option value={2}>2 空格</option>
                  <option value={4}>4 空格</option>
                </select>
              </Row>
              <Row label="自动换行">
                <Toggle
                  checked={settings.editor.lineWrapping}
                  onChange={(value) => patchEditor({ lineWrapping: value })}
                />
              </Row>
              <Row label="显示行号">
                <Toggle
                  checked={settings.editor.showLineNumbers}
                  onChange={(value) => patchEditor({ showLineNumbers: value })}
                />
              </Row>
              <Row label="自动配对括号">
                <Toggle
                  checked={settings.editor.autoPair}
                  onChange={(value) => patchEditor({ autoPair: value })}
                />
              </Row>
              <Row label="实时预览" hint="关闭后等价于源码模式">
                <Toggle
                  checked={settings.editor.livePreview}
                  onChange={(value) => patchEditor({ livePreview: value })}
                />
              </Row>
              <Row label="行内数学">
                <Toggle
                  checked={settings.editor.inlineMath}
                  onChange={(value) => patchEditor({ inlineMath: value })}
                />
              </Row>
              <Row label="拼写检查">
                <Toggle
                  checked={settings.editor.spellcheck}
                  onChange={(value) => patchEditor({ spellcheck: value })}
                />
              </Row>
              <Row label="专注模式" hint="淡化当前段落以外的内容">
                <Toggle
                  checked={settings.editor.focusMode}
                  onChange={(value) => patchEditor({ focusMode: value })}
                />
              </Row>
              <Row label="打字机模式" hint="光标始终保持在视口中央">
                <Toggle
                  checked={settings.editor.typewriterMode}
                  onChange={(value) => patchEditor({ typewriterMode: value })}
                />
              </Row>
              <Row label="默认换行符">
                <select
                  value={settings.editor.defaultEol}
                  onChange={(event) =>
                    patchEditor({ defaultEol: event.target.value as Settings['editor']['defaultEol'] })
                  }
                >
                  <option value="auto">跟随文件</option>
                  <option value="lf">LF</option>
                  <option value="crlf">CRLF</option>
                </select>
              </Row>
              <Row label="末尾换行">
                <select
                  value={settings.editor.finalNewline}
                  onChange={(event) =>
                    patchEditor({
                      finalNewline: event.target.value as Settings['editor']['finalNewline']
                    })
                  }
                >
                  <option value="auto">跟随文件</option>
                  <option value="always">始终添加</option>
                  <option value="never">始终移除</option>
                </select>
              </Row>
            </>
          ) : null}

          {tab === 'files' ? (
            <>
              <Row label="自动保存" hint="已有路径的文档定时静默保存">
                <Toggle
                  checked={settings.files.autoSave}
                  onChange={(value) => patchFiles({ autoSave: value })}
                />
              </Row>
              <Row label="自动保存间隔（分钟）">
                <NumberInput
                  value={settings.files.autoSaveIntervalMin}
                  min={1}
                  max={60}
                  onChange={(value) => patchFiles({ autoSaveIntervalMin: value })}
                />
              </Row>
              <Row label="恢复草稿" hint="失焦或关闭时保存恢复快照">
                <Toggle
                  checked={settings.files.recovery}
                  onChange={(value) => patchFiles({ recovery: value })}
                />
              </Row>
              <Row label="默认扩展名">
                <input
                  type="text"
                  value={settings.files.defaultExtension}
                  onChange={(event) => patchFiles({ defaultExtension: event.target.value })}
                />
              </Row>
              <Row label="最近文件数量">
                <NumberInput
                  value={settings.files.recentLimit}
                  min={10}
                  max={200}
                  onChange={(value) => patchFiles({ recentLimit: value })}
                />
              </Row>
              <Row label="显示隐藏文件">
                <Toggle
                  checked={settings.files.showHiddenFiles}
                  onChange={(value) => patchFiles({ showHiddenFiles: value })}
                />
              </Row>
              <Row label="图片保存位置">
                <select
                  value={settings.files.imageFolder}
                  onChange={(event) =>
                    patchFiles({ imageFolder: event.target.value as Settings['files']['imageFolder'] })
                  }
                >
                  <option value="assets">文档目录 / assets</option>
                  <option value="same">与文档同目录</option>
                  <option value="custom">自定义文件夹</option>
                </select>
              </Row>
              {settings.files.imageFolder === 'custom' ? (
                <Row label="自定义图片文件夹" hint="相对路径基于文档目录">
                  <input
                    type="text"
                    value={settings.files.imageCustomFolder}
                    onChange={(event) => patchFiles({ imageCustomFolder: event.target.value })}
                  />
                </Row>
              ) : null}
              <Row label="粘贴图片时复制到文件夹">
                <Toggle
                  checked={settings.files.copyImagesOnPaste}
                  onChange={(value) => patchFiles({ copyImagesOnPaste: value })}
                />
              </Row>
            </>
          ) : null}

          {tab === 'appearance' ? (
            <>
              <Row label="主题">
                <select
                  value={settings.appearance.theme}
                  onChange={(event) =>
                    patchAppearance({
                      theme: event.target.value as Settings['appearance']['theme']
                    })
                  }
                >
                  <option value="system">跟随系统</option>
                  <option value="light">浅色</option>
                  <option value="dark">深色</option>
                </select>
              </Row>
              <Row label="自定义主题" hint="userData/themes 下的 CSS 文件">
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select
                    value={settings.appearance.customTheme}
                    onChange={(event) => patchAppearance({ customTheme: event.target.value })}
                  >
                    <option value="">无</option>
                    {themes
                      .filter((theme) => !theme.isUserFile)
                      .map((theme) => (
                        <option key={theme.name} value={theme.name}>
                          {theme.name}
                        </option>
                      ))}
                    {settings.appearance.customTheme &&
                    !themes.some((theme) => theme.name === settings.appearance.customTheme) ? (
                      <option value={settings.appearance.customTheme}>
                        {settings.appearance.customTheme}
                      </option>
                    ) : null}
                  </select>
                  <button className="btn" onClick={refreshThemes}>
                    刷新
                  </button>
                  <button className="btn" onClick={() => void window.api.themes.openFolder()}>
                    打开目录
                  </button>
                </div>
              </Row>
              <Row label="侧栏宽度">
                <NumberInput
                  value={settings.appearance.sidebarWidth}
                  min={240}
                  max={400}
                  onChange={(value) => patchAppearance({ sidebarWidth: value })}
                />
              </Row>
            </>
          ) : null}

          {tab === 'export' ? (
            <>
              <Row label="导出后打开文件">
                <Toggle
                  checked={settings.export.general.openAfterExport}
                  onChange={(value) => patchExport({ general: { openAfterExport: value } })}
                />
              </Row>
              <Row label="HTML 包含目录">
                <Toggle
                  checked={settings.export.html.includeToc}
                  onChange={(value) => patchExport({ html: { includeToc: value } })}
                />
              </Row>
              <Row label="PDF 纸张">
                <select
                  value={settings.export.pdf.pageSize}
                  onChange={(event) =>
                    patchExport({
                      pdf: { pageSize: event.target.value as Settings['export']['pdf']['pageSize'] }
                    })
                  }
                >
                  <option value="A4">A4</option>
                  <option value="Letter">Letter</option>
                  <option value="A5">A5</option>
                  <option value="Legal">Legal</option>
                </select>
              </Row>
              <Row label="PDF 页边距（mm）">
                <NumberInput
                  value={settings.export.pdf.marginMm}
                  min={0}
                  max={60}
                  onChange={(value) => patchExport({ pdf: { marginMm: value } })}
                />
              </Row>
              <Row label="Pandoc 路径" hint="可选，用于后续导入/导出">
                <input
                  type="text"
                  value={settings.export.pandoc.path ?? ''}
                  placeholder="自动检测"
                  onChange={(event) => patchExport({ pandoc: { path: event.target.value } })}
                />
              </Row>
            </>
          ) : null}

          {tab === 'advanced' ? (
            <>
              <Row label="启用开发者工具">
                <Toggle
                  checked={settings.advanced.devTools}
                  onChange={(value) => props.onChange({ advanced: { devTools: value } })}
                />
              </Row>
              <Row
                label="自定义快捷键"
                hint={`${Object.keys(settings.advanced.keybindings).length} 条映射（来自 Typora 导入）`}
              >
                <span />
              </Row>
              <Row label="配置文件" hint="settings.json / recent.json / draftsRecover">
                <button className="btn" onClick={props.onOpenConfigDir}>
                  打开目录
                </button>
              </Row>
              <Row label="从 Typora 导入" hint="读取 %APPDATA%\\Typora\\conf\\conf.user.json">
                <button className="btn" onClick={props.onImportTypora}>
                  导入
                </button>
              </Row>
            </>
          ) : null}
        </div>
        <div className="dialog-footer">
          <button className="btn primary" onClick={props.onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="form-row">
      <label>
        <span>{label}</span>
        {hint ? <span className="hint">{hint}</span> : null}
      </label>
      {children}
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange(value: boolean): void }) {
  return (
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
  )
}

function NumberInput({
  value,
  min,
  max,
  step = 1,
  onChange
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange(value: number): void
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(event) => {
        const next = Number(event.target.value)
        if (Number.isFinite(next)) onChange(next)
      }}
    />
  )
}
