import type { ToastItem } from '../lib/ui'

export function Toasts({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div className="toasts" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.tone}`}>
          {toast.message}
        </div>
      ))}
    </div>
  )
}
