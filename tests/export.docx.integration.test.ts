import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const mocks = vi.hoisted(() => ({ showSaveDialog: vi.fn() }))
vi.mock('electron', () => ({
  BrowserWindow: class {},
  dialog: { showSaveDialog: mocks.showSaveDialog }
}))

import { ExportService } from '../src/main/services/export'

const pandocPath =
  process.env.PANDOC_PATH ||
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Pandoc', 'pandoc.exe')
const available = Boolean(pandocPath && fs.existsSync(pandocPath))
const testIfPandoc = available ? it : it.skip

let dir = ''

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'librepen-docx-integration-'))
  mocks.showSaveDialog.mockReset()
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('ExportService.exportDocx integration', () => {
  testIfPandoc('creates a real DOCX through Pandoc', async () => {
    const target = path.join(dir, 'integration.docx')
    mocks.showSaveDialog.mockResolvedValue({ canceled: false, filePath: target })
    const markdown = [
      '---',
      'title: Integration Test',
      '---',
      '',
      '# Heading',
      '',
      'A paragraph with **bold** and $E = mc^2$.',
      '',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
      ''
    ].join('\n')

    const saved = await new ExportService().exportDocx(
      null,
      { markdown, docPath: null, suggestedName: target, referenceDoc: '' },
      pandocPath
    )

    expect(saved).toBe(target)
    const data = fs.readFileSync(target)
    expect(data.length).toBeGreaterThan(1000)
    expect(data.subarray(0, 4).toString('binary')).toBe('PK\u0003\u0004')
  })
})
