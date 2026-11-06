import * as k8s from '@kubernetes/client-node'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import type { ConnectionTestResult, PodInfo, PodsResult } from '@shared/types'
import type { ClusterMonitor } from '../application/ports'
import type { ClusterEntity } from '../domain/cluster'

const VERSION_TTL_MS = 10 * 60 * 1000
const REQUEST_TIMEOUT_MS = 20_000

interface CachedClient {
  fingerprint: string
  kc: k8s.KubeConfig
}

/**
 * Kubernetes adapter for the ClusterMonitor port. All caching and client
 * construction stay here, so application services remain transport-agnostic.
 */
export class KubernetesClusterMonitor implements ClusterMonitor {
  private readonly clients = new Map<number, CachedClient>()
  private readonly versions = new Map<number, { version: string; at: number }>()

  invalidate(clusterId: number): void {
    this.clients.delete(clusterId)
    this.versions.delete(clusterId)
  }

  async testConnection(cluster: ClusterEntity): Promise<ConnectionTestResult> {
    const started = Date.now()
    try {
      const kc = this.buildKubeConfig(cluster)
      const api = kc.makeApiClient(k8s.VersionApi)
      const info = await withTimeout(api.getCode())
      const version = info?.gitVersion ?? 'unknown'
      this.rememberVersion(cluster.id, version)
      return { ok: true, version, latencyMs: Date.now() - started }
    } catch (error) {
      return {
        ok: false,
        error: describeK8sError(error),
        latencyMs: Date.now() - started
      }
    }
  }

  async listPods(cluster: ClusterEntity): Promise<PodsResult> {
    const started = Date.now()
    const fetchedAt = new Date().toISOString()
    try {
      const kc = this.getCachedClient(cluster)
      const api = kc.makeApiClient(k8s.CoreV1Api)
      const [list, version] = await Promise.all([
        withTimeout(api.listPodForAllNamespaces({})),
        this.fetchVersion(cluster, kc)
      ])
      return {
        clusterId: cluster.id,
        pods: (list?.items ?? []).map(mapPod),
        fetchedAt,
        version,
        error: null,
        latencyMs: Date.now() - started
      }
    } catch (error) {
      return {
        clusterId: cluster.id,
        pods: [],
        fetchedAt,
        version: this.versions.get(cluster.id)?.version ?? null,
        error: describeK8sError(error),
        latencyMs: Date.now() - started
      }
    }
  }

  private rememberVersion(clusterId: number, version: string): void {
    if (clusterId > 0) {
      this.versions.set(clusterId, { version, at: Date.now() })
    }
  }

  private async fetchVersion(cluster: ClusterEntity, kc: k8s.KubeConfig): Promise<string | null> {
    const cached = this.versions.get(cluster.id)
    if (cached && Date.now() - cached.at < VERSION_TTL_MS) return cached.version
    try {
      const api = kc.makeApiClient(k8s.VersionApi)
      const info = await withTimeout(api.getCode())
      const version = info?.gitVersion ?? null
      if (version) this.rememberVersion(cluster.id, version)
      return version
    } catch {
      return cached?.version ?? null
    }
  }

  private getCachedClient(cluster: ClusterEntity): k8s.KubeConfig {
    const key = fingerprint(cluster)
    const cached = this.clients.get(cluster.id)
    if (cached && cached.fingerprint === key) return cached.kc
    const kc = this.buildKubeConfig(cluster)
    this.clients.set(cluster.id, { fingerprint: key, kc })
    return kc
  }

  private buildKubeConfig(cluster: ClusterEntity): k8s.KubeConfig {
    const kc = new k8s.KubeConfig()

    if (cluster.authType === 'kubeconfig') {
      if (!cluster.kubeconfigPath) {
        throw new Error('No kubeconfig file is configured for this cluster.')
      }
      const configPath = expandHome(cluster.kubeconfigPath)
      try {
        readFileSync(configPath)
      } catch {
        throw new Error(`Cannot read kubeconfig file: ${configPath}`)
      }
      try {
        kc.loadFromFile(configPath)
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to load kubeconfig ${configPath}: ${detail}`)
      }
      if (cluster.kubeconfigContext) {
        const contexts = kc.getContexts().map((context) => context.name)
        if (!contexts.includes(cluster.kubeconfigContext)) {
          throw new Error(
            `Context "${cluster.kubeconfigContext}" was not found in the kubeconfig. ` +
              `Available contexts: ${contexts.join(', ') || 'none'}`
          )
        }
        kc.setCurrentContext(cluster.kubeconfigContext)
      }
      return kc
    }

    if (!cluster.server) throw new Error('No API server URL is configured for this cluster.')
    if (!cluster.token) throw new Error('No bearer token is configured for this cluster.')

    const caData = cluster.caCert
      ? Buffer.from(cluster.caCert, 'utf8').toString('base64')
      : undefined
    kc.loadFromOptions({
      clusters: [
        {
          name: 'servermon-cluster',
          server: cluster.server,
          skipTLSVerify: cluster.skipTlsVerify,
          ...(caData ? { caData } : {})
        }
      ],
      users: [{ name: 'servermon-user', token: cluster.token }],
      contexts: [
        { name: 'servermon-context', cluster: 'servermon-cluster', user: 'servermon-user' }
      ],
      currentContext: 'servermon-context'
    })
    return kc
  }
}

function fingerprint(cluster: ClusterEntity): string {
  return JSON.stringify([
    cluster.authType,
    cluster.server,
    cluster.kubeconfigPath,
    cluster.kubeconfigContext,
    cluster.token,
    cluster.caCert,
    cluster.skipTlsVerify
  ])
}

function expandHome(filePath: string): string {
  if (filePath === '~') return homedir()
  if (filePath.startsWith('~/')) return `${homedir()}/${filePath.slice(2)}`
  return filePath
}

function withTimeout<T>(promise: Promise<T>, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`The request timed out after ${Math.round(timeoutMs / 1000)}s.`))
    }, timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

function mapPod(pod: k8s.V1Pod): PodInfo {
  const containers = pod.spec?.containers ?? []
  const statuses = pod.status?.containerStatuses ?? []
  const initStatuses = pod.status?.initContainerStatuses ?? []
  const readyCount = statuses.filter((status) => status.ready).length
  const restarts = [...statuses, ...initStatuses].reduce(
    (total, status) => total + (status.restartCount ?? 0),
    0
  )
  const waitingReason = statuses.find((status) => status.state?.waiting?.reason)?.state?.waiting
    ?.reason
  const initWaitingReason = initStatuses.find((status) => status.state?.waiting?.reason)?.state
    ?.waiting?.reason
  const terminatedReason = statuses.find((status) => status.state?.terminated?.reason)?.state
    ?.terminated?.reason

  let status: string
  if (pod.metadata?.deletionTimestamp) {
    status = 'Terminating'
  } else if (waitingReason) {
    status = waitingReason
  } else if (initWaitingReason) {
    status = `Init:${initWaitingReason}`
  } else if (pod.status?.phase === 'Failed' && terminatedReason) {
    status = terminatedReason
  } else if (pod.status?.phase === 'Running') {
    status = readyCount < containers.length ? 'NotReady' : 'Running'
  } else if (pod.status?.phase === 'Succeeded') {
    status = 'Completed'
  } else {
    status = pod.status?.reason || pod.status?.phase || 'Unknown'
  }

  const createdAt = pod.metadata?.creationTimestamp
  return {
    namespace: pod.metadata?.namespace ?? '',
    name: pod.metadata?.name ?? '',
    ready: `${readyCount}/${containers.length}`,
    status,
    phase: pod.status?.phase ?? 'Unknown',
    restarts,
    createdAt: createdAt instanceof Date ? createdAt.toISOString() : String(createdAt ?? ''),
    node: pod.spec?.nodeName ?? '',
    podIP: pod.status?.podIP ?? '',
    images: containers.map((container) => container.image ?? '').filter(Boolean)
  }
}

function extractBodyMessage(body: unknown): string | null {
  if (!body) return null
  if (typeof body === 'string') {
    const trimmed = body.trim()
    if (!trimmed) return null
    try {
      const parsed = JSON.parse(trimmed) as { message?: string; reason?: string }
      return parsed.message || parsed.reason || trimmed
    } catch {
      return trimmed
    }
  }
  if (typeof body === 'object') {
    const record = body as { message?: unknown; reason?: unknown }
    if (typeof record.message === 'string') return record.message
    if (typeof record.reason === 'string') return record.reason
  }
  return null
}

export function describeK8sError(error: unknown): string {
  const anyError = error as {
    code?: unknown
    body?: unknown
    message?: unknown
    cause?: { code?: unknown; message?: unknown }
  }

  const httpCode = typeof anyError?.code === 'number' ? anyError.code : null
  if (httpCode !== null && anyError.body !== undefined) {
    const detail = extractBodyMessage(anyError.body)
    const hints: Record<number, string> = {
      401: 'unauthorized — check the token or kubeconfig credentials',
      403: 'forbidden — the credentials cannot list pods in this cluster',
      404: 'not found — check the API server URL',
      429: 'rate limited by the API server'
    }
    const hint = hints[httpCode]
    if (hint) return `${hint} (HTTP ${httpCode})`
    const base = detail || (typeof anyError.message === 'string' ? anyError.message : 'request failed')
    return `HTTP ${httpCode}: ${base}`
  }

  const causeCode = typeof anyError?.cause?.code === 'string' ? anyError.cause.code : null
  if (causeCode === 'ENOTFOUND' || causeCode === 'EAI_AGAIN') {
    return 'Cannot resolve the API server hostname — check the URL and your DNS.'
  }
  if (causeCode === 'ECONNREFUSED') {
    return 'Connection refused — the API server is not reachable from this machine.'
  }
  if (causeCode === 'ETIMEDOUT' || causeCode === 'UND_ERR_CONNECT_TIMEOUT') {
    return 'Connection timed out — check network access to the API server.'
  }
  if (causeCode === 'CERT_HAS_EXPIRED' || causeCode === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
    return 'TLS verification failed — provide the cluster CA certificate or enable "Skip TLS verification".'
  }

  const message =
    typeof anyError?.message === 'string' ? anyError.message : String(error ?? 'Unknown error')
  const causeMessage = typeof anyError?.cause?.message === 'string' ? anyError.cause.message : ''
  const combined = `${message} ${causeMessage}`.toLowerCase()

  if (
    combined.includes('self-signed certificate') ||
    combined.includes('unable to verify') ||
    combined.includes('certificate')
  ) {
    return `TLS verification failed (${message}) — provide the cluster CA certificate or enable "Skip TLS verification".`
  }
  if (combined.includes('http protocol is not allowed')) {
    return 'Plain HTTP was rejected by the client. Enable "Skip TLS verification" for this cluster or use an https:// API server.'
  }
  if (combined.includes('fetch failed')) {
    return `Cannot reach the API server (${causeMessage || message}).`
  }
  if (combined.includes('timed out')) {
    return message
  }
  return message || 'Unknown error'
}
