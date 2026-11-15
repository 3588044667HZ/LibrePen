import { session } from 'electron'

const PRODUCTION_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' mdimg: data: blob: https:; font-src 'self' data:; connect-src 'self'; frame-src 'none'; object-src 'none'"

const DEVELOPMENT_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' mdimg: data: blob: https:; font-src 'self' data:; connect-src 'self' ws://localhost:* http://localhost:* ws://127.0.0.1:* http://127.0.0.1:*; frame-src 'none'; object-src 'none'"

export function installContentSecurityPolicy(): void {
  const policy = process.env['ELECTRON_RENDERER_URL'] ? DEVELOPMENT_CSP : PRODUCTION_CSP
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (typeof details.url !== 'string' || !/^(https?|file):/i.test(details.url)) {
      callback({})
      return
    }
    const headers: Record<string, string[]> = {}
    for (const [name, value] of Object.entries(details.responseHeaders ?? {})) {
      if (name.toLowerCase() === 'content-security-policy') continue
      if (Array.isArray(value)) headers[name] = value
    }
    headers['Content-Security-Policy'] = [policy]
    callback({ responseHeaders: headers })
  })
}
