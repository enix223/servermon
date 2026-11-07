import type { EcsInstancesResult, EcsProfileRecord } from '@shared/types'
import { pluralize } from '../lib/format'
import type { Tone } from '../lib/pods'
import { PlusIcon } from './Icons'

interface EcsProfileTabsProps {
  profiles: EcsProfileRecord[]
  activeId: number | null
  results: Record<number, EcsInstancesResult>
  onSelect: (id: number) => void
  onAddProfile: () => void
}

interface TabMeta {
  tone: Tone
  label: string
  title: string
}

function tabMeta(result: EcsInstancesResult | undefined): TabMeta {
  if (!result) return { tone: 'idle', label: '', title: 'Waiting for first update' }
  if (result.error) {
    return { tone: 'err', label: 'offline', title: result.error }
  }
  const count = result.instances.length
  if (count === 0) {
    return { tone: 'idle', label: 'empty', title: 'No instances in this region' }
  }
  return {
    tone: 'ok',
    label: pluralize(count, 'instance'),
    title: `${pluralize(count, 'instance')} · ${result.totalCount} in region`
  }
}

function metaToneClass(tone: Tone): string {
  if (tone === 'warn') return 'text-warn'
  if (tone === 'err') return 'text-err'
  return 'text-dim'
}

/** Profile switcher for the Alibaba Cloud module. Mirrors ClusterTabs. */
export function EcsProfileTabs({
  profiles,
  activeId,
  results,
  onSelect,
  onAddProfile
}: EcsProfileTabsProps) {
  return (
    <div
      className="scrollbar-none flex flex-none items-end gap-0.5 overflow-x-auto overflow-y-hidden border-b border-line bg-[#080c12]/35 px-5 pt-2.5"
      role="tablist"
      aria-label="Alibaba Cloud profiles"
    >
      {profiles.map((profile) => {
        const meta = tabMeta(results[profile.id])
        const active = profile.id === activeId
        return (
          <button
            key={profile.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`relative -mb-px flex h-9 items-center gap-2 rounded-t-lg border border-b-0 px-3 text-[12.5px] whitespace-nowrap transition-colors ${
              active
                ? 'border-line bg-panel text-ink shadow-[inset_0_-1px_0_var(--color-panel)]'
                : 'border-transparent text-muted hover:bg-white/[0.025] hover:text-ink'
            }`}
            onClick={() => onSelect(profile.id)}
            title={meta.title}
            data-testid="ecs-profile-tab"
          >
            <span className={`status-dot ${meta.tone}`} />
            <span className="max-w-[220px] truncate font-medium">{profile.name}</span>
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
        onClick={onAddProfile}
        aria-label="Add profile"
        title="Add profile"
        data-testid="tab-add-ecs-profile"
      >
        <PlusIcon size={14} />
      </button>
    </div>
  )
}
