import { useMemo, useState } from 'react'
import type { PodInfo } from '@shared/types'
import { formatAge } from '../lib/format'
import { readyIsFull, statusTone } from '../lib/pods'
import { ChevronDownIcon } from './Icons'

type SortKey = 'namespace' | 'name' | 'ready' | 'status' | 'restarts' | 'age' | 'node' | 'ip'

interface SortState {
  key: SortKey
  dir: 1 | -1
}

interface PodTableProps {
  pods: PodInfo[]
  emptyTitle: string
  emptyHint?: string
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

function readyRatio(ready: string): number {
  const [readyCount, total] = ready.split('/').map(Number)
  if (!Number.isFinite(readyCount) || !Number.isFinite(total) || total === 0) return 1
  return readyCount / total
}

function compare(a: PodInfo, b: PodInfo, key: SortKey): number {
  switch (key) {
    case 'ready':
      return readyRatio(a.ready) - readyRatio(b.ready)
    case 'restarts':
      return a.restarts - b.restarts
    case 'age':
      return Date.parse(a.createdAt) - Date.parse(b.createdAt)
    case 'namespace':
      return collator.compare(a.namespace, b.namespace) || collator.compare(a.name, b.name)
    case 'name':
      return collator.compare(a.name, b.name)
    case 'status':
      return collator.compare(a.status, b.status)
    case 'node':
      return collator.compare(a.node, b.node)
    case 'ip':
      return collator.compare(a.podIP, b.podIP)
    default:
      return 0
  }
}

const HEADER_CLASS =
  'sticky top-0 z-[2] border-b border-line bg-panel-2 p-0 text-left text-[10.5px] font-medium tracking-[0.06em] whitespace-nowrap text-muted uppercase'
const CELL_CLASS = 'border-b border-line/60 px-3 py-2 align-middle whitespace-nowrap'

export function PodTable({ pods, emptyTitle, emptyHint }: PodTableProps) {
  const [sort, setSort] = useState<SortState>({ key: 'namespace', dir: 1 })

  const sorted = useMemo(() => {
    const copy = [...pods]
    copy.sort((a, b) => {
      const primary = compare(a, b, sort.key)
      if (primary !== 0) return primary * sort.dir
      return collator.compare(a.namespace, b.namespace) || collator.compare(a.name, b.name)
    })
    return copy
  }, [pods, sort])

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
            {header('namespace', 'Namespace', 'w-[12%] max-w-[170px]')}
            {header('name', 'Pod', 'w-[28%] max-w-[430px]')}
            {header('ready', 'Ready', 'w-16')}
            {header('status', 'Status', 'w-[180px]')}
            {header('restarts', 'Restarts', 'w-20')}
            {header('age', 'Age', 'w-[70px]')}
            {header('node', 'Node', 'w-[150px] max-w-[180px] max-[980px]:hidden')}
            {header('ip', 'IP', 'w-[120px] max-[1180px]:hidden')}
          </tr>
        </thead>
        <tbody className="[&>tr:last-child>td]:border-b-0">
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={8}>
                <div className="table-empty">
                  <strong className="block text-[13px] font-semibold text-ink">{emptyTitle}</strong>
                  {emptyHint && <p className="mt-1.5 text-[11.5px] text-dim">{emptyHint}</p>}
                </div>
              </td>
            </tr>
          ) : (
            sorted.map((pod) => {
              const tone = statusTone(pod.status)
              const images = pod.images.length > 0 ? `Images:\n${pod.images.join('\n')}` : undefined
              return (
                <tr key={`${pod.namespace}/${pod.name}`} className="hover:bg-accent/[0.045]" data-testid="pod-row">
                  <td
                    className={`${CELL_CLASS} w-[12%] max-w-[170px] overflow-hidden text-ellipsis text-muted`}
                    title={pod.namespace}
                  >
                    {pod.namespace}
                  </td>
                  <td className={`${CELL_CLASS} w-[28%] max-w-[430px]`}>
                    <span
                      className="inline-block max-w-full overflow-hidden font-mono text-[11.5px] tracking-[-0.01em] text-ellipsis whitespace-nowrap text-[#dbe7f7] align-bottom"
                      title={images}
                    >
                      {pod.name}
                    </span>
                  </td>
                  <td className={`${CELL_CLASS} w-16`}>
                    <span
                      className={`font-mono text-[11.5px] ${
                        readyIsFull(pod.ready) ? 'text-dim' : 'text-warn'
                      }`}
                    >
                      {pod.ready}
                    </span>
                  </td>
                  <td className={`${CELL_CLASS} w-[180px]`}>
                    <span className={`status-pill ${tone}`} title={`Phase: ${pod.phase}`}>
                      <span className="pill-dot" />
                      {pod.status}
                    </span>
                  </td>
                  <td className={`${CELL_CLASS} w-20`}>
                    <span
                      className={`font-mono text-[11.5px] ${
                        pod.restarts >= 10
                          ? 'text-err'
                          : pod.restarts > 0
                            ? 'text-warn'
                            : 'text-dim'
                      }`}
                    >
                      {pod.restarts}
                    </span>
                  </td>
                  <td className={`${CELL_CLASS} w-[70px]`} title={pod.createdAt}>
                    <span className="font-mono text-[11.5px] text-dim">
                      {formatAge(pod.createdAt)}
                    </span>
                  </td>
                  <td
                    className={`${CELL_CLASS} w-[150px] max-w-[180px] overflow-hidden text-ellipsis text-dim max-[980px]:hidden`}
                    title={pod.node}
                  >
                    <span className="font-mono text-[11.5px]">{pod.node || '—'}</span>
                  </td>
                  <td
                    className={`${CELL_CLASS} w-[120px] text-dim max-[1180px]:hidden`}
                    title={pod.podIP}
                  >
                    <span className="font-mono text-[11.5px]">{pod.podIP || '—'}</span>
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
