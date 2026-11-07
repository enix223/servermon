import { app, BrowserWindow, ipcMain } from 'electron'
import type { AppSettings, ClusterInput, EcsProfileInput } from '@shared/types'
import type { ClusterService } from './application/clusterService'
import type { ConnectionTester } from './application/connectionTester'
import type { EcsConnectionTester } from './application/ecsConnectionTester'
import type { EcsProfileService } from './application/ecsProfileService'
import type { AppUpdater, ClusterMonitor, EcsMonitor } from './application/ports'
import type { SettingsService } from './application/settingsService'
import { ClusterNotFoundError } from './domain/cluster'
import { EcsProfileNotFoundError } from './domain/ecsProfile'

interface IpcDependencies {
  clusterService: ClusterService
  connectionTester: ConnectionTester
  ecsProfileService: EcsProfileService
  ecsConnectionTester: EcsConnectionTester
  settingsService: SettingsService
  monitor: ClusterMonitor
  ecsMonitor: EcsMonitor
  updater: AppUpdater
}

function requireId(id: unknown, label = 'cluster'): number {
  const parsed = Number(id)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`Invalid ${label} id.`)
  return parsed
}

/**
 * Thin transport layer: maps IPC channels onto application services.
 * No SQL, validation, or Kubernetes/Alibaba Cloud details live here.
 */
export function registerIpcHandlers({
  clusterService,
  connectionTester,
  ecsProfileService,
  ecsConnectionTester,
  settingsService,
  monitor,
  ecsMonitor,
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

  ipcMain.handle('ecs:profiles:list', () => ecsProfileService.list())

  ipcMain.handle('ecs:profiles:create', (_event, input: EcsProfileInput) =>
    ecsProfileService.create(input)
  )

  ipcMain.handle('ecs:profiles:update', (_event, id: unknown, input: EcsProfileInput) => {
    const profileId = requireId(id, 'profile')
    const updated = ecsProfileService.update(profileId, input)
    ecsMonitor.invalidate(profileId)
    return updated
  })

  ipcMain.handle('ecs:profiles:delete', (_event, id: unknown) => {
    const profileId = requireId(id, 'profile')
    ecsProfileService.delete(profileId)
    ecsMonitor.invalidate(profileId)
  })

  ipcMain.handle('ecs:profiles:test', (_event, input: EcsProfileInput, existingId?: unknown) => {
    const id =
      typeof existingId === 'number' && Number.isInteger(existingId) && existingId > 0
        ? existingId
        : undefined
    return ecsConnectionTester.test(input, id)
  })

  ipcMain.handle('ecs:instances:list', async (_event, id: unknown) => {
    const profileId = requireId(id, 'profile')
    const profile = ecsProfileService.getEntity(profileId)
    if (!profile) throw new EcsProfileNotFoundError()
    return ecsMonitor.listInstances(profile)
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
