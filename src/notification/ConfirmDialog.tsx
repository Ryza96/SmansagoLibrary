import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { HelpCircle, TriangleAlert } from 'lucide-react'
import type { ConfirmDescriptor } from './types'

interface ConfirmDialogProps {
  confirm: ConfirmDescriptor | null
  onResolve: (value: boolean) => void
}

export default function ConfirmDialog({ confirm, onResolve }: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!confirm) return
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onResolve(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirm, onResolve])

  if (!confirm) return null

  const Icon = confirm.danger ? TriangleAlert : HelpCircle

  function handleTabTrap(e: React.KeyboardEvent) {
    if (e.key !== 'Tab') return
    const buttons = [cancelRef.current, confirmButtonRef.current].filter(Boolean) as HTMLButtonElement[]
    if (buttons.length < 2) return
    if (!e.shiftKey && document.activeElement === buttons[1]) {
      e.preventDefault()
      buttons[0].focus()
    } else if (e.shiftKey && document.activeElement === buttons[0]) {
      e.preventDefault()
      buttons[1].focus()
    }
  }

  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={`confirm-title-${confirm.id}`}
      aria-describedby={confirm.message ? `confirm-desc-${confirm.id}` : undefined}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4"
      onClick={() => onResolve(false)}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleTabTrap}
      >
        <div className="flex items-start gap-4 p-5 pb-4">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              confirm.danger ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
            }`}
          >
            <Icon size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 id={`confirm-title-${confirm.id}`} className="text-base font-semibold text-slate-800">
              {confirm.title}
            </h3>
            {confirm.message && (
              <p id={`confirm-desc-${confirm.id}`} className="mt-1 text-sm leading-relaxed text-slate-500">
                {confirm.message}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 pb-5 pt-1">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => onResolve(false)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            {confirm.cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={() => onResolve(true)}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
              confirm.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {confirm.confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
