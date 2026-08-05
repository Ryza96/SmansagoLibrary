import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react'
import type { ReactNode } from 'react'
import { NOTIFICATION_DURATION } from '../shared/config/notification'
import ConfirmDialog from './ConfirmDialog'
import { initialNotificationState, notificationReducer } from './notification-reducer'
import ToastViewport from './ToastViewport'
import type { ConfirmDescriptor, ConfirmOptions, Notify, ToastItem, ToastType } from './types'

interface NotificationContextValue {
  notify: Notify
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined)

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(notificationReducer, initialNotificationState)
  const timersRef = useRef(new Map<string, number>())
  const pendingConfirmResolveRef = useRef<((value: boolean) => void) | null>(null)

  useEffect(() => {
    const timers = timersRef.current
    const alive = new Set(state.toasts.map((t) => t.id))
    for (const [id, timer] of timers) {
      if (!alive.has(id)) {
        window.clearTimeout(timer)
        timers.delete(id)
      }
    }
    for (const toast of state.toasts) {
      if (timers.has(toast.id)) continue
      const timer = window.setTimeout(() => {
        dispatch({ type: 'toast/dismiss', id: toast.id })
      }, toast.duration)
      timers.set(toast.id, timer)
    }
  }, [state.toasts])

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer)
      timers.clear()
    }
  }, [])

  const dismiss = useCallback((id: string) => {
    dispatch({ type: 'toast/dismiss', id })
  }, [])

  const dismissAll = useCallback(() => {
    dispatch({ type: 'toast/dismissAll' })
  }, [])

  const show = useCallback((type: ToastType, message: string): string => {
    const id = crypto.randomUUID()
    const toast: ToastItem = { id, type, message, duration: NOTIFICATION_DURATION[type] }
    dispatch({ type: 'toast/add', toast })
    return id
  }, [])

  const notify = useMemo<Notify>(
    () => ({
      success: (message) => show('success', message),
      error: (message) => show('error', message),
      warning: (message) => show('warning', message),
      info: (message) => show('info', message),
      dismiss,
      dismissAll,
    }),
    [show, dismiss, dismissAll]
  )

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      const previous = pendingConfirmResolveRef.current
      pendingConfirmResolveRef.current = resolve
      if (previous) previous(false)
      const descriptor: ConfirmDescriptor = {
        id: crypto.randomUUID(),
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel ?? 'Ya',
        cancelLabel: options.cancelLabel ?? 'Batal',
        danger: options.danger ?? false,
      }
      dispatch({ type: 'confirm/open', confirm: descriptor })
    })
  }, [])

  const resolveConfirm = useCallback((value: boolean) => {
    const resolve = pendingConfirmResolveRef.current
    pendingConfirmResolveRef.current = null
    resolve?.(value)
    dispatch({ type: 'confirm/resolve' })
  }, [])

  const value = useMemo(() => ({ notify, confirm }), [notify, confirm])

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <ToastViewport toasts={state.toasts} onDismiss={dismiss} />
      <ConfirmDialog confirm={state.confirm} onResolve={resolveConfirm} />
    </NotificationContext.Provider>
  )
}

export function useNotification(): NotificationContextValue {
  const context = useContext(NotificationContext)
  if (!context) throw new Error('useNotification must be used within NotificationProvider')
  return context
}
