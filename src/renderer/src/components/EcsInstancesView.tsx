import { useEffect, useMemo, useState } from 'react'
import type { EcsInstancesResult, EcsProfileRecord } from '@shared/types'
import { EcsInstanceTable } from './EcsInstanceTable'
import { UpdatedAgo } from './UpdatedAgo'
import { AlertIcon, ChevronDownIcon, CloseIcon, SearchIcon } from './Icons'
import { computeEcsStats, isEcsIssue, type EcsStats } from '../lib/ecs'
import { formatLatency, pluralize } from '../lib/format'
import type { Tone } from '../lib/pods'

interface EcsInstancesViewProps {
  profile: EcsProfileRecord
  result?: EcsInstancesResult
  fetching: boolean
  autoRefresh: boolean
  refreshIntervalSeconds: number
}

function connectionState(
  result: EcsInstancesResult | undefined,
  fetching: boolean
): { tone: Tone; label: string } {
  if (result?.error) return { tone: 'err', label: 'Disconnected' }
  if (result) return { tone: 'ok', label: 'Connected' }
  if (fetching) return { tone: 'warn', label: 'Connecting…' }
  return { tone: 'idle', label: 'Waiting' }
}

const SKELETON_WIDTHS = ['w-[22%]', 'w-[10%]', 'w-[12%]', 'w-[6%]', 'w-[8%]', 'w-[14%]', 'w-[10%]']

function TableSkeleton() {
  return (
    <div className="table-wrap">
      <div className="flex flex-col gap-[15px] p-4" aria-label="Loading instances">
        {Array.from({ length: 9 }, (_, index) => (
          <div className="flex items-center gap-[22px]" key={index}>
            {SKELETON_WIDTHS.map((width, column) => (
              <span className={`skeleton-bar ${width}`} key={column} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function EcsInstancesView({
  profile,
  result,
  fetching,
  autoRefresh,
  refreshIntervalSeconds
}: EcsInstancesViewProps) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [issuesOnly, setIssuesOnly] = useState(false)

  const instances = result?.instances ?? []
  const stats: EcsStats = useMemo(() => computeEcsStats(instances), [instances])
  const statuses = useMemo(
    () => Array.from(new Set(instances.map((instance) => instance.status))).sort((a, b) => a.localeCompare(b)),
    [instances]
  )

  useEffect(() => {
    if (status !== 'all' && !statuses.includes(status)) setStatus('all')
  }, [status, statuses])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return instances.filter((instance) => {
      if (issuesOnly && !isEcsIssue(instance)) return false
      if (status !== 'all' && instance.status !== status) return false
      if (!query) return true
      return (
        instance.name.toLowerCase().includes(query) ||
        instance.instanceId.toLowerCase().includes(query) ||
        instance.status.toLowerCase().includes(query) ||
        instance.instanceType.toLowerCase().includes(query) ||
        instance.osName.toLowerCase().includes(query) ||
        instance.zoneId.toLowerCase().includes(query) ||
        instance.privateIp.toLowerCase().includes(query) ||
        instance.publicIp.toLowerCase().includes(query)
      )
    })
  }, [instances, search, issuesOnly, status])

  const connection = connectionState(result, fetching)
  const filtersActive = search.trim().length > 0 || issuesOnly || status !== 'all'

  let emptyTitle = 'No instances in this region'
  let emptyHint = result?.error
    ? 'Fix the connection to load instances.'
    : 'Instances will appear here as they are created.'
  if (instances.length > 0) {
    emptyTitle = 'No instances match these filters'
    emptyHint = 'Try clearing the search or filter options.'
  }

  return (
    <div className="mx-auto w-full max-w-[1680px] px-5 pb-7">
      <section className="mt-3.5 overflow-hidden rounded-panel border border-line bg-linear-to-b from-[#17202d]/[0.92] to-[#0f151e]/[0.92] shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
        <div className="flex justify-between gap-5 px-5 pt-[18px] pb-3.5">
          <div className="min-w-0">
            <div className="overview-title-row flex flex-wrap items-center gap-3">
              <h1 className="m-0 text-[22px] font-semibold tracking-[-0.02em]">{profile.name}</h1>
              <span className={`conn-pill ${connection.tone}`}>
                <span className="status-dot" />
                {connection.label}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px] text-muted">
              <span className="font-mono text-[11.5px] text-dim" title={profile.regionId}>
                {profile.regionId}
              </span>
              <span className="text-[#3b4a5e]">·</span>
              <span className="font-mono" title={profile.accessKeyId}>
                {profile.accessKeyId}
              </span>
              {profile.endpoint && (
                <>
                  <span className="text-[#3b4a5e]">·</span>
                  <span className="font-mono text-dim" title={profile.endpoint}>
                    {profile.endpoint}
                  </span>
                </>
              )}
              {result && !result.error && (
                <>
                  <span className="text-[#3b4a5e]">·</span>
                  <span>{formatLatency(result.latencyMs)}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex flex-none items-center gap-2 pt-1 text-[11.5px] text-dim">
            <UpdatedAgo iso={result?.fetchedAt} verb={result?.error ? 'Checked' : 'Updated'} />
            {fetching && (
              <span className="animate-blink h-1.5 w-1.5 rounded-full bg-accent" title="Refreshing…" />
            )}
          </div>
        </div>

        <div className="grid grid-cols-4 divide-x divide-line border-t border-line">
          <div className="flex items-baseline gap-[9px] px-5 py-3">
            <span className="text-xl font-semibold tracking-[-0.02em] tabular-nums">
              {result ? stats.total : '—'}
            </span>
            <span className="text-[10px] tracking-[0.1em] text-dim uppercase">Instances</span>
          </div>
          <div className="flex items-baseline gap-[9px] px-5 py-3">
            <span className="text-xl font-semibold tracking-[-0.02em] tabular-nums">
              {result ? stats.running : '—'}
            </span>
            <span className="text-[10px] tracking-[0.1em] text-dim uppercase">Running</span>
          </div>
          <div className="flex items-baseline gap-[9px] px-5 py-3">
            <span className="text-xl font-semibold tracking-[-0.02em] tabular-nums">
              {result ? stats.stopped : '—'}
            </span>
            <span className="text-[10px] tracking-[0.1em] text-dim uppercase">Stopped</span>
          </div>
          <div className="flex items-baseline gap-[9px] px-5 py-3">
            <span
              className={`text-xl font-semibold tracking-[-0.02em] tabular-nums ${
                stats.issues > 0 ? 'text-err' : ''
              }`}
            >
              {result ? stats.issues : '—'}
            </span>
            <span className="text-[10px] tracking-[0.1em] text-dim uppercase">Issues</span>
          </div>
        </div>
      </section>

      {result?.error && (
        <div
          className="mt-3.5 flex items-start gap-3 rounded-[10px] border border-err/25 bg-linear-to-b from-[#501a20]/30 to-[#321419]/20 px-3.5 py-3"
          role="alert"
        >
          <AlertIcon className="mt-0.5 flex-none text-err" />
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-semibold text-[#ffc2c2]">
              Cannot reach {profile.name}
            </div>
            <div className="mt-[3px] text-xs leading-[1.45] break-words text-[#e3a3a3]">
              {result.error}
            </div>
            {result.instances.length > 0 && (
              <div className="mt-[5px] text-[11px] text-dim">
                Showing the last successful snapshot.
              </div>
            )}
          </div>
          <span className="mt-0.5 flex-none text-[10.5px] whitespace-nowrap text-[#e3a3a3]">
            {autoRefresh ? `Retrying every ${refreshIntervalSeconds}s` : 'Auto-refresh paused'}
          </span>
        </div>
      )}

      {!result ? (
        <TableSkeleton />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 py-3.5 pb-2.5">
            <div className="relative flex min-w-[240px] flex-[0_1_380px] items-center">
              <SearchIcon className="pointer-events-none absolute left-2.5 text-dim" />
              <input
                className="h-8 w-full rounded-control border border-line bg-panel pr-[30px] pl-8 text-[12.5px] text-ink outline-none transition placeholder:text-dim focus:border-accent/50 focus:ring-[3px] focus:ring-accent/10"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search instances, ids, types, IPs…"
                aria-label="Search instances"
                spellCheck={false}
                data-testid="ecs-search"
              />
              {search && (
                <button
                  type="button"
                  className="absolute right-2 grid h-[18px] w-[18px] place-items-center rounded border-0 bg-white/[0.06] text-muted hover:text-ink"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                >
                  <CloseIcon size={13} />
                </button>
              )}
            </div>

            <div className="relative">
              <select
                className="h-8 max-w-[220px] appearance-none rounded-control border border-line bg-panel pr-[30px] pl-[11px] text-[12.5px] text-ink outline-none focus:border-accent/50 focus:ring-[3px] focus:ring-accent/10"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                aria-label="Filter by status"
              >
                <option value="all">All statuses</option>
                {statuses.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <ChevronDownIcon
                size={13}
                className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-dim"
              />
            </div>

            <button
              type="button"
              className={`filter-chip ${issuesOnly ? 'active' : ''}`}
              aria-pressed={issuesOnly}
              onClick={() => setIssuesOnly((value) => !value)}
            >
              Only issues
              {stats.issues > 0 && <span className="chip-count">{stats.issues}</span>}
            </button>

            <div className="flex-1" />
            <div className="text-[11px] tabular-nums text-dim">
              {filtered.length === instances.length
                ? pluralize(instances.length, 'instance')
                : `${filtered.length} of ${pluralize(instances.length, 'instance')}`}
            </div>
          </div>

          <EcsInstanceTable
            instances={filtered}
            emptyTitle={emptyTitle}
            emptyHint={filtersActive ? emptyHint : undefined}
          />
        </>
      )}
    </div>
  )
}
