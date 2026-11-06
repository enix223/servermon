/// <reference types="vite/client" />

import type { ServermonApi } from '@shared/api'

declare global {
  interface Window {
    servermon: ServermonApi
  }
}

export {}
