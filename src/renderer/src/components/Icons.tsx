interface IconProps {
  size?: number
  className?: string
}

function base(size: number, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true
  }
}

export function LogoIcon({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient id="logo-grad" x1="4" y1="3" x2="20" y2="13" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8bbcff" />
          <stop offset="1" stopColor="#3d7bfd" />
        </linearGradient>
      </defs>
      <path d="M12 2.6 21.2 7.4 12 12.2 2.8 7.4 12 2.6Z" fill="url(#logo-grad)" opacity="0.95" />
      <path
        d="m2.8 12.2 9.2 4.8 9.2-4.8M2.8 16.9l9.2 4.8 9.2-4.8"
        stroke="#4f7fd6"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
    </svg>
  )
}

export function RefreshIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v5h-5" />
    </svg>
  )
}

export function PauseIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="8" y="5" width="3" height="14" rx="1" fill="currentColor" stroke="none" />
      <rect x="14" y="5" width="3" height="14" rx="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function PlayIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M8 5.5v13l10-6.5-10-6.5Z" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function PlusIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function SearchIcon({ size = 15, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="11" cy="11" r="7.5" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

export function CloseIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

export function ChevronDownIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export function PlugIcon({ size = 15, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 22v-5M9 8V2M15 8V2M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
    </svg>
  )
}

export function PencilIcon({ size = 15, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z" />
    </svg>
  )
}

export function TrashIcon({ size = 15, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" />
    </svg>
  )
}

export function AlertIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M10.3 3.8 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.8a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  )
}

export function CheckIcon({ size = 15, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

export function EyeIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function EyeOffIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M10.7 5.1A11.8 11.8 0 0 1 12 5c6.5 0 10 7 10 7a17.8 17.8 0 0 1-3.2 4.2M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7a10.8 10.8 0 0 0 5.4-1.4" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20" />
    </svg>
  )
}

export function CubeIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="m12 3 8.5 4.8v8.4L12 21l-8.5-4.8V7.8L12 3Z" />
      <path d="m3.7 7.8 8.3 4.8 8.3-4.8M12 12.6V21" />
    </svg>
  )
}

export function CloudIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M17.5 19a4.3 4.3 0 0 0 .4-8.6 6.2 6.2 0 0 0-11.9 1.2A3.9 3.9 0 0 0 6.6 19h10.9Z" />
    </svg>
  )
}

export function KeyIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="7.5" cy="15.5" r="3.5" />
      <path d="m10 13 8.5-8.5M16 6l2.5 2.5M14 8l2.5 2.5" />
    </svg>
  )
}

export function ServerIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="3" y="4" width="18" height="7" rx="1.5" />
      <rect x="3" y="13" width="18" height="7" rx="1.5" />
      <path d="M7 7.5h.01M7 16.5h.01" />
    </svg>
  )
}

export function GearIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.17.5.61.9 1.16 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51.97Z" />
    </svg>
  )
}

export function LayersIcon({ size = 28, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 2 2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  )
}

export function SpinnerIcon({ size = 15, className }: IconProps) {
  return (
    <svg {...base(size, className)} className={`spin ${className ?? ''}`}>
      <path d="M21 12a9 9 0 1 1-9-9" />
    </svg>
  )
}
