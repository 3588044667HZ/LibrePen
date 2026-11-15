import fs from 'node:fs/promises'
import { protocol } from 'electron'
import { decodeImageUrlPath, mimeForImage, resolveSafeImagePath } from './paths'

const MAX_IMAGE_SIZE = 32 * 1024 * 1024

export function registerImageScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'mdimg',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: false
      }
    }
  ])
}

export function registerImageProtocol(): void {
  protocol.handle('mdimg', async (request) => {
    try {
      const url = new URL(request.url)
      if (
        url.protocol !== 'mdimg:' ||
        url.hostname !== 'local' ||
        url.port ||
        url.username ||
        url.password
      ) {
        return new Response('Not found', { status: 404 })
      }
      const raw = decodeImageUrlPath(url.pathname)
      if (!raw) return new Response('Bad request', { status: 400 })
      const filePath = resolveSafeImagePath(raw)
      if (!filePath) return new Response('Forbidden', { status: 403 })
      const stat = await fs.stat(filePath)
      if (!stat.isFile() || stat.size > MAX_IMAGE_SIZE) {
        return new Response('Not found', { status: 404 })
      }
      const data = await fs.readFile(filePath)
      if (data.byteLength > MAX_IMAGE_SIZE) return new Response('Not found', { status: 404 })
      return new Response(data, {
        status: 200,
        headers: {
          'Content-Type': mimeForImage(filePath),
          'Content-Length': String(data.byteLength),
          'Cache-Control': 'no-cache',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox"
        }
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}
