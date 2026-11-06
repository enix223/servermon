import { useEffect, useState, type FormEvent } from 'react'
import type { AppSettings, UpdatePhase, UpdateState } from '@shared/types'
import { AlertIcon, RefreshIcon, SpinnerIcon } from './Icons'
import { useApi } from '../data/ApiContext'
import { errorMessage } from '../lib/format'
import type { ToastTone } from '../lib/ui'

const PRESETS = [2, 5, 10, 30, 60]

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

function updateStatusText(state: UpdateState): string {
  switch (state.phase) {
    case 'idle':
      return 'Not checked yet.'
    case 'checking':
      return 'Checking for updates…'
    case 'available':
      return `Version ${state.availableVersion ?? ''} is available.`
    case 'downloading':
      return `Downloading version ${state.availableVersion ?? ''}…`
    case 'downloaded':
      return `Version ${state.availableVersion ?? ''} is ready to install.`
    case 'up-to-date':
      return 'You are running the latest version.'
    case 'error':
      return state.error ?? 'Update check failed.'
    case 'unsupported':
      return state.message ?? 'Updates are unavailable in this build.'
  }
}

function updatePhaseLabel(phase: UpdatePhase): string {
  switch (phase) {
    case 'checking':
      return 'Checking'
    case 'available':
      return 'Update available'
    case 'downloading':
      return 'Downloading'
    case 'downloaded':
      return 'Ready to install'
    case 'up-to-date':
      return 'Up to date'
    case 'error':
      return 'Error'
    case 'unsupported':
      return 'Unavailable'
    case 'idle':
      return 'Idle'
  }
}

function updatePhaseClass(phase: UpdatePhase): string {
  switch (phase) {
    case 'available':
    case 'downloading':
      return 'border-accent/35 bg-accent/10 text-[#bcd7ff]'
    case 'downloaded':
    case 'up-to-date':
      return 'border-ok/30 bg-ok/10 text-[#7ee2b8]'
    case 'error':
      return 'border-err/30 bg-err/10 text-[#ffa2a2]'
    default:
      return 'border-line bg-white/[0.03] text-dim'
  }
}

interface SettingsPageProps {
  settings: AppSettings
  onSaved: (settings: AppSettings) => void
  toast: (message: string, tone?: ToastTone) => void
}

export function SettingsPage({ settings, onSaved, toast }: SettingsPageProps) {
  const api = useApi()
  const [value, setValue] = useState(String(settings.refreshIntervalSeconds))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [update, setUpdate] = useState<UpdateState | null>(null)
  const [updateAction, setUpdateAction] = useState<'check' | 'download' | null>(null)

  useEffect(() => {
    setValue(String(settings.refreshIntervalSeconds))
  }, [settings.refreshIntervalSeconds])

  useEffect(() => {
    let mounted = true
    void api
      .getUpdateState()
      .then((state) => {
        if (mounted) setUpdate(state)
      })
      .catch(() => undefined)
    const unsubscribe = api.onUpdateState((state) => {
      if (mounted) setUpdate(state)
    })
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [api])

  const dirty = value !== String(settings.refreshIntervalSeconds)

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const interval = Number(value)
    if (!Number.isInteger(interval) || interval < 1 || interval > 3600) {
      setError('Refresh interval must be a whole number between 1 and 3600 seconds.')
      return
    }

    setError(null)
    setSaving(true)
    try {
      const updated = await api.updateSettings({ refreshIntervalSeconds: interval })
      onSaved(updated)
      toast(`Refresh interval set to ${updated.refreshIntervalSeconds}s.`, 'ok')
    } catch (caught) {
      const message = errorMessage(caught)
      setError(message)
      toast(message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function runUpdateAction(action: 'check' | 'download'): Promise<void> {
    setUpdateAction(action)
    try {
      const state =
        action === 'check' ? await api.checkForUpdates() : await api.downloadUpdate()
      setUpdate(state)
      if (state.phase === 'error') toast(state.error ?? 'Update failed.', 'error')
    } catch (caught) {
      toast(errorMessage(caught), 'error')
    } finally {
      setUpdateAction(null)
    }
  }

  async function installUpdate(): Promise<void> {
    try {
      await api.installUpdate()
    } catch (caught) {
      toast(errorMessage(caught), 'error')
    }
  }

  return (
    <div className="mx-auto w-full max-w-[900px] px-6 pt-[26px] pb-10">
      <div className="mb-5">
        <h1 className="m-0 text-2xl font-semibold tracking-[-0.02em]">Settings</h1>
        <p className="mt-[7px] max-w-[640px] text-[12.5px] leading-[1.5] text-muted">
          Preferences for this ServerMon installation.
        </p>
      </div>

      <form
        className="overflow-hidden rounded-panel border border-line bg-panel"
        onSubmit={handleSubmit}
        data-testid="settings-form"
      >
        <div className="border-b border-line px-5 py-4">
          <h2 className="m-0 text-sm font-semibold">Monitoring</h2>
          <p className="mt-1 text-xs text-muted">Controls how often every cluster is polled.</p>
        </div>

        <div className="flex flex-col gap-5 px-5 py-5">
          <div className="flex max-w-[560px] flex-col gap-2">
            <label className="field-label" htmlFor="refresh-interval">
              Refresh interval
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-40">
                <input
                  id="refresh-interval"
                  data-testid="refresh-interval"
                  className="text-input pr-16 font-mono"
                  type="number"
                  min={1}
                  max={3600}
                  step={1}
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[11px] text-dim">
                  seconds
                </span>
              </div>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving || !dirty}
                data-testid="save-settings"
              >
                {saving && <SpinnerIcon />}
                Save
              </button>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`filter-chip ${Number(value) === preset ? 'active' : ''}`}
                  onClick={() => setValue(String(preset))}
                >
                  {preset}s
                </button>
              ))}
            </div>

            <p className="m-0 text-[10.5px] leading-[1.45] text-dim">
              Whole seconds, 1–3600. Currently refreshing every{' '}
              {settings.refreshIntervalSeconds} seconds. Lower values increase load on the
              Kubernetes API servers.
            </p>

            {error && (
              <div className="form-error" role="alert">
                <AlertIcon size={15} />
                {error}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-line bg-white/[0.015] px-3.5 py-3 text-[11.5px] leading-[1.55] text-muted">
            Settings live in the local SQLite{' '}
            <code className="font-mono text-ink">settings</code> table and are exposed through the
            same data API as clusters, so they move to the web backend with the rest of the data
            layer.
          </div>
        </div>
      </form>

      <section className="mt-4 overflow-hidden rounded-panel border border-line bg-panel">
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="m-0 text-sm font-semibold">Application updates</h2>
            <p className="mt-1 text-xs text-muted">ServerMon {update?.currentVersion ?? '—'}</p>
          </div>
          {update && (
            <span
              className={`inline-flex h-5 items-center rounded-full border px-2 text-[9.5px] font-semibold tracking-[0.06em] uppercase ${updatePhaseClass(update.phase)}`}
            >
              {updatePhaseLabel(update.phase)}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-4 px-5 py-5">
          <p
            data-testid="update-status"
            className="m-0 max-w-[680px] text-[12.5px] leading-[1.55] text-muted"
          >
            {update ? updateStatusText(update) : 'Loading update status…'}
          </p>

          {update?.phase === 'downloading' && (
            <div className="max-w-[520px]">
              <div className="h-1.5 overflow-hidden rounded-full bg-panel-2">
                <div
                  className="h-full rounded-full bg-accent transition-[width]"
                  style={{ width: `${Math.min(100, Math.max(0, update.percent ?? 0))}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between gap-4 text-[10.5px] tabular-nums text-dim">
                <span>{(update.percent ?? 0).toFixed(1)}%</span>
                <span>
                  {formatBytes(update.transferred)} / {formatBytes(update.total)} ·{' '}
                  {formatBytes(update.bytesPerSecond)}/s
                </span>
              </div>
            </div>
          )}

          {update?.releaseNotes && (
            <div className="max-w-[680px] rounded-lg border border-line bg-white/[0.015] px-3.5 py-3">
              <div className="mb-1.5 text-[10.5px] font-semibold tracking-[0.08em] text-dim uppercase">
                Release notes
              </div>
              <pre className="m-0 max-h-48 overflow-auto font-sans text-[11.5px] leading-[1.55] whitespace-pre-wrap text-muted">
                {update.releaseNotes}
              </pre>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn"
              disabled={!update?.canCheck || updateAction !== null}
              onClick={() => void runUpdateAction('check')}
              data-testid="check-updates"
            >
              {updateAction === 'check' ? <SpinnerIcon /> : <RefreshIcon />}
              Check for updates
            </button>
            {update?.canDownload && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={updateAction !== null}
                onClick={() => void runUpdateAction('download')}
                data-testid="download-update"
              >
                {updateAction === 'download' && <SpinnerIcon />}
                Download update
              </button>
            )}
            {update?.canInstall && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void installUpdate()}
                data-testid="install-update"
              >
                Restart and install
              </button>
            )}
          </div>

          <p className="m-0 text-[10.5px] leading-[1.45] text-dim">
            Updates are delivered by electron-updater. Configure a publish provider in
            electron-builder.yml, or set{' '}
            <code className="font-mono text-ink">SERVERMON_UPDATE_URL</code> for a generic feed.
            Automatic installation on macOS requires a signed app.
          </p>
        </div>
      </section>
    </div>
  )
}
