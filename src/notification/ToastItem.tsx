import { CheckCircle2, Info, TriangleAlert, X, XCircle } from 'lucide-react'
import type { ToastItem as ToastItemData, ToastType } from './types'

interface ToastItemProps {
  toast: ToastItemData
  onDismiss: (id: string) => void
}

const TOAST_STYLE: Record<
  ToastType,
  { icon: typeof Info; iconClass: string; barClass: string; role: 'status' | 'alert'; live: 'polite' | 'assertive' }
> = {
  success: { icon: CheckCircle2, iconClass: 'text-emerald-500', barClass: 'bg-emerald-500', role: 'status', live: 'polite' },
  error: { icon: XCircle, iconClass: 'text-rose-500', barClass: 'bg-rose-500', role: 'alert', live: 'assertive' },
  warning: { icon: TriangleAlert, iconClass: 'text-amber-500', barClass: 'bg-amber-500', role: 'alert', live: 'assertive' },
  info: { icon: Info, iconClass: 'text-sky-500', barClass: 'bg-sky-500', role: 'status', live: 'polite' },
}

export default function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const { icon: Icon, iconClass, barClass, role, live } = TOAST_STYLE[toast.type]
  return (
    <div
      role={role}
      aria-live={live}
      className="toast-enter pointer-events-auto relative flex w-80 items-start gap-3 overflow-hidden rounded-lg border border-slate-200 bg-white p-3 pr-2 shadow-lg"
    >
      <span aria-hidden className={`absolute left-0 top-0 h-full w-1 ${barClass}`} />
      <Icon size={18} className={`mt-0.5 shrink-0 ${iconClass}`} />
      <p className="flex-1 text-sm leading-snug text-slate-700">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 rounded p-1 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500"
        aria-label="Tutup notifikasi"
      >
        <X size={14} />
      </button>
    </div>
  )
}
