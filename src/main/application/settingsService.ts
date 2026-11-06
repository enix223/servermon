import type { AppSettings } from '@shared/types'
import type { SettingsRepository } from './ports'

const REFRESH_INTERVAL_KEY = 'refresh_interval_seconds'
const DEFAULT_REFRESH_INTERVAL_SECONDS = 5
const MIN_REFRESH_INTERVAL_SECONDS = 1
const MAX_REFRESH_INTERVAL_SECONDS = 3600

/** Typed access to application settings, backed by the SettingsRepository port. */
export class SettingsService {
  constructor(private readonly settings: SettingsRepository) {}

  get(): AppSettings {
    const raw = this.settings.getAll()[REFRESH_INTERVAL_KEY]
    return { refreshIntervalSeconds: parseRefreshInterval(raw) }
  }

  update(input: AppSettings): AppSettings {
    const value = input?.refreshIntervalSeconds
    if (
      !Number.isInteger(value) ||
      value < MIN_REFRESH_INTERVAL_SECONDS ||
      value > MAX_REFRESH_INTERVAL_SECONDS
    ) {
      throw new Error(
        `Refresh interval must be a whole number between ${MIN_REFRESH_INTERVAL_SECONDS} and ${MAX_REFRESH_INTERVAL_SECONDS} seconds.`
      )
    }
    this.settings.set({ [REFRESH_INTERVAL_KEY]: String(value) })
    return this.get()
  }
}

function parseRefreshInterval(raw: string | undefined): number {
  const value = Number(raw)
  if (
    Number.isInteger(value) &&
    value >= MIN_REFRESH_INTERVAL_SECONDS &&
    value <= MAX_REFRESH_INTERVAL_SECONDS
  ) {
    return value
  }
  return DEFAULT_REFRESH_INTERVAL_SECONDS
}
