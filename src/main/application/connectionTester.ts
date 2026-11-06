import type { ClusterInput, ConnectionTestResult } from '@shared/types'
import { buildDraftCluster } from '../domain/cluster'
import type { ClusterMonitor, ClusterRepository } from './ports'

/** "Test connection" use case: merges a form draft with stored secrets, then probes the API. */
export class ConnectionTester {
  constructor(
    private readonly clusters: ClusterRepository,
    private readonly monitor: ClusterMonitor
  ) {}

  async test(input: ClusterInput, existingId?: number): Promise<ConnectionTestResult> {
    const existing = existingId ? this.clusters.findById(existingId) : null
    const draft = buildDraftCluster(input, existing)
    try {
      return await this.monitor.testConnection(draft)
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
}
