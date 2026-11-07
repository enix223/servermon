import type { PageId } from './ui'

export interface NavItem {
  id: PageId
  label: string
  badge?: string
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

/** Single source of truth for the multi-module sidebar. */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Kubernetes',
    items: [
      { id: 'k8s-pods', label: 'Pods' },
      { id: 'k8s-clusters', label: 'Clusters' }
    ]
  },
  {
    label: 'Alibaba Cloud',
    items: [
      { id: 'aliyun-ecs', label: 'ECS servers' },
      { id: 'aliyun-profiles', label: 'Profiles' }
    ]
  },
  {
    label: 'Application',
    items: [{ id: 'settings', label: 'Settings' }]
  }
]

export const PAGE_META: Record<PageId, { module: string; title: string }> = {
  'k8s-pods': { module: 'Kubernetes', title: 'Pods' },
  'k8s-clusters': { module: 'Kubernetes', title: 'Clusters' },
  'aliyun-ecs': { module: 'Alibaba Cloud', title: 'ECS servers' },
  'aliyun-profiles': { module: 'Alibaba Cloud', title: 'Profiles' },
  settings: { module: 'Application', title: 'Settings' }
}
