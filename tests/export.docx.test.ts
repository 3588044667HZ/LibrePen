import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(),
  showSaveDialog: vi.fn()
}))

vi.mock('node:child_process', () => ({ execFile: mocks.execFile }))
vi.mock('electron', () => ({
  BrowserWindow: class {},
  dialog: { showSaveDialog: mocks.showSaveDialog }
}))

import { ExportService } from '../src/main/services/export'

let dir = ''

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'librepen-docx-test-'))
  mocks.execFile.mockReset()
  mocks.showSaveDialog.mockReset()
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

function request(target: string, referenceDoc = '') {
  return {
    markdown: '# Title\n\nBody',
    docPath: null,
    suggestedName: target,
    referenceDoc
  }
}

describe('ExportService.exportDocx', () => {
  it('runs Pandoc and atomically writes the generated document', async () => {
    const target = path.join(dir, 'out.docx')
    mocks.showSaveDialog.mockResolvedValue({ canceled: false, filePath: target })
    mocks.execFile.mockImplementation((_command, args, _options, callback) => {
      const output = args[args.indexOf('--output') + 1]
      fs.writeFileSync(output, Buffer.from('fake-docx'))
      callback(null, '', '')
    })

    const saved = await new ExportService().exportDocx(null, request(target), undefined)

    expect(saved).toBe(target)
    expect(fs.readFileSync(target, 'utf8')).toBe('fake-docx')
    expect(mocks.execFile).toHaveBeenCalledTimes(1)
    const [command, args] = mocks.execFile.mock.calls[0]
    expect(command).toBe('pandoc')
    expect(args).toContain('--to')
    expect(args).toContain('docx')
    expect(args).toContain('--output')
  })

  it('passes a valid reference document to Pandoc', async () => {
    const target = path.join(dir, 'out.docx')
    const reference = path.join(dir, 'reference.docx')
    fs.writeFileSync(reference, Buffer.from('reference'))
    mocks.showSaveDialog.mockResolvedValue({ canceled: false, filePath: target })
    mocks.execFile.mockImplementation((_command, args, _options, callback) => {
      fs.writeFileSync(args[args.indexOf('--output') + 1], Buffer.from('fake-docx'))
      callback(null, '', '')
    })

    await new ExportService().exportDocx(null, request(target, reference), undefined)

    const args = mocks.execFile.mock.calls[0][1]
    expect(args).toContain('--reference-doc')
    expect(args).toContain(reference)
  })

  it('returns E_PANDOC_NOT_FOUND when Pandoc is missing', async () => {
    const target = path.join(dir, 'out.docx')
    mocks.showSaveDialog.mockResolvedValue({ canceled: false, filePath: target })
    mocks.execFile.mockImplementation((_command, _args, _options, callback) => {
      callback(Object.assign(new Error('spawn pandoc ENOENT'), { code: 'ENOENT' }), '', '')
    })

    await expect(
      new ExportService().exportDocx(null, request(target), undefined)
    ).rejects.toMatchObject({ code: 'E_PANDOC_NOT_FOUND' })
  })

  it('rejects missing reference documents before running Pandoc', async () => {
    const target = path.join(dir, 'out.docx')
    const missing = path.join(dir, 'missing.docx')
    mocks.showSaveDialog.mockResolvedValue({ canceled: false, filePath: target })

    await expect(
      new ExportService().exportDocx(null, request(target, missing), undefined)
    ).rejects.toMatchObject({ code: 'E_REFERENCE_DOC' })
    expect(mocks.execFile).not.toHaveBeenCalled()
  })
})
