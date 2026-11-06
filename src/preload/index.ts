import { contextBridge, ipcRenderer } from 'electron'
import type { ServermonApi } from '@shared/api'
import type { AppSettings, ClusterInput, UpdateState } from '@shared/types'

const api: ServermonApi = {
  listClusters: () => ipcRenderer.invoke('clusters:list'),
  createCluster: (input: ClusterInput) => ipcRenderer.invoke('clusters:create', input),
  updateCluster: (id: number, input: ClusterInput) =>
    ipcRenderer.invoke('clusters:update', id, input),
  deleteCluster: (id: number) => ipcRenderer.invoke('clusters:delete', id),
  testCluster: (input: ClusterInput, existingId?: number) =>
    ipcRenderer.invoke('clusters:test', input, existingId),
  listPods: (clusterId: number) => ipcRenderer.invoke('pods:list', clusterId),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (settings: AppSettings) => ipcRenderer.invoke('settings:update', settings),
  getUpdateState: () => ipcRenderer.invoke('updates:get'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  downloadUpdate: () => ipcRenderer.invoke('updates:download'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  onUpdateState: (listener: (state: UpdateState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: UpdateState): void => listener(state)
    ipcRenderer.on('updates:state', handler)
    return () => ipcRenderer.removeListener('updates:state', handler)
  },
  getAppInfo: () => ipcRenderer.invoke('app:info')
}

contextBridge.exposeInMainWorld('servermon', api)
