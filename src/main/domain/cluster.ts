import type { ClusterInput, ClusterRecord } from '@shared/types'

/**
 * Full cluster record including the credential. This type never leaves the
 * main process; adapters must expose `ClusterRecord` (with `hasToken` only).
 */
export interface ClusterEntity extends Omit<ClusterRecord, 'hasToken'> {
  token: string | null
}

/** Persistence model: everything a repository needs to store a cluster. */
export type ClusterDraft = Omit<ClusterEntity, 'id'>

/** Validated connection fields, before timestamps are attached. */
export type NormalizedCluster = Omit<ClusterDraft, 'createdAt' | 'updatedAt'>

export class ClusterNotFoundError extends Error {
  constructor() {
    super('Cluster not found.')
    this.name = 'ClusterNotFoundError'
  }
}

export class DuplicateClusterNameError extends Error {
  constructor(name: string) {
    super(`A cluster named "${name}" already exists.`)
    this.name = 'DuplicateClusterNameError'
  }
}

/** Strips credentials before a record crosses the IPC/renderer boundary. */
export function toPublicCluster(entity: ClusterEntity): ClusterRecord {
  return {
    id: entity.id,
    name: entity.name,
    server: entity.server,
    authType: entity.authType,
    kubeconfigPath: entity.kubeconfigPath,
    kubeconfigContext: entity.kubeconfigContext,
    caCert: entity.caCert,
    skipTlsVerify: entity.skipTlsVerify,
    hasToken: Boolean(entity.token),
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt
  }
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed.length > 0 ? trimmed : null
}

function validateServer(server: string): void {
  let url: URL
  try {
    url = new URL(server)
  } catch {
    throw new Error('API server must be a valid URL, e.g. https://10.0.0.10:6443')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('API server must use http:// or https://')
  }
}

/**
 * Validates and normalizes untrusted form input. Kept framework-free so future
 * runtimes (e.g. a Next.js API route) can reuse it unchanged.
 */
export function normalizeClusterInput(
  input: ClusterInput,
  existing: ClusterEntity | null
): NormalizedCluster {
  const name = (input.name ?? '').trim()
  if (!name) throw new Error('Cluster name is required.')
  if (name.length > 80) throw new Error('Cluster name must be 80 characters or fewer.')

  const authType = input.authType
  if (authType !== 'kubeconfig' && authType !== 'token') {
    throw new Error('Authentication method must be "kubeconfig" or "token".')
  }

  const server = (input.server ?? '').trim()
  const kubeconfigPath = blankToNull(input.kubeconfigPath)
  const kubeconfigContext = blankToNull(input.kubeconfigContext)

  let token = blankToNull(input.token)
  let caCert = blankToNull(input.caCert)
  let skipTlsVerify = Boolean(input.skipTlsVerify)

  if (authType === 'kubeconfig') {
    if (!kubeconfigPath) throw new Error('A kubeconfig file path is required.')
    if (server) validateServer(server)
    // The kubeconfig file owns credentials and TLS settings.
    token = null
    caCert = null
    skipTlsVerify = false
  } else {
    if (!server) throw new Error('API server URL is required for token authentication.')
    validateServer(server)
    if (!token) token = existing?.authType === 'token' ? existing.token : null
    if (!token) throw new Error('A bearer token is required for token authentication.')
  }

  return {
    name,
    server,
    authType,
    kubeconfigPath,
    kubeconfigContext,
    token,
    caCert,
    skipTlsVerify
  }
}

/**
 * Builds an unsaved entity for "Test connection". A blank token keeps the
 * existing stored token so users can test edits without re-entering it.
 */
export function buildDraftCluster(
  input: ClusterInput,
  existing: ClusterEntity | null
): ClusterEntity {
  const now = new Date().toISOString()
  const authType = input.authType === 'token' ? 'token' : 'kubeconfig'
  const typedToken = blankToNull(input.token)

  return {
    id: existing?.id ?? -1,
    name: (input.name ?? '').trim() || existing?.name || 'draft',
    server: (input.server ?? '').trim(),
    authType,
    kubeconfigPath: blankToNull(input.kubeconfigPath),
    kubeconfigContext: blankToNull(input.kubeconfigContext),
    caCert: blankToNull(input.caCert),
    skipTlsVerify: Boolean(input.skipTlsVerify),
    token:
      authType === 'token'
        ? typedToken || (existing?.authType === 'token' ? existing.token : null)
        : null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  }
}
