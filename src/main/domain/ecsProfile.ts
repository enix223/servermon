import type { EcsProfileInput, EcsProfileRecord } from '@shared/types'

/**
 * Full ECS profile record including the AccessKey secret. This type never
 * leaves the main process; adapters must expose `EcsProfileRecord` (with
 * `hasSecret` only).
 */
export interface EcsProfileEntity extends Omit<EcsProfileRecord, 'hasSecret'> {
  accessKeySecret: string | null
}

/** Persistence model: everything a repository needs to store a profile. */
export type EcsProfileDraft = Omit<EcsProfileEntity, 'id'>

/** Validated connection fields, before timestamps are attached. */
export type NormalizedEcsProfile = Omit<EcsProfileDraft, 'createdAt' | 'updatedAt'>

export class EcsProfileNotFoundError extends Error {
  constructor() {
    super('Alibaba Cloud profile not found.')
    this.name = 'EcsProfileNotFoundError'
  }
}

export class DuplicateEcsProfileNameError extends Error {
  constructor(name: string) {
    super(`An Alibaba Cloud profile named "${name}" already exists.`)
    this.name = 'DuplicateEcsProfileNameError'
  }
}

/** Strips credentials before a record crosses the IPC/renderer boundary. */
export function toPublicEcsProfile(entity: EcsProfileEntity): EcsProfileRecord {
  return {
    id: entity.id,
    name: entity.name,
    regionId: entity.regionId,
    accessKeyId: entity.accessKeyId,
    endpoint: entity.endpoint,
    hasSecret: Boolean(entity.accessKeySecret),
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt
  }
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed.length > 0 ? trimmed : null
}

/** Alibaba Cloud region ids look like `cn-hangzhou`, `us-east-1`, `ap-southeast-2`. */
const REGION_PATTERN = /^[a-z][a-z0-9-]{1,62}[a-z0-9]$/

function validateRegion(regionId: string): void {
  if (!REGION_PATTERN.test(regionId)) {
    throw new Error(
      'Region must look like "cn-hangzhou" or "us-east-1" — use the Alibaba Cloud region id.'
    )
  }
}

/**
 * Normalizes an optional endpoint override into a base URL.
 *
 * An empty value means "use the regional ECS endpoint". A bare host gets the
 * https scheme. Plain http is only allowed for loopback hosts so a local
 * mock server can be used without shipping credentials over the wire.
 */
export function normalizeEndpoint(endpoint: string | null | undefined): string | null {
  const trimmed = blankToNull(endpoint)
  if (!trimmed) return null

  let url: URL
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
  } catch {
    throw new Error('Endpoint must be a valid host name, e.g. ecs.cn-hangzhou.aliyuncs.com')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Endpoint must use http:// or https://')
  }
  if (url.pathname !== '/' && url.pathname !== '') {
    throw new Error('Endpoint must not include a path.')
  }

  const host = url.host
  // `hostname` excludes the port, so `127.0.0.1:8080` is still loopback.
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  const isLoopback = hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1'
  if (url.protocol === 'http:' && !isLoopback) {
    throw new Error('Endpoint must use https:// — plain http is only allowed for localhost.')
  }

  return `${url.protocol}//${host}`
}

/** The default ECS endpoint for a region. */
export function defaultEcsEndpoint(regionId: string): string {
  return `https://ecs.${regionId}.aliyuncs.com`
}

/**
 * Validates and normalizes untrusted form input. Kept framework-free so future
 * runtimes (e.g. a Next.js API route) can reuse it unchanged.
 */
export function normalizeEcsProfileInput(
  input: EcsProfileInput,
  existing: EcsProfileEntity | null
): NormalizedEcsProfile {
  const name = (input.name ?? '').trim()
  if (!name) throw new Error('Profile name is required.')
  if (name.length > 80) throw new Error('Profile name must be 80 characters or fewer.')

  const regionId = (input.regionId ?? '').trim().toLowerCase()
  if (!regionId) throw new Error('Region is required.')
  validateRegion(regionId)

  const accessKeyId = (input.accessKeyId ?? '').trim()
  if (!accessKeyId) throw new Error('AccessKey ID is required.')
  if (accessKeyId.length > 128) throw new Error('AccessKey ID must be 128 characters or fewer.')

  const endpoint = normalizeEndpoint(input.endpoint)

  let accessKeySecret = blankToNull(input.accessKeySecret)
  // A blank secret on update keeps the stored one, so editing the region does
  // not force the user to paste the secret again.
  if (!accessKeySecret) accessKeySecret = existing?.accessKeySecret ?? null
  if (!accessKeySecret) throw new Error('AccessKey secret is required.')

  return {
    name,
    regionId,
    accessKeyId,
    accessKeySecret,
    endpoint
  }
}

/**
 * Builds an unsaved entity for "Test connection". A blank secret keeps the
 * existing stored secret so users can test edits without re-entering it.
 */
export function buildDraftEcsProfile(
  input: EcsProfileInput,
  existing: EcsProfileEntity | null
): EcsProfileEntity {
  const now = new Date().toISOString()
  const regionId = (input.regionId ?? '').trim().toLowerCase()

  return {
    id: existing?.id ?? -1,
    name: (input.name ?? '').trim() || existing?.name || 'draft',
    regionId,
    accessKeyId: (input.accessKeyId ?? '').trim() || existing?.accessKeyId || '',
    endpoint: blankToNull(input.endpoint) ?? existing?.endpoint ?? null,
    accessKeySecret:
      blankToNull(input.accessKeySecret) ?? (existing?.accessKeySecret ?? null),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  }
}
