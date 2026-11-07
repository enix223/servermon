import { useMemo, useState } from 'react'
import type { EcsInstanceInfo } from '@shared/types'
import { formatAge } from '../lib/format'
import { ecsStatusTone, formatChargeType, formatMemory } from '../lib/ecs'
import { ChevronDownIcon } from './Icons'

type SortKey =
  | 'name'
  | 'status'
  | 'type'
  | 'cpu'
  | 'memory'
  | 'os'
  | 'zone'
  | 'privateIp'
  | 'publicIp'
  | 'age'

interface SortState {
  key: SortKey
  dir: 1 | -1
}

interface EcsInstanceTableProps {
  instances: EcsInstanceInfo[]
  emptyTitle: string
  emptyHint?: string
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

function compare(a: EcsInstanceInfo, b: EcsInstanceInfo, key: SortKey): number {
  switch (key) {
    case 'cpu':
      return a.cpu - b.cpu
    case 'memory':
      return a.memoryMiB - b.memoryMiB
    case 'age':
      return Date.parse(a.createdAt) - Date.parse(b.createdAt)
    case 'name':
      return collator.compare(a.name, b.name) || collator.compare(a.instanceId, b.instanceId)
    case 'status':
      return collator.compare(a.status, b.status)
    case 'type':
      return collator.compare(a.instanceType, b.instanceType)
    case 'os':
      return collator.compare(a.osName, b.osName)
    case 'zone':
      return collator.compare(a.zoneId, b.zoneId)
    case 'privateIp':
      return collator.compare(a.privateIp, b.privateIp)
    case 'publicIp':
      return collator.compare(a.publicIp, b.publicIp)
    default:
      return 0
  }
}

const HEADER_CLASS =
  'sticky top-0 z-[2] border-b border-line bg-panel-2 p-0 text-left text-[10.5px] font-medium tracking-[0.06em] whitespace-nowrap text-muted uppercase'
const CELL_CLASS = 'border-b border-line/60 px-3 py-2 align-middle whitespace-nowrap'

export function EcsInstanceTable({ instances, emptyTitle, emptyHint }: EcsInstanceTableProps) {
  const [sort, setSort] = useState<SortState>({ key: 'name', dir: 1 })

  const sorted = useMemo(() => {
    const copy = [...instances]
    copy.sort((a, b) => {
      const primary = compare(a, b, sort.key)
      if (primary !== 0) return primary * sort.dir
      return collator.compare(a.name, b.name) || collator.compare(a.instanceId, b.instanceId)
    })
    return copy
  }, [instances, sort])

  function toggleSort(key: SortKey): void {
    setSort((previous) =>
      previous.key === key ? { key, dir: previous.dir === 1 ? -1 : 1 } : { key, dir: 1 }
    )
  }

  function header(key: SortKey, label: string, className = '') {
    const active = sort.key === key
    return (
      <th
        scope="col"
        className={`${HEADER_CLASS} ${className}`}
        aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
      >
        <button
          type="button"
          className="inline-flex h-9 items-center gap-[5px] border-0 bg-transparent px-3 tracking-[0.06em] text-inherit uppercase hover:text-ink"
          onClick={() => toggleSort(key)}
        >
          {label}
          <ChevronDownIcon
            size={12}
            className={`transition ${
              active ? 'text-accent opacity-90' : 'opacity-20'
            } ${active && sort.dir === -1 ? 'rotate-180' : ''}`}
          />
        </button>
      </th>
    )
  }

  return (
    <div className="table-wrap">
      <table className="w-full border-separate border-spacing-0 text-xs">
        <thead>
          <tr>
            {header('name', 'Instance', 'w-[24%] max-w-[340px]')}
            {header('status', 'Status', 'w-[120px]')}
            {header('type', 'Type', 'w-[140px] max-w-[160px]')}
            {header('cpu', 'vCPU', 'w-[62px]')}
            {header('memory', 'Memory', 'w-[84px]')}
            {header('os', 'OS', 'w-[170px] max-w-[200px] max-[1180px]:hidden')}
            {header('zone', 'Zone', 'w-[130px] max-w-[150px] max-[980px]:hidden')}
            {header('privateIp', 'Private IP', 'w-[130px] max-[1180px]:hidden')}
            {header('publicIp', 'Public IP', 'w-[140px] max-[980px]:hidden')}
            {header('age', 'Age', 'w-[70px]')}
          </tr>
        </thead>
        <tbody className="[&>tr:last-child>td]:border-b-0">
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={10}>
                <div className="table-empty">
                  <strong className="block text-[13px] font-semibold text-ink">{emptyTitle}</strong>
                  {emptyHint && <p className="mt-1.5 text-[11.5px] text-dim">{emptyHint}</p>}
                </div>
              </td>
            </tr>
          ) : (
            sorted.map((instance) => {
              const tone = ecsStatusTone(instance.status)
              return (
                <tr
                  key={instance.instanceId}
                  className="hover:bg-accent/[0.045]"
                  data-testid="ecs-instance-row"
                >
                  <td className={`${CELL_CLASS} w-[24%] max-w-[340px]`}>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span
                        className="inline-block max-w-full overflow-hidden font-mono text-[11.5px] tracking-[-0.01em] text-ellipsis whitespace-nowrap text-[#dbe7f7] align-bottom"
                        title={instance.instanceId}
                      >
                        {instance.name}
                      </span>
                      <span
                        className="inline-block max-w-full overflow-hidden font-mono text-[10px] text-ellipsis whitespace-nowrap text-dim"
                        title={instance.instanceId}
                      >
                        {instance.instanceId}
                      </span>
                    </span>
                  </td>
                  <td className={`${CELL_CLASS} w-[120px]`}>
                    <span
                      className={`status-pill ${tone}`}
                      title={`${formatChargeType(instance.chargeType)}${instance.hostName ? ` · ${instance.hostName}` : ''}`}
                    >
                      <span className="pill-dot" />
                      {instance.status}
                    </span>
                  </td>
                  <td
                    className={`${CELL_CLASS} w-[140px] max-w-[160px] overflow-hidden text-ellipsis text-muted`}
                    title={instance.instanceType}
                  >
                    <span className="font-mono text-[11.5px]">{instance.instanceType || '—'}</span>
                  </td>
                  <td className={`${CELL_CLASS} w-[62px]`}>
                    <span className="font-mono text-[11.5px] text-muted">{instance.cpu || '—'}</span>
                  </td>
                  <td className={`${CELL_CLASS} w-[84px]`}>
                    <span className="font-mono text-[11.5px] text-dim">
                      {formatMemory(instance.memoryMiB)}
                    </span>
                  </td>
                  <td
                    className={`${CELL_CLASS} w-[170px] max-w-[200px] overflow-hidden text-ellipsis text-dim max-[1180px]:hidden`}
                    title={instance.osName}
                  >
                    {instance.osName || '—'}
                  </td>
                  <td
                    className={`${CELL_CLASS} w-[130px] max-w-[150px] overflow-hidden text-ellipsis text-dim max-[980px]:hidden`}
                    title={instance.zoneId}
                  >
                    <span className="font-mono text-[11.5px]">{instance.zoneId || '—'}</span>
                  </td>
                  <td
                    className={`${CELL_CLASS} w-[130px] text-dim max-[1180px]:hidden`}
                    title={instance.privateIp}
                  >
                    <span className="font-mono text-[11.5px]">{instance.privateIp || '—'}</span>
                  </td>
                  <td
                    className={`${CELL_CLASS} w-[140px] text-dim max-[980px]:hidden`}
                    title={instance.publicIp}
                  >
                    <span className="font-mono text-[11.5px]">{instance.publicIp || '—'}</span>
                  </td>
                  <td className={`${CELL_CLASS} w-[70px]`} title={instance.createdAt}>
                    <span className="font-mono text-[11.5px] text-dim">
                      {formatAge(instance.createdAt)}
                    </span>
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
