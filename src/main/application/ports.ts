import type { ConnectionTestResult, PodsResult, UpdateState } from '@shared/types'
import type { ClusterDraft, ClusterEntity } from '../domain/cluster'

/**
 * Persistence port for cluster connections (Repository pattern).
 *
 * Implementations:
 *  - SqliteClusterRepository (desktop)
 *  - a future PostgresClusterRepository for the web deployment
 *
 * Application services depend only on this interface.
 */
export interface ClusterRepository {
  findAll(): ClusterEntity[]
  findById(id: number): ClusterEntity | null
  insert(cluster: ClusterDraft): ClusterEntity
  update(id: number, cluster: ClusterDraft): void
  delete(id: number): void
}

/**
 * Persistence port for application settings. The SQLite implementation stores
 * key/value rows; a future Postgres implementation can do the same.
 */
export interface SettingsRepository {
  getAll(): Record<string, string>
  set(values: Record<string, string>): void
}

/**
 * Outbound port for live cluster communication.
 *
 * Implementations:
 *  - KubernetesClusterMonitor (desktop main process)
 *  - the same implementation can run on the web backend unchanged
 */
export interface ClusterMonitor {
  testConnection(cluster: ClusterEntity): Promise<ConnectionTestResult>
  listPods(cluster: ClusterEntity): Promise<PodsResult>
  /** Drops cached clients/version info after a connection is edited or removed. */
  invalidate(clusterId: number): void
}

/**
 * Application-update port. The desktop implementation wraps electron-updater;
 * a web deployment could expose a deployment-version check instead.
 */
export interface AppUpdater {
  getState(): UpdateState
  check(): Promise<UpdateState>
  download(): Promise<UpdateState>
  install(): void
  onStateChange(listener: (state: UpdateState) => void): () => void
}
