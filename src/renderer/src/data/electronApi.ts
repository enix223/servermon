import type { ServermonApi } from '@shared/api'

/**
 * Desktop adapter. Delegates to the preload bridge, which implements the same
 * contract over Electron IPC.
 *
 * For the planned web deployment, add an `httpApi.ts` that implements
 * `ServermonApi` with fetch() against the Next.js route handlers and pass it to
 * `<ApiProvider>` instead — no page or component changes are required.
 */
export function createElectronApi(): ServermonApi {
  return window.servermon
}
