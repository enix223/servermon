import { createContext, useContext, type ReactNode } from 'react'
import type { ServermonApi } from '@shared/api'

const ApiContext = createContext<ServermonApi | null>(null)

interface ApiProviderProps {
  api: ServermonApi
  children: ReactNode
}

/**
 * Injects the data API implementation into the component tree. Pages and
 * components only ever see the `ServermonApi` interface, so the desktop
 * (Electron IPC) and web (fetch/HTTP) adapters are interchangeable.
 */
export function ApiProvider({ api, children }: ApiProviderProps) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>
}

export function useApi(): ServermonApi {
  const api = useContext(ApiContext)
  if (!api) throw new Error('useApi must be used inside <ApiProvider>.')
  return api
}
