import iconv from 'iconv-lite'
import jschardet from 'jschardet'
import type { Encoding } from '@shared/types'

export interface DecodeResult {
  content: string
  encoding: Encoding
}

function decodeUtf8Strict(buffer: Buffer): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return null
  }
}

function mapDetected(encoding: string): Encoding {
  const value = encoding.toUpperCase()
  if (value.includes('UTF-8')) return 'utf8'
  if (value.includes('GB') || value.includes('936')) return 'gbk'
  if (value.includes('BIG5')) return 'big5'
  if (value.includes('SHIFT') || value.includes('SJIS') || value.includes('932')) return 'shift_jis'
  return 'latin1'
}

export function decodeBuffer(buffer: Buffer): DecodeResult {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return {
      content: decodeUtf8Strict(buffer.subarray(3)) ?? iconv.decode(buffer.subarray(3), 'utf8'),
      encoding: 'utf8-bom'
    }
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return { content: iconv.decode(buffer.subarray(2), 'utf16le'), encoding: 'utf16le' }
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const body = buffer.subarray(2)
    const swapped = Buffer.from(body.subarray(0, body.length - (body.length % 2)))
    swapped.swap16()
    return { content: iconv.decode(swapped, 'utf16le'), encoding: 'utf16be' }
  }

  const utf8 = decodeUtf8Strict(buffer)
  if (utf8 !== null) return { content: utf8, encoding: 'utf8' }

  const detected = jschardet.detect(buffer)
  const encoding = mapDetected(detected.encoding ?? '')
  const iconvName =
    encoding === 'gbk' ? 'gbk' : encoding === 'big5' ? 'big5' : encoding === 'shift_jis' ? 'shift_jis' : 'latin1'
  return { content: iconv.decode(buffer, iconvName), encoding }
}

export function encodeContent(content: string, encoding: Encoding): Buffer {
  switch (encoding) {
    case 'utf8-bom':
      return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(content, 'utf8')])
    case 'utf16le':
      return Buffer.concat([Buffer.from([0xff, 0xfe]), iconv.encode(content, 'utf16le')])
    case 'utf16be': {
      const le = iconv.encode(content, 'utf16le')
      const buffer = Buffer.from(le)
      buffer.swap16()
      return Buffer.concat([Buffer.from([0xfe, 0xff]), buffer])
    }
    case 'gbk':
      return iconv.encode(content, 'gbk')
    case 'big5':
      return iconv.encode(content, 'big5')
    case 'shift_jis':
      return iconv.encode(content, 'shift_jis')
    case 'latin1':
      return iconv.encode(content, 'latin1')
    case 'utf8':
    default:
      return Buffer.from(content, 'utf8')
  }
}
