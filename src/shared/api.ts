import type {
  AppInfo,
  AppSettings,
  ClusterInput,
  ClusterRecord,
  ConnectionTestResult,
  EcsConnectionTestResult,
  EcsInstancesResult,
  EcsProfileInput,
  EcsProfileRecord,
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
 *   GET    /api/ecs/profiles
 *   POST   /api/ecs/profiles
 *   PUT    /api/ecs/profiles/:id
 *   DELETE /api/ecs/profiles/:id
 *   POST   /api/ecs/profiles/test
 *   GET    /api/ecs/profiles/:id/instances
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

  listEcsProfiles(): Promise<EcsProfileRecord[]>
  createEcsProfile(input: EcsProfileInput): Promise<EcsProfileRecord>
  updateEcsProfile(id: number, input: EcsProfileInput): Promise<EcsProfileRecord>
  deleteEcsProfile(id: number): Promise<void>
  /**
   * Tests a draft form. For saved profiles, a blank secret falls back to the
   * stored one so editing other fields does not require re-entering it.
   */
  testEcsProfile(input: EcsProfileInput, existingId?: number): Promise<EcsConnectionTestResult>
  listEcsInstances(profileId: number): Promise<EcsInstancesResult>

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
