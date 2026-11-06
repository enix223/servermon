import { PauseIcon, PlayIcon, RefreshIcon } from './Icons'

interface TopBarProps {
  moduleLabel: string
  pageLabel: string
  /** Kubernetes polling controls are hidden on modules that are not wired up yet. */
  showControls: boolean
  refreshIntervalSeconds: number
  autoRefresh: boolean
  onToggleAutoRefresh: () => void
  onRefresh: () => void
  refreshing: boolean
}

export function TopBar({
  moduleLabel,
  pageLabel,
  showControls,
  refreshIntervalSeconds,
  autoRefresh,
  onToggleAutoRefresh,
  onRefresh,
  refreshing
}: TopBarProps) {
  return (
    <header className="drag flex h-[52px] flex-none items-center gap-4 border-b border-line bg-[#0a0f16]/60 px-5 backdrop-blur-xl">
      <div className="flex min-w-0 items-baseline gap-2 text-[12.5px]" aria-label="Current page">
        <span className="text-dim">{moduleLabel}</span>
        <span className="text-[#334155]">/</span>
        <span className="font-semibold text-ink">{pageLabel}</span>
      </div>

      <div className="flex-1" />

      {showControls && (
        <div className="no-drag flex items-center gap-2">
          <span className={`live-pill ${autoRefresh ? 'live' : 'paused'}`}>
            <span className="live-dot" />
            {autoRefresh ? `Live · ${refreshIntervalSeconds}s` : 'Paused'}
          </span>
          <button
            type="button"
            className="icon-btn"
            onClick={onToggleAutoRefresh}
            aria-label={autoRefresh ? 'Pause auto-refresh' : 'Resume auto-refresh'}
            title={autoRefresh ? 'Pause auto-refresh' : 'Resume auto-refresh'}
            data-testid="toggle-refresh"
          >
            {autoRefresh ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={onRefresh}
            aria-label="Refresh now"
            title="Refresh now"
            disabled={refreshing}
          >
            <RefreshIcon className={refreshing ? 'spin' : undefined} />
          </button>
        </div>
      )}
    </header>
  )
}
