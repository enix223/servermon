import type { PodInfo } from '@shared/types'

export type Tone = 'ok' | 'warn' | 'err' | 'idle'

export function isCompleted(pod: PodInfo): boolean {
  return pod.status === 'Completed'
}

export function isIssue(pod: PodInfo): boolean {
  // Terminating pods are transient and expected during rollouts, so they don't
  // count as an issue even though they are not running.
  return pod.status !== 'Running' && pod.status !== 'Completed' && pod.status !== 'Terminating'
}

export function statusTone(status: string): Tone {
  switch (status) {
    case 'Running':
      return 'ok'
    case 'Completed':
      return 'idle'
    case 'Pending':
    case 'ContainerCreating':
    case 'PodInitializing':
    case 'Terminating':
    case 'NotReady':
      return 'warn'
    default:
      return 'err'
  }
}

export function readyIsFull(ready: string): boolean {
  const [readyCount, total] = ready.split('/').map(Number)
  return Number.isFinite(readyCount) && Number.isFinite(total) && total > 0 && readyCount === total
}

export interface PodStats {
  total: number
  running: number
  issues: number
  completed: number
  restarts: number
}

export function computeStats(pods: PodInfo[]): PodStats {
  let running = 0
  let issues = 0
  let completed = 0
  let restarts = 0
  for (const pod of pods) {
    if (pod.status === 'Running') running += 1
    else if (pod.status === 'Completed') completed += 1
    else if (isIssue(pod)) issues += 1
    restarts += pod.restarts
  }
  return { total: pods.length, running, issues, completed, restarts }
}
