import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from './Icons'

interface ModalProps {
  title: string
  subtitle?: string
  size?: 'sm' | 'md' | 'lg'
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** Extra classes for the scrollable body, e.g. to turn it into a flex container. */
  bodyClassName?: string
}

function sizeClass(size: 'sm' | 'md' | 'lg'): string {
  if (size === 'sm') return 'modal-sm'
  if (size === 'lg') return 'modal-lg'
  return ''
}

export function Modal({
  title,
  subtitle,
  size = 'md',
  onClose,
  children,
  footer,
  bodyClassName
}: ModalProps) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return createPortal(
    <div className="modal-backdrop">
      <div
        className={`modal ${sizeClass(size)}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-head">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold tracking-[-0.01em]">{title}</h2>
            {subtitle && <p className="mt-1 text-xs text-muted">{subtitle}</p>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <div className={`modal-body ${bodyClassName ?? ''}`}>{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}
