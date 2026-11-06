import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateState } from '@shared/types'
import type { AppUpdater } from '../application/ports'

// electron-updater is CommonJS; import the default object and destructure so
// the ESM main process does not rely on named-export detection.
const { autoUpdater } = electronUpdater

const UPDATE_FEED_ENV = 'SERVERMON_UPDATE_URL'

interface UpdateInfoLike {
  version: string
  releaseName?: string | null
  releaseNotes?: string | Array<{ version: string; note: string | null }> | null
  releaseDate?: string
}

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/(p|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function normalizeReleaseNotes(notes: UpdateInfoLike['releaseNotes']): string | null {
  if (!notes) return null
  if (typeof notes === 'string') return stripHtml(notes) || null
  const chunks = notes
    .map((entry) => {
      const title = entry.version ? `v${entry.version.replace(/^v/, '')}` : ''
      const body = entry.note ? stripHtml(entry.note) : ''
      return [title, body].filter(Boolean).join('\n')
    })
    .filter(Boolean)
  return chunks.join('\n\n') || null
}

function infoFields(info: UpdateInfoLike): Partial<UpdateState> {
  return {
    availableVersion: info.version || null,
    releaseName: info.releaseName ?? null,
    releaseNotes: normalizeReleaseNotes(info.releaseNotes),
    releaseDate: info.releaseDate ?? null
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/**
 * Adapter for the AppUpdater port. electron-updater only runs from packaged
 * builds; when there is no update feed configured the service reports an
 * explicit `unsupported` state instead of failing silently.
 */
export class ElectronUpdater implements AppUpdater {
  private readonly events = new EventEmitter()
  private readonly updateConfigured: boolean
  private state: UpdateState

  constructor() {
    const feedUrl = process.env[UPDATE_FEED_ENV]?.trim()
    const hasConfigFile =
      app.isPackaged && existsSync(join(process.resourcesPath, 'app-update.yml'))
    this.updateConfigured = app.isPackaged && (Boolean(feedUrl) || hasConfigFile)

    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.allowPrerelease = false

    if (this.updateConfigured && feedUrl) {
      autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl })
    }

    let message: string | null = null
    if (!app.isPackaged) {
      message =
        'Update checks run in packaged builds. Use "npm run dist" to create an installable app with update support.'
    } else if (!this.updateConfigured) {
      message = `Automatic updates are not configured. Add a publish provider to electron-builder.yml or set ${UPDATE_FEED_ENV}.`
    }

    this.state = {
      phase: this.updateConfigured ? 'idle' : 'unsupported',
      currentVersion: app.getVersion(),
      availableVersion: null,
      releaseName: null,
      releaseNotes: null,
      releaseDate: null,
      percent: null,
      bytesPerSecond: null,
      transferred: null,
      total: null,
      error: null,
      message,
      canCheck: this.updateConfigured,
      canDownload: false,
      canInstall: false
    }

    this.wireEvents()
  }

  getState(): UpdateState {
    return { ...this.state }
  }

  onStateChange(listener: (state: UpdateState) => void): () => void {
    this.events.on('state', listener)
    return () => this.events.off('state', listener)
  }

  async check(): Promise<UpdateState> {
    if (!this.updateConfigured) return this.getState()
    if (this.state.phase === 'checking' || this.state.phase === 'downloading') {
      return this.getState()
    }

    this.patch({
      phase: 'checking',
      error: null,
      percent: null,
      bytesPerSecond: null,
      transferred: null,
      total: null
    })

    try {
      const result = await autoUpdater.checkForUpdates()
      // Events normally update the state; this covers implementations that
      // resolve without emitting.
      if (this.getState().phase === 'checking' && result?.updateInfo) {
        this.patch({
          phase: result.isUpdateAvailable ? 'available' : 'up-to-date',
          ...infoFields(result.updateInfo)
        })
      }
    } catch (error) {
      this.patch({ phase: 'error', error: errorMessage(error) })
    }

    return this.getState()
  }

  async download(): Promise<UpdateState> {
    if (this.state.phase !== 'available') return this.getState()

    this.patch({
      phase: 'downloading',
      percent: 0,
      bytesPerSecond: null,
      transferred: null,
      total: null,
      error: null
    })

    try {
      await autoUpdater.downloadUpdate()
    } catch (error) {
      this.patch({ phase: 'error', error: errorMessage(error) })
    }

    return this.getState()
  }

  install(): void {
    if (this.state.phase !== 'downloaded') return
    setImmediate(() => autoUpdater.quitAndInstall(false, true))
  }

  private wireEvents(): void {
    autoUpdater.on('checking-for-update', () => {
      this.patch({ phase: 'checking', error: null })
    })
    autoUpdater.on('update-available', (info) => {
      this.patch({ phase: 'available', error: null, ...infoFields(info) })
    })
    autoUpdater.on('update-not-available', (info) => {
      this.patch({ phase: 'up-to-date', error: null, ...infoFields(info) })
    })
    autoUpdater.on('download-progress', (progress) => {
      this.patch({
        phase: 'downloading',
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
        error: null
      })
    })
    autoUpdater.on('update-downloaded', (info) => {
      this.patch({
        phase: 'downloaded',
        percent: 100,
        bytesPerSecond: null,
        error: null,
        ...infoFields(info)
      })
    })
    autoUpdater.on('error', (error) => {
      this.patch({ phase: 'error', error: errorMessage(error) })
    })
  }

  private patch(partial: Partial<UpdateState>): void {
    this.state = { ...this.state, ...partial }
    this.state.canCheck =
      this.updateConfigured &&
      this.state.phase !== 'checking' &&
      this.state.phase !== 'downloading'
    this.state.canDownload = this.state.phase === 'available'
    this.state.canInstall = this.state.phase === 'downloaded'
    this.events.emit('state', this.getState())
  }
}
