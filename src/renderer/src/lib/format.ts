export function formatAge(createdAt: string, now = Date.now()): string {
  const timestamp = Date.parse(createdAt)
  if (!Number.isFinite(timestamp)) return '—'
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

export function formatAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never'
  const timestamp = Date.parse(iso)
  if (!Number.isFinite(timestamp)) return 'never'
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000))
  if (seconds < 2) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function formatVersion(version: string | null | undefined): string {
  if (!version) return ''
  return version.startsWith('v') ? version : `v${version}`
}

export function formatLatency(ms: number): string {
  if (!Number.isFinite(ms)) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

export function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? 'Unknown error')
  // Electron wraps rejected ipcRenderer.invoke calls with this prefix.
  return message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
}
