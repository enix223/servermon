import type { ClusterInput, ClusterRecord } from '@shared/types'
import {
  ClusterNotFoundError,
  normalizeClusterInput,
  toPublicCluster,
  type ClusterEntity
} from '../domain/cluster'
import type { ClusterRepository } from './ports'

/** CRUD use cases for cluster connections. Depends only on the repository port. */
export class ClusterService {
  constructor(private readonly clusters: ClusterRepository) {}

  list(): ClusterRecord[] {
    return this.clusters.findAll().map(toPublicCluster)
  }

  /** Internal read used by the connection tester / pod polling; includes the token. */
  getEntity(id: number): ClusterEntity | null {
    return this.clusters.findById(id)
  }

  create(input: ClusterInput): ClusterRecord {
    const now = new Date().toISOString()
    const normalized = normalizeClusterInput(input, null)
    const created = this.clusters.insert({ ...normalized, createdAt: now, updatedAt: now })
    return toPublicCluster(created)
  }

  update(id: number, input: ClusterInput): ClusterRecord {
    const existing = this.clusters.findById(id)
    if (!existing) throw new ClusterNotFoundError()

    const normalized = normalizeClusterInput(input, existing)
    const updatedAt = new Date().toISOString()
    this.clusters.update(id, { ...normalized, createdAt: existing.createdAt, updatedAt })

    const updated = this.clusters.findById(id)
    if (!updated) throw new ClusterNotFoundError()
    return toPublicCluster(updated)
  }

  delete(id: number): void {
    if (!this.clusters.findById(id)) throw new ClusterNotFoundError()
    this.clusters.delete(id)
  }
}
