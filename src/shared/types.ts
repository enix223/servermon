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

/* ------------------------------------------------------------------ *
 * Alibaba Cloud ECS
 *
 * Mirrors the Kubernetes connection/pod split: a profile stores the
 * credentials for one Alibaba Cloud account + region, and the instance
 * list is what the dashboard renders.
 * ------------------------------------------------------------------ */

/** An Alibaba Cloud connection profile as exposed to the renderer. The AccessKey secret is never sent across IPC. */
export interface EcsProfileRecord {
  id: number
  name: string
  regionId: string
  accessKeyId: string
  /** Optional endpoint override, e.g. an internal VPC endpoint. */
  endpoint: string | null
  hasSecret: boolean
  createdAt: string
  updatedAt: string
}

export interface EcsProfileInput {
  name: string
  regionId: string
  accessKeyId: string
  /** Empty / omitted means "keep the stored secret" when updating an existing profile. */
  accessKeySecret?: string | null
  endpoint?: string | null
}

/** Result of probing an ECS profile with its credentials. */
export interface EcsConnectionTestResult {
  ok: boolean
  /** The region the credentials resolved against, when the call succeeded. */
  regionId?: string
  /** Number of instances visible with these credentials. */
  instanceCount?: number
  latencyMs?: number
  error?: string
}

/** A single ECS instance as shown in the instance table. */
export interface EcsInstanceInfo {
  instanceId: string
  /** Tagged name, falling back to the instance id. */
  name: string
  /** Running, Stopped, Starting, ... */
  status: string
  instanceType: string
  /** vCPU count. */
  cpu: number
  /** Memory in MiB. */
  memoryMiB: number
  osName: string
  regionId: string
  zoneId: string
  privateIp: string
  publicIp: string
  /** PrePaid or PostPaid. */
  chargeType: string
  hostName: string
  vpcId: string
  createdAt: string
  /** Expiry timestamp for subscription instances, empty otherwise. */
  expiredAt: string
}

export interface EcsInstancesResult {
  profileId: number
  instances: EcsInstanceInfo[]
  /** Timestamp of this fetch attempt. */
  fetchedAt: string
  /** Total instances in the region, which can exceed the number returned when paging is capped. */
  totalCount: number
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
  /**
   * Alibaba Cloud polling interval, in seconds. The OpenAPI is rate limited,
   * so this is deliberately slower than the in-cluster interval.
   */
  ecsRefreshIntervalSeconds: number
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
