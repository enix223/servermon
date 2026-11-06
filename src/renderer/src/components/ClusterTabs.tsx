import type { ClusterRecord, PodsResult } from '@shared/types'
import { computeStats, type Tone } from '../lib/pods'
import { pluralize } from '../lib/format'
import { PlusIcon } from './Icons'

interface ClusterTabsProps {
  clusters: ClusterRecord[]
  activeId: number | null
  results: Record<number, PodsResult>
  onSelect: (id: number) => void
  onAddCluster: () => void
}

interface TabMeta {
  tone: Tone
  label: string
  title: string
}

function tabMeta(result: PodsResult | undefined): TabMeta {
  if (!result) return { tone: 'idle', label: '', title: 'Waiting for first update' }
  if (result.error) {
    return {
      tone: 'err',
      label: 'offline',
      title: result.error
    }
  }
  const stats = computeStats(result.pods)
  if (stats.issues > 0) {
    return {
      tone: 'warn',
      label: pluralize(stats.issues, 'issue'),
      title: `${pluralize(stats.issues, 'issue')} · ${pluralize(stats.total, 'pod')}`
    }
  }
  return {
    tone: 'ok',
    label: pluralize(stats.total, 'pod'),
    title: `${pluralize(stats.total, 'pod')} · ${stats.running} running`
  }
}

function metaToneClass(tone: Tone): string {
  if (tone === 'warn') return 'text-warn'
  if (tone === 'err') return 'text-err'
  return 'text-dim'
}

export function ClusterTabs({
  clusters,
  activeId,
  results,
  onSelect,
  onAddCluster
}: ClusterTabsProps) {
  return (
    <div
      className="scrollbar-none flex flex-none items-end gap-0.5 overflow-x-auto overflow-y-hidden border-b border-line bg-[#080c12]/35 px-5 pt-2.5"
      role="tablist"
      aria-label="Kubernetes clusters"
    >
      {clusters.map((cluster) => {
        const meta = tabMeta(results[cluster.id])
        const active = cluster.id === activeId
        return (
          <button
            key={cluster.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`relative -mb-px flex h-9 items-center gap-2 rounded-t-lg border border-b-0 px-3 text-[12.5px] whitespace-nowrap transition-colors ${
              active
                ? 'border-line bg-panel text-ink shadow-[inset_0_-1px_0_var(--color-panel)]'
                : 'border-transparent text-muted hover:bg-white/[0.025] hover:text-ink'
            }`}
            onClick={() => onSelect(cluster.id)}
            title={meta.title}
            data-testid="cluster-tab"
          >
            <span className={`status-dot ${meta.tone}`} />
            <span className="max-w-[220px] truncate font-medium">{cluster.name}</span>
            {meta.label && (
              <span className={`text-[10.5px] tabular-nums ${metaToneClass(meta.tone)}`}>
                {meta.label}
              </span>
            )}
          </button>
        )
      })}
      <button
        type="button"
        className="no-drag mb-[5px] ml-1.5 grid h-[30px] w-[30px] flex-none place-items-center rounded-control border border-dashed border-line-strong text-dim transition-colors hover:border-dim hover:text-ink"
        onClick={onAddCluster}
        aria-label="Add cluster"
        title="Add cluster"
        data-testid="tab-add-cluster"
      >
        <PlusIcon size={14} />
      </button>
    </div>
  )
}
