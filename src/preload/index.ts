import { contextBridge, ipcRenderer } from 'electron'
import type { ServermonApi } from '@shared/api'
import type {
  AppSettings,
  ClusterInput,
  EcsProfileInput,
  UpdateState
} from '@shared/types'

const api: ServermonApi = {
  listClusters: () => ipcRenderer.invoke('clusters:list'),
  createCluster: (input: ClusterInput) => ipcRenderer.invoke('clusters:create', input),
  updateCluster: (id: number, input: ClusterInput) =>
    ipcRenderer.invoke('clusters:update', id, input),
  deleteCluster: (id: number) => ipcRenderer.invoke('clusters:delete', id),
  testCluster: (input: ClusterInput, existingId?: number) =>
    ipcRenderer.invoke('clusters:test', input, existingId),
  listPods: (clusterId: number) => ipcRenderer.invoke('pods:list', clusterId),
  listEcsProfiles: () => ipcRenderer.invoke('ecs:profiles:list'),
  createEcsProfile: (input: EcsProfileInput) =>
    ipcRenderer.invoke('ecs:profiles:create', input),
  updateEcsProfile: (id: number, input: EcsProfileInput) =>
    ipcRenderer.invoke('ecs:profiles:update', id, input),
  deleteEcsProfile: (id: number) => ipcRenderer.invoke('ecs:profiles:delete', id),
  testEcsProfile: (input: EcsProfileInput, existingId?: number) =>
    ipcRenderer.invoke('ecs:profiles:test', input, existingId),
  listEcsInstances: (profileId: number) => ipcRenderer.invoke('ecs:instances:list', profileId),
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
