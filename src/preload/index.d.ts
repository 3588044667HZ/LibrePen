import type { LibrePenApi } from '@shared/api'

declare global {
  interface Window {
    api: LibrePenApi
  }
}

export {}
