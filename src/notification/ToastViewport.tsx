import { createPortal } from 'react-dom'
import type { ToastItem as ToastItemData } from './types'
import ToastItem from './ToastItem'

interface ToastViewportProps {
  toasts: ToastItemData[]
  onDismiss: (id: string) => void
}

export default function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  return createPortal(
    <div
      role="region"
      aria-label="Notifikasi"
      className="pointer-events-none fixed top-14 right-4 z-[90] flex flex-col gap-2"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body
  )
}
