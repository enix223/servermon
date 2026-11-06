import type { ReactNode } from 'react'
import { NAV_GROUPS } from '../lib/navigation'
import type { PageId } from '../lib/ui'
import { CloudIcon, CubeIcon, GearIcon, LayersIcon, LogoIcon } from './Icons'

const PAGE_ICONS: Record<PageId, ReactNode> = {
  'k8s-pods': <CubeIcon size={16} />,
  'k8s-clusters': <LayersIcon size={16} />,
  'aliyun-ecs': <CloudIcon size={16} />,
  settings: <GearIcon size={16} />
}

interface SidebarProps {
  page: PageId
  onNavigate: (page: PageId) => void
  version?: string
  isMac?: boolean
}

export function Sidebar({ page, onNavigate, version, isMac }: SidebarProps) {
  return (
    <aside
      className={`flex w-[66px] min-h-0 flex-none flex-col border-r border-line bg-linear-to-b from-[#0f151e]/[0.82] to-[#090d13]/[0.72] px-2.5 pb-3.5 sidebar:w-56 sidebar:px-3 ${
        isMac ? 'pt-11' : 'pt-4'
      }`}
    >
      <div className="drag flex items-center justify-center gap-2.5 pb-5 sidebar:justify-start sidebar:px-2">
        <LogoIcon
          size={22}
          className="flex-none drop-shadow-[0_3px_10px_rgba(63,127,242,0.35)]"
        />
        <div className="hidden min-w-0 flex-col gap-px sidebar:flex">
          <span className="text-sm font-semibold tracking-[-0.01em]">ServerMon</span>
          <span className="text-[9px] tracking-[0.11em] whitespace-nowrap text-dim uppercase">
            monitoring console
          </span>
        </div>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pb-3" aria-label="Modules">
        {NAV_GROUPS.map((group) => (
          <div className="flex flex-col gap-1.5 sidebar:gap-0.5" key={group.label}>
            <span className="hidden px-2.5 pb-1.5 text-[9.5px] font-semibold tracking-[0.12em] whitespace-nowrap text-dim uppercase sidebar:block">
              {group.label}
            </span>
            {group.items.map((item) => {
              const active = page === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`group relative flex h-[34px] items-center justify-center gap-[9px] rounded-control border px-0 text-left text-[12.5px] transition-colors sidebar:justify-start sidebar:px-2.5 ${
                    active
                      ? 'border-line bg-panel-2 text-ink shadow-[inset_2px_0_0_var(--color-accent)]'
                      : 'border-transparent bg-transparent text-muted hover:bg-white/[0.035] hover:text-ink'
                  }`}
                  onClick={() => onNavigate(item.id)}
                  title={item.label}
                  data-testid={`nav-${item.id}`}
                >
                  <span
                    className={`grid h-[18px] w-auto flex-none place-items-center sidebar:w-[18px] ${
                      active ? 'text-accent' : 'text-dim group-hover:text-accent'
                    }`}
                  >
                    {PAGE_ICONS[item.id]}
                  </span>
                  <span className="hidden flex-1 truncate text-left sidebar:block">
                    {item.label}
                  </span>
                  {item.badge && (
                    <span className="hidden rounded-[4px] border border-line px-[5px] py-px text-[8.5px] tracking-[0.08em] text-dim uppercase sidebar:inline">
                      {item.badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-transparent pt-2 sidebar:border-line sidebar:pt-3">
        <span className="hidden text-[10px] text-dim sidebar:inline">v{version ?? '0.1.0'}</span>
      </div>
    </aside>
  )
}
