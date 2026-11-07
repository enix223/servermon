import type {
  EcsConnectionTestResult,
  EcsInstanceInfo,
  EcsInstancesResult
} from '@shared/types'
import type { EcsMonitor } from '../application/ports'
import type { EcsProfileEntity } from '../domain/ecsProfile'
import { AliyunOpenApiClient, describeAliyunError } from './aliyunOpenApiClient'

const PAGE_SIZE = 100
/** Safety cap so a misbehaving API cannot spin forever. */
const MAX_PAGES = 20

/** Raw ECS instance shape returned by the DescribeInstances action. */
interface AliyunEcsInstance {
  InstanceId?: unknown
  InstanceName?: unknown
  InstanceType?: unknown
  Status?: unknown
  OSName?: unknown
  OSType?: unknown
  Cpu?: unknown
  Memory?: unknown
  RegionId?: unknown
  ZoneId?: unknown
  PrivateIpAddress?: unknown
  PublicIpAddress?: unknown
  ChargeType?: unknown
  HostName?: unknown
  VpcId?: unknown
  CreationTime?: unknown
  ExpiredTime?: unknown
}

interface DescribeInstancesResponse {
  TotalCount?: unknown
  PageNumber?: unknown
  PageSize?: unknown
  NextToken?: unknown
  Instances?: { Instance?: AliyunEcsInstance[] } | unknown
  RequestId?: unknown
}

interface CachedClient {
  fingerprint: string
  client: AliyunOpenApiClient
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

/** Public and private IPs are plain strings in DescribeInstances, but some responses nest them. */
function toIp(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (value && typeof value === 'object') {
    const nested = (value as { IpAddress?: unknown }).IpAddress
    if (typeof nested === 'string') return nested.trim()
  }
  return ''
}

function readInstances(response: DescribeInstancesResponse): AliyunEcsInstance[] {
  const container = response.Instances
  if (!container || typeof container !== 'object') return []
  const list = (container as { Instance?: AliyunEcsInstance[] }).Instance
  return Array.isArray(list) ? list : []
}

function mapInstance(raw: AliyunEcsInstance): EcsInstanceInfo {
  const instanceId = text(raw.InstanceId)
  return {
    instanceId,
    name: text(raw.InstanceName) || instanceId,
    status: text(raw.Status) || 'Unknown',
    instanceType: text(raw.InstanceType),
    cpu: toNumber(raw.Cpu),
    memoryMiB: toNumber(raw.Memory),
    osName: text(raw.OSName),
    regionId: text(raw.RegionId),
    zoneId: text(raw.ZoneId),
    privateIp: toIp(raw.PrivateIpAddress),
    publicIp: toIp(raw.PublicIpAddress),
    chargeType: text(raw.ChargeType),
    hostName: text(raw.HostName),
    vpcId: text(raw.VpcId),
    createdAt: text(raw.CreationTime),
    expiredAt: text(raw.ExpiredTime)
  }
}

function fingerprint(profile: EcsProfileEntity): string {
  return JSON.stringify([
    profile.regionId,
    profile.accessKeyId,
    profile.accessKeySecret,
    profile.endpoint
  ])
}

/**
 * Alibaba Cloud adapter for the EcsMonitor port. Client construction and
 * caching stay here, so application services remain transport-agnostic.
 */
export class AliyunEcsMonitor implements EcsMonitor {
  private readonly clients = new Map<number, CachedClient>()

  invalidate(profileId: number): void {
    this.clients.delete(profileId)
  }

  async testConnection(profile: EcsProfileEntity): Promise<EcsConnectionTestResult> {
    const started = Date.now()
    try {
      const client = this.getClient(profile)
      const response = await client.request<DescribeInstancesResponse>('DescribeInstances', {
        MaxResults: 10
      })
      const visible = readInstances(response).length
      const total = toNumber(response.TotalCount)
      return {
        ok: true,
        regionId: profile.regionId,
        instanceCount: total > 0 ? total : visible,
        latencyMs: Date.now() - started
      }
    } catch (error) {
      return {
        ok: false,
        error: describeAliyunError(error),
        latencyMs: Date.now() - started
      }
    }
  }

  async listInstances(profile: EcsProfileEntity): Promise<EcsInstancesResult> {
    const started = Date.now()
    const fetchedAt = new Date().toISOString()
    try {
      const client = this.getClient(profile)
      const { instances, totalCount } = await this.fetchAllInstances(client)
      return {
        profileId: profile.id,
        instances,
        fetchedAt,
        totalCount,
        error: null,
        latencyMs: Date.now() - started
      }
    } catch (error) {
      return {
        profileId: profile.id,
        instances: [],
        fetchedAt,
        totalCount: 0,
        error: describeAliyunError(error),
        latencyMs: Date.now() - started
      }
    }
  }

  private async fetchAllInstances(
    client: AliyunOpenApiClient
  ): Promise<{ instances: EcsInstanceInfo[]; totalCount: number }> {
    const instances: EcsInstanceInfo[] = []
    let totalCount = 0
    let nextToken = ''
    let pageNumber = 1

    for (let page = 0; page < MAX_PAGES; page += 1) {
      // The modern API pages with NextToken/MaxResults; PageNumber/PageSize is
      // kept as a fallback for responses that do not return a token.
      const params: Record<string, string | number> = { MaxResults: PAGE_SIZE }
      if (nextToken) {
        params.NextToken = nextToken
      } else if (pageNumber > 1) {
        params.PageNumber = pageNumber
        params.PageSize = PAGE_SIZE
      }

      const response = await client.request<DescribeInstancesResponse>(
        'DescribeInstances',
        params
      )
      const pageItems = readInstances(response)
      instances.push(...pageItems.map(mapInstance))

      const reportedTotal = toNumber(response.TotalCount)
      if (reportedTotal > 0) totalCount = reportedTotal

      nextToken = text(response.NextToken)

      if (!nextToken) {
        if (pageItems.length < PAGE_SIZE) break
        if (totalCount > 0 && instances.length >= totalCount) break
        pageNumber += 1
      } else if (totalCount > 0 && instances.length >= totalCount) {
        break
      }
    }

    return { instances, totalCount: totalCount > 0 ? totalCount : instances.length }
  }

  private getClient(profile: EcsProfileEntity): AliyunOpenApiClient {
    const key = fingerprint(profile)
    const cached = this.clients.get(profile.id)
    if (profile.id > 0 && cached && cached.fingerprint === key) return cached.client

    const client = new AliyunOpenApiClient(
      { accessKeyId: profile.accessKeyId, accessKeySecret: profile.accessKeySecret ?? '' },
      { regionId: profile.regionId, endpoint: profile.endpoint }
    )

    if (profile.id > 0) this.clients.set(profile.id, { fingerprint: key, client })
    return client
  }
}
