export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastItem {
  id: string
  type: ToastType
  message: string
  duration: number
}

export interface ConfirmDescriptor {
  id: string
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  danger: boolean
}

export interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

export interface Notify {
  success(message: string): string
  error(message: string): string
  warning(message: string): string
  info(message: string): string
  dismiss(id: string): void
  dismissAll(): void
}
