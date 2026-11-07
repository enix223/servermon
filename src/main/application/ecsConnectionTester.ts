import type { EcsConnectionTestResult, EcsProfileInput } from '@shared/types'
import { buildDraftEcsProfile } from '../domain/ecsProfile'
import type { EcsMonitor, EcsProfileRepository } from './ports'

/** "Test connection" use case: merges a form draft with stored secrets, then probes the API. */
export class EcsConnectionTester {
  constructor(
    private readonly profiles: EcsProfileRepository,
    private readonly monitor: EcsMonitor
  ) {}

  async test(input: EcsProfileInput, existingId?: number): Promise<EcsConnectionTestResult> {
    const existing = existingId ? this.profiles.findById(existingId) : null
    const draft = buildDraftEcsProfile(input, existing)
    try {
      return await this.monitor.testConnection(draft)
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
}
