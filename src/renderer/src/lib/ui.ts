/** Top-level pages. New modules (e.g. Alibaba Cloud ECS) add an id here. */
export type PageId = 'k8s-pods' | 'k8s-clusters' | 'aliyun-ecs' | 'aliyun-profiles' | 'settings'

export type ToastTone = 'ok' | 'error' | 'info'

export interface ToastItem {
  id: number
  message: string
  tone: ToastTone
}
