export type AuthType = 'kubeconfig' | 'token'

/** A cluster as exposed to the renderer. The bearer token is never sent across IPC. */
export interface ClusterRecord {
  id: number
  name: string
  server: string
  authType: AuthType
  kubeconfigPath: string | null
  kubeconfigContext: string | null
  caCert: string | null
  skipTlsVerify: boolean
  hasToken: boolean
  createdAt: string
  updatedAt: string
}

export interface ClusterInput {
  name: string
  server: string
  authType: AuthType
  kubeconfigPath?: string | null
  kubeconfigContext?: string | null
  /** Empty / omitted means "keep the stored token" when updating an existing cluster. */
  token?: string | null
  caCert?: string | null
  skipTlsVerify?: boolean
}

export interface ConnectionTestResult {
  ok: boolean
  version?: string
  latencyMs?: number
  error?: string
}

export interface PodInfo {
  namespace: string
  name: string
  /** Ready containers, e.g. "2/3". */
  ready: string
  /** kubectl-style status: Running, CrashLoopBackOff, Completed, ... */
  status: string
  phase: string
  restarts: number
  createdAt: string
  node: string
  podIP: string
  images: string[]
}

export interface PodsResult {
  clusterId: number
  pods: PodInfo[]
  /** Timestamp of this fetch attempt. */
  fetchedAt: string
  version: string | null
  error: string | null
  latencyMs: number
}

export interface AppInfo {
  version: string
  platform: string
}

export interface AppSettings {
  /** Dashboard polling interval, in seconds. */
  refreshIntervalSeconds: number
}

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'up-to-date'
  | 'error'
  | 'unsupported'

export interface UpdateState {
  phase: UpdatePhase
  currentVersion: string
  availableVersion: string | null
  releaseName: string | null
  releaseNotes: string | null
  releaseDate: string | null
  /** Download progress, 0-100. */
  percent: number | null
  bytesPerSecond: number | null
  transferred: number | null
  total: number | null
  error: string | null
  /** Human-readable reason when updates are unavailable (for example in dev builds). */
  message: string | null
  canCheck: boolean
  canDownload: boolean
  canInstall: boolean
}
