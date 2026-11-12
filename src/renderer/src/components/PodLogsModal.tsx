import { useCallback, useEffect, useRef, useState } from 'react'
import type { PodInfo, PodLogsResult } from '@shared/types'
import { useApi } from '../data/ApiContext'
import { errorMessage, formatLatency, pluralize } from '../lib/format'
import {
  AlertIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  RefreshIcon,
  SpinnerIcon
} from './Icons'
import { Modal } from './Modal'
import { UpdatedAgo } from './UpdatedAgo'

type RangeMode = 'all' | '5m' | '15m' | '1h' | '6h' | '24h' | 'custom'

const PRESET_MINUTES: Record<'5m' | '15m' | '1h' | '6h' | '24h', number> = {
  '5m': 5,
  '15m': 15,
  '1h': 60,
  '6h': 360,
  '24h': 1440
}

const RANGE_OPTIONS: { value: RangeMode; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: '5m', label: 'Last 5 minutes' },
  { value: '15m', label: 'Last 15 minutes' },
  { value: '1h', label: 'Last hour' },
  { value: '6h', label: 'Last 6 hours' },
  { value: '24h', label: 'Last 24 hours' },
  { value: 'custom', label: 'Custom range…' }
]

const TAIL_OPTIONS = [100, 500, 1000, 5000]
const LIVE_INTERVAL_MS = 3000

const SELECT_CLASS =
  'h-8 appearance-none rounded-control border border-line bg-panel pr-[26px] pl-2.5 text-[11.5px] text-ink outline-none transition focus:border-accent/50 focus:ring-[3px] focus:ring-accent/10'
const DATE_CLASS =
  'h-8 rounded-control border border-line bg-panel px-2 text-[11.5px] text-ink outline-none [color-scheme:dark] focus:border-accent/50 focus:ring-[3px] focus:ring-accent/10'

interface PodLogsModalProps {
  clusterId: number
  pod: PodInfo
  onClose: () => void
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0')
}

function normalizeNano(timestamp: string): string {
  return timestamp.replace(/(\.\d{3})\d+/, '$1')
}

function formatLogTime(timestamp: string | null): string {
  if (!timestamp) return ''
  const date = new Date(normalizeNano(timestamp))
  if (Number.isNaN(date.getTime())) return timestamp
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(
    date.getMilliseconds(),
    3
  )}`
  if (date.toDateString() === new Date().toDateString()) return time
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}`
}

function logTone(line: string): string {
  if (/\b(error|fatal|panic|exception|failed|failure)\b/i.test(line)) return 'text-[#ffb4b4]'
  if (/\bwarn(ing)?\b/i.test(line)) return 'text-[#fcd34d]'
  return ''
}

function toLocalInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`
}

function parseLocalInput(value: string): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Lazy log viewer: logs are fetched only when this dialog opens (and on each
 * explicit refresh / live tick), never as part of the pod polling loop.
 */
export function PodLogsModal({ clusterId, pod, onClose }: PodLogsModalProps) {
  const api = useApi()
  const containers = pod.containers
  const [container, setContainer] = useState<string | null>(containers[0] ?? null)
  const [previous, setPrevious] = useState(false)
  const [tailLines, setTailLines] = useState(500)
  const [rangeMode, setRangeMode] = useState<RangeMode>('all')
  const [fromInput, setFromInput] = useState('')
  const [toInput, setToInput] = useState('')
  const [customRange, setCustomRange] = useState<{ since: string | null; until: string | null }>({
    since: null,
    until: null
  })
  const [rangeError, setRangeError] = useState<string | null>(null)
  const [live, setLive] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [result, setResult] = useState<PodLogsResult | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  const requestId = useRef(0)
  const paneRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)

  useEffect(() => {
    const id = ++requestId.current
    setLoading(true)

    const now = Date.now()
    const presetMinutes =
      rangeMode !== 'all' && rangeMode !== 'custom' ? PRESET_MINUTES[rangeMode] : null
    const since =
      rangeMode === 'custom'
        ? customRange.since
        : presetMinutes !== null
          ? new Date(now - presetMinutes * 60_000).toISOString()
          : null
    const until = rangeMode === 'custom' ? customRange.until : null

    api
      .getPodLogs(clusterId, {
        namespace: pod.namespace,
        podName: pod.name,
        container,
        previous,
        tailLines,
        sinceTime: since,
        endTime: until
      })
      .then((next) => {
        if (id !== requestId.current) return
        setRequestError(null)
        setResult((previousResult) => {
          // Keep the last readable lines while a live refresh fails.
          if (next.error && previousResult && previousResult.lines.length > 0) {
            return {
              ...previousResult,
              error: next.error,
              fetchedAt: next.fetchedAt,
              latencyMs: next.latencyMs
            }
          }
          return next
        })
      })
      .catch((caught: unknown) => {
        if (id !== requestId.current) return
        setRequestError(errorMessage(caught))
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false)
      })
  }, [
    api,
    clusterId,
    pod.namespace,
    pod.name,
    container,
    previous,
    tailLines,
    rangeMode,
    customRange,
    reloadToken
  ])

  useEffect(() => {
    if (!live) return
    const timer = window.setInterval(() => setReloadToken((value) => value + 1), LIVE_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [live])

  // A new query starts at the newest line; scrolling up pauses the auto-follow.
  useEffect(() => {
    stickToBottom.current = true
  }, [container, previous, tailLines, rangeMode, customRange])

  useEffect(() => {
    const pane = paneRef.current
    if (pane && stickToBottom.current) pane.scrollTop = pane.scrollHeight
  }, [result])

  function onPaneScroll(): void {
    const pane = paneRef.current
    if (!pane) return
    stickToBottom.current = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 32
  }

  function onRangeModeChange(mode: RangeMode): void {
    setRangeMode(mode)
    setRangeError(null)
    if (mode === 'custom' && !fromInput && !toInput) {
      const now = Date.now()
      setFromInput(toLocalInputValue(new Date(now - 15 * 60_000)))
      setToInput(toLocalInputValue(new Date(now)))
      setCustomRange({
        since: new Date(now - 15 * 60_000).toISOString(),
        until: new Date(now).toISOString()
      })
    }
  }

  function applyCustomRange(): void {
    const since = parseLocalInput(fromInput)
    const until = parseLocalInput(toInput)
    if (fromInput && since === null) {
      setRangeError('Enter a valid "From" time.')
      return
    }
    if (toInput && until === null) {
      setRangeError('Enter a valid "To" time.')
      return
    }
    if (since !== null && until !== null && since > until) {
      setRangeError('"From" must be before "To".')
      return
    }
    setRangeError(null)
    setCustomRange({
      since: since !== null ? new Date(since).toISOString() : null,
      until: until !== null ? new Date(until).toISOString() : null
    })
  }

  const copyLogs = useCallback(async () => {
    const lines = result?.lines ?? []
    if (lines.length === 0) return
    const text = lines
      .map((line) => (line.timestamp ? `${line.timestamp} ${line.line}` : line.line))
      .join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setRequestError('Could not copy the logs to the clipboard.')
    }
  }, [result])

  const lines = result?.lines ?? []
  const activeError = requestError ?? result?.error ?? null
  const showEmpty = result !== null && lines.length === 0 && !loading && !activeError

  return (
    <Modal
      title="Pod logs"
      subtitle={`${pod.namespace} / ${pod.name} · ${pod.status}`}
      size="lg"
      onClose={onClose}
      bodyClassName="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden"
      footer={
        <>
          <span className="text-[11px] tabular-nums text-dim" data-testid="logs-summary">
            {result
              ? `${pluralize(lines.length, 'line')}${result.truncated ? ' · truncated' : ''}`
              : loading
                ? 'Reading logs…'
                : 'No data'}
          </span>
          {result && !activeError && (
            <span className="text-[11px] text-dim">{formatLatency(result.latencyMs)}</span>
          )}
          {previous && <span className="text-[10.5px] text-warn">previous container</span>}
          <div className="flex-1" />
          <UpdatedAgo iso={result?.fetchedAt} verb={activeError ? 'Attempted' : 'Updated'} />
          <span className="text-[10.5px] text-dim">Esc to close</span>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2.5">
        {containers.length > 1 ? (
          <label className="flex items-center gap-1.5 text-[11px] text-dim">
            Container
            <span className="relative inline-flex items-center">
              <select
                className={`${SELECT_CLASS} max-w-[220px]`}
                value={container ?? ''}
                onChange={(event) => setContainer(event.target.value)}
                aria-label="Container"
              >
                {containers.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <ChevronDownIcon
                size={13}
                className="pointer-events-none absolute right-2.5 text-dim"
              />
            </span>
          </label>
        ) : (
          <span className="text-[11px] text-dim">
            Container <span className="font-mono text-muted">{container ?? 'default'}</span>
          </span>
        )}

        <label className="flex items-center gap-1.5 text-[11px] text-dim">
          Time
          <span className="relative inline-flex items-center">
            <select
              className={SELECT_CLASS}
              value={rangeMode}
              onChange={(event) => onRangeModeChange(event.target.value as RangeMode)}
              aria-label="Time range"
            >
              {RANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDownIcon size={13} className="pointer-events-none absolute right-2.5 text-dim" />
          </span>
        </label>

        <label className="flex items-center gap-1.5 text-[11px] text-dim">
          Lines
          <span className="relative inline-flex items-center">
            <select
              className={SELECT_CLASS}
              value={tailLines}
              onChange={(event) => setTailLines(Number(event.target.value))}
              aria-label="Line limit"
            >
              {TAIL_OPTIONS.map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
            <ChevronDownIcon size={13} className="pointer-events-none absolute right-2.5 text-dim" />
          </span>
        </label>

        <button
          type="button"
          className={`filter-chip ${previous ? 'active' : ''} disabled:cursor-default disabled:opacity-40`}
          aria-pressed={previous}
          disabled={pod.restarts === 0}
          title={
            pod.restarts === 0
              ? 'This pod has no restarted container'
              : 'Logs from the previous container instance'
          }
          onClick={() => setPrevious((value) => !value)}
        >
          Previous
        </button>

        <button
          type="button"
          className={`filter-chip ${live ? 'active' : ''}`}
          aria-pressed={live}
          title="Refetch the logs every 3 seconds"
          onClick={() => setLive((value) => !value)}
        >
          <span className={`status-dot ${live ? 'ok' : 'idle'}`} />
          Live
        </button>

        <div className="flex-1" />

        <button
          type="button"
          className="icon-btn"
          title={copied ? 'Copied' : 'Copy logs'}
          aria-label="Copy logs"
          disabled={lines.length === 0}
          onClick={() => void copyLogs()}
        >
          {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Reload logs"
          aria-label="Reload logs"
          disabled={loading}
          onClick={() => setReloadToken((value) => value + 1)}
        >
          <RefreshIcon size={14} className={loading ? 'spin' : undefined} />
        </button>
      </div>

      {rangeMode === 'custom' && (
        <div className="flex flex-wrap items-center gap-2 rounded-control border border-line bg-white/[0.02] px-2.5 py-2">
          <label className="flex items-center gap-1.5 text-[11px] text-dim">
            From
            <input
              type="datetime-local"
              className={DATE_CLASS}
              value={fromInput}
              onChange={(event) => setFromInput(event.target.value)}
              aria-label="Log start time"
              data-testid="logs-from"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-dim">
            To
            <input
              type="datetime-local"
              className={DATE_CLASS}
              value={toInput}
              onChange={(event) => setToInput(event.target.value)}
              aria-label="Log end time"
              data-testid="logs-to"
            />
          </label>
          <button type="button" className="btn btn-sm" onClick={applyCustomRange}>
            Apply
          </button>
          <span className="text-[10.5px] text-dim">Leave “To” empty to read up to now.</span>
          {rangeError && <span className="text-[11px] text-err">{rangeError}</span>}
        </div>
      )}

      <div
        className="log-pane"
        ref={paneRef}
        onScroll={onPaneScroll}
        tabIndex={0}
        role="log"
        aria-label="Pod log output"
        data-testid="log-pane"
      >
        {activeError && (
          <div className="sticky top-0 z-[1] mb-1.5 flex items-start gap-2 rounded-[6px] border border-err/30 bg-[#3a1519]/95 px-2.5 py-2 text-[11px] leading-[1.45] text-[#fca5a5]">
            <AlertIcon size={14} className="mt-px flex-none" />
            <span className="min-w-0 break-words">{activeError}</span>
          </div>
        )}

        {!result && loading && (
          <div className="log-empty">
            <span className="inline-flex items-center gap-2">
              <SpinnerIcon size={14} /> Reading logs…
            </span>
          </div>
        )}

        {showEmpty && (
          <div className="log-empty">
            {rangeMode === 'all'
              ? 'This pod has not written any logs yet.'
              : 'No log lines in this time range.'}
          </div>
        )}

        {lines.map((line, index) => (
          <div className="log-line" key={index} data-testid="log-line" data-timestamp={line.timestamp ?? undefined}>
            <span className="log-time" title={line.timestamp ?? undefined}>
              {formatLogTime(line.timestamp)}
            </span>
            <span className={`log-text ${logTone(line.line)}`}>{line.line || ' '}</span>
          </div>
        ))}
      </div>
    </Modal>
  )
}
