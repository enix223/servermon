import type { EcsInstanceInfo } from '@shared/types'
import type { Tone } from './pods'

/**
 * ECS instance lifecycle states, mapped to the shared status tones used by
 * the Kubernetes module so both tables read the same way.
 */
export function ecsStatusTone(status: string): Tone {
  switch (status) {
    case 'Running':
      return 'ok'
    case 'Stopped':
      return 'idle'
    case 'Pending':
    case 'Starting':
    case 'Stopping':
    case 'Rebooting':
    case 'Upgrading':
    case 'Verifying':
    case 'Resetting':
    case 'Registering':
      return 'warn'
    default:
      return 'err'
  }
}

/** Instances that are neither running nor cleanly stopped need attention. */
export function isEcsIssue(instance: EcsInstanceInfo): boolean {
  return ecsStatusTone(instance.status) === 'err'
}

export interface EcsStats {
  total: number
  running: number
  stopped: number
  issues: number
}

export function computeEcsStats(instances: EcsInstanceInfo[]): EcsStats {
  let running = 0
  let stopped = 0
  let issues = 0
  for (const instance of instances) {
    if (instance.status === 'Running') running += 1
    else if (instance.status === 'Stopped') stopped += 1
    if (isEcsIssue(instance)) issues += 1
  }
  return { total: instances.length, running, stopped, issues }
}

/** ECS reports memory in MiB; show GiB once the value is large enough. */
export function formatMemory(memoryMiB: number): string {
  if (!memoryMiB || memoryMiB <= 0) return '—'
  if (memoryMiB < 1024) return `${memoryMiB} MiB`
  const gib = memoryMiB / 1024
  return `${Number.isInteger(gib) ? gib : gib.toFixed(1)} GiB`
}

export function formatChargeType(chargeType: string): string {
  switch (chargeType) {
    case 'PrePaid':
      return 'Subscription'
    case 'PostPaid':
      return 'Pay-as-you-go'
    default:
      return chargeType || '—'
  }
}

/** Common Alibaba Cloud regions, offered as suggestions in the profile form. */
export const ALIYUN_REGIONS = [
  'cn-hangzhou',
  'cn-shanghai',
  'cn-beijing',
  'cn-shenzhen',
  'cn-zhangjiakou',
  'cn-huhehaote',
  'cn-guangzhou',
  'cn-chengdu',
  'cn-wulanchabu',
  'cn-hongkong',
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-southeast-3',
  'ap-southeast-5',
  'ap-south-1',
  'me-east-1',
  'eu-west-1',
  'eu-central-1',
  'us-east-1',
  'us-west-1',
  'sa-east-1'
]
