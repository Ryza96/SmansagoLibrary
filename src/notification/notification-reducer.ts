import { NOTIFICATION_MAX_TOASTS } from '../shared/config/notification'
import type { ConfirmDescriptor, ToastItem } from './types'

export interface NotificationState {
  toasts: ToastItem[]
  confirm: ConfirmDescriptor | null
}

export type NotificationAction =
  | { type: 'toast/add'; toast: ToastItem }
  | { type: 'toast/dismiss'; id: string }
  | { type: 'toast/dismissAll' }
  | { type: 'confirm/open'; confirm: ConfirmDescriptor }
  | { type: 'confirm/resolve' }

export const initialNotificationState: NotificationState = {
  toasts: [],
  confirm: null,
}

export function notificationReducer(
  state: NotificationState,
  action: NotificationAction
): NotificationState {
  switch (action.type) {
    case 'toast/add': {
      const toasts = [...state.toasts, action.toast]
      return {
        ...state,
        toasts:
          toasts.length > NOTIFICATION_MAX_TOASTS
            ? toasts.slice(toasts.length - NOTIFICATION_MAX_TOASTS)
            : toasts,
      }
    }
    case 'toast/dismiss':
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) }
    case 'toast/dismissAll':
      return { ...state, toasts: [] }
    case 'confirm/open':
      return { ...state, confirm: action.confirm }
    case 'confirm/resolve':
      return { ...state, confirm: null }
    default:
      return state
  }
}
