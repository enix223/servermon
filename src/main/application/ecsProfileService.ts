import type { EcsProfileInput, EcsProfileRecord } from '@shared/types'
import {
  EcsProfileNotFoundError,
  normalizeEcsProfileInput,
  toPublicEcsProfile,
  type EcsProfileEntity
} from '../domain/ecsProfile'
import type { EcsProfileRepository } from './ports'

/** CRUD use cases for Alibaba Cloud connection profiles. Depends only on the repository port. */
export class EcsProfileService {
  constructor(private readonly profiles: EcsProfileRepository) {}

  list(): EcsProfileRecord[] {
    return this.profiles.findAll().map(toPublicEcsProfile)
  }

  /** Internal read used by the connection tester / instance polling; includes the secret. */
  getEntity(id: number): EcsProfileEntity | null {
    return this.profiles.findById(id)
  }

  create(input: EcsProfileInput): EcsProfileRecord {
    const now = new Date().toISOString()
    const normalized = normalizeEcsProfileInput(input, null)
    const created = this.profiles.insert({ ...normalized, createdAt: now, updatedAt: now })
    return toPublicEcsProfile(created)
  }

  update(id: number, input: EcsProfileInput): EcsProfileRecord {
    const existing = this.profiles.findById(id)
    if (!existing) throw new EcsProfileNotFoundError()

    const normalized = normalizeEcsProfileInput(input, existing)
    const updatedAt = new Date().toISOString()
    this.profiles.update(id, { ...normalized, createdAt: existing.createdAt, updatedAt })

    const updated = this.profiles.findById(id)
    if (!updated) throw new EcsProfileNotFoundError()
    return toPublicEcsProfile(updated)
  }

  delete(id: number): void {
    if (!this.profiles.findById(id)) throw new EcsProfileNotFoundError()
    this.profiles.delete(id)
  }
}
