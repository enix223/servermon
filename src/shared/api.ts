import type {
  AppInfo,
  AppSettings,
  ClusterInput,
  ClusterRecord,
  ConnectionTestResult,
  PodsResult,
  UpdateState
} from './types'

/**
 * The data API consumed by the renderer. Pages must depend on this interface
 * only — never on Electron IPC, SQLite, or Kubernetes clients.
 *
 * Desktop adapter: src/renderer/src/data/electronApi.ts (Electron IPC).
 * Planned web adapter: a fetch-based client in a Next.js app implementing the
 * same interface against REST routes:
 *
 *   GET    /api/clusters
 *   POST   /api/clusters
 *   PUT    /api/clusters/:id
 *   DELETE /api/clusters/:id
 *   POST   /api/clusters/test
 *   GET    /api/clusters/:id/pods
 *   GET    /api/settings
 *   PUT    /api/settings
 *   GET    /api/updates
 *   POST   /api/updates/check
 */
export interface ServermonApi {
  listClusters(): Promise<ClusterRecord[]>
  createCluster(input: ClusterInput): Promise<ClusterRecord>
  updateCluster(id: number, input: ClusterInput): Promise<ClusterRecord>
  deleteCluster(id: number): Promise<void>
  /**
   * Tests a draft form. For saved clusters, a blank token falls back to the
   * stored one so editing other fields does not require re-entering the token.
   */
  testCluster(input: ClusterInput, existingId?: number): Promise<ConnectionTestResult>
  listPods(clusterId: number): Promise<PodsResult>
  getSettings(): Promise<AppSettings>
  updateSettings(settings: AppSettings): Promise<AppSettings>
  getUpdateState(): Promise<UpdateState>
  checkForUpdates(): Promise<UpdateState>
  downloadUpdate(): Promise<UpdateState>
  installUpdate(): Promise<void>
  /** Subscribes to pushed update progress; returns an unsubscribe function. */
  onUpdateState(listener: (state: UpdateState) => void): () => void
  getAppInfo(): Promise<AppInfo>
}
