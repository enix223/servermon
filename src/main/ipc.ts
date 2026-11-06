import { app, BrowserWindow, ipcMain } from 'electron'
import type { AppSettings, ClusterInput } from '@shared/types'
import type { ClusterService } from './application/clusterService'
import type { ConnectionTester } from './application/connectionTester'
import type { AppUpdater, ClusterMonitor } from './application/ports'
import type { SettingsService } from './application/settingsService'
import { ClusterNotFoundError } from './domain/cluster'

interface IpcDependencies {
  clusterService: ClusterService
  connectionTester: ConnectionTester
  settingsService: SettingsService
  monitor: ClusterMonitor
  updater: AppUpdater
}

function requireId(id: unknown): number {
  const parsed = Number(id)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error('Invalid cluster id.')
  return parsed
}

/**
 * Thin transport layer: maps IPC channels onto application services.
 * No SQL, validation, or Kubernetes details live here.
 */
export function registerIpcHandlers({
  clusterService,
  connectionTester,
  settingsService,
  monitor,
  updater
}: IpcDependencies): void {
  ipcMain.handle('clusters:list', () => clusterService.list())

  ipcMain.handle('clusters:create', (_event, input: ClusterInput) =>
    clusterService.create(input)
  )

  ipcMain.handle('clusters:update', (_event, id: unknown, input: ClusterInput) => {
    const clusterId = requireId(id)
    const updated = clusterService.update(clusterId, input)
    monitor.invalidate(clusterId)
    return updated
  })

  ipcMain.handle('clusters:delete', (_event, id: unknown) => {
    const clusterId = requireId(id)
    clusterService.delete(clusterId)
    monitor.invalidate(clusterId)
  })

  ipcMain.handle('clusters:test', (_event, input: ClusterInput, existingId?: unknown) => {
    const id =
      typeof existingId === 'number' && Number.isInteger(existingId) && existingId > 0
        ? existingId
        : undefined
    return connectionTester.test(input, id)
  })

  ipcMain.handle('pods:list', async (_event, id: unknown) => {
    const clusterId = requireId(id)
    const cluster = clusterService.getEntity(clusterId)
    if (!cluster) throw new ClusterNotFoundError()
    return monitor.listPods(cluster)
  })

  ipcMain.handle('settings:get', () => settingsService.get())

  ipcMain.handle('settings:update', (_event, input: AppSettings) =>
    settingsService.update(input)
  )

  updater.onStateChange((state) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send('updates:state', state)
    }
  })

  ipcMain.handle('updates:get', () => updater.getState())
  ipcMain.handle('updates:check', () => updater.check())
  ipcMain.handle('updates:download', () => updater.download())
  ipcMain.handle('updates:install', () => updater.install())

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform
  }))
}
