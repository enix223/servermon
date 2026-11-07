import type { AppSettings } from '@shared/types'
import type { SettingsRepository } from './ports'

const REFRESH_INTERVAL_KEY = 'refresh_interval_seconds'
const ECS_REFRESH_INTERVAL_KEY = 'ecs_refresh_interval_seconds'
const DEFAULT_REFRESH_INTERVAL_SECONDS = 5
const MIN_REFRESH_INTERVAL_SECONDS = 1
const MAX_REFRESH_INTERVAL_SECONDS = 3600
const DEFAULT_ECS_REFRESH_INTERVAL_SECONDS = 60
/** The Alibaba Cloud OpenAPI is rate limited, so ECS polling has a higher floor. */
const MIN_ECS_REFRESH_INTERVAL_SECONDS = 10
const MAX_ECS_REFRESH_INTERVAL_SECONDS = 3600

/** Typed access to application settings, backed by the SettingsRepository port. */
export class SettingsService {
  constructor(private readonly settings: SettingsRepository) {}

  get(): AppSettings {
    const raw = this.settings.getAll()
    return {
      refreshIntervalSeconds: parseInterval(
        raw[REFRESH_INTERVAL_KEY],
        DEFAULT_REFRESH_INTERVAL_SECONDS,
        MIN_REFRESH_INTERVAL_SECONDS,
        MAX_REFRESH_INTERVAL_SECONDS
      ),
      ecsRefreshIntervalSeconds: parseInterval(
        raw[ECS_REFRESH_INTERVAL_KEY],
        DEFAULT_ECS_REFRESH_INTERVAL_SECONDS,
        MIN_ECS_REFRESH_INTERVAL_SECONDS,
        MAX_ECS_REFRESH_INTERVAL_SECONDS
      )
    }
  }

  update(input: AppSettings): AppSettings {
    const refreshIntervalSeconds = input?.refreshIntervalSeconds
    if (
      !Number.isInteger(refreshIntervalSeconds) ||
      refreshIntervalSeconds < MIN_REFRESH_INTERVAL_SECONDS ||
      refreshIntervalSeconds > MAX_REFRESH_INTERVAL_SECONDS
    ) {
      throw new Error(
        `Refresh interval must be a whole number between ${MIN_REFRESH_INTERVAL_SECONDS} and ${MAX_REFRESH_INTERVAL_SECONDS} seconds.`
      )
    }

    const ecsRefreshIntervalSeconds = input?.ecsRefreshIntervalSeconds
    if (
      !Number.isInteger(ecsRefreshIntervalSeconds) ||
      ecsRefreshIntervalSeconds < MIN_ECS_REFRESH_INTERVAL_SECONDS ||
      ecsRefreshIntervalSeconds > MAX_ECS_REFRESH_INTERVAL_SECONDS
    ) {
      throw new Error(
        `Alibaba Cloud refresh interval must be a whole number between ${MIN_ECS_REFRESH_INTERVAL_SECONDS} and ${MAX_ECS_REFRESH_INTERVAL_SECONDS} seconds.`
      )
    }

    this.settings.set({
      [REFRESH_INTERVAL_KEY]: String(refreshIntervalSeconds),
      [ECS_REFRESH_INTERVAL_KEY]: String(ecsRefreshIntervalSeconds)
    })
    return this.get()
  }
}

function parseInterval(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const value = Number(raw)
  if (Number.isInteger(value) && value >= min && value <= max) return value
  return fallback
}
