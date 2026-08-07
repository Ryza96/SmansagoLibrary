import { useState } from 'react'
import { User, Settings, LogOut, Minus, Square, X } from 'lucide-react'
import { LABELS } from '../../utils/labels'
import { useAuthGate } from '../../auth/AuthGate'
import { useNotification } from '../../notification/NotificationContext'
import { authErrorMessageOf } from '../../auth/auth-error'

function minimize() {
  window.electronAPI.window.minimize()
}

function maximize() {
  window.electronAPI.window.maximize()
}

function close() {
  window.electronAPI.window.close()
}

export default function TopBar() {
  const { refreshStatus } = useAuthGate()
  const { notify } = useNotification()
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      await window.electronAPI.auth.logout()
      await refreshStatus()
    } catch (err: unknown) {
      notify.error(authErrorMessageOf(err, LABELS.AUTH.LOGOUT_FAILED))
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <header className="flex items-center justify-between h-12 px-4 bg-slate-900 text-white select-none draggable">
      <div className="flex items-center gap-2">
        <span className="font-bold text-lg tracking-wide">APLibrary</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-sm text-slate-300">
          <User size={16} />
          <span>Admin</span>
        </div>

        <button className="p-1.5 rounded hover:bg-slate-700 transition-colors" title="Settings">
          <Settings size={16} />
        </button>

        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="p-1.5 rounded hover:bg-slate-700 transition-colors disabled:opacity-50"
          title={LABELS.AUTH.LOGOUT}
        >
          <LogOut size={16} />
        </button>

        <div className="flex items-center ml-2">
          <button
            onClick={minimize}
            className="p-2 hover:bg-slate-700 transition-colors"
            title="Minimize"
          >
            <Minus size={16} />
          </button>
          <button
            onClick={maximize}
            className="p-2 hover:bg-slate-700 transition-colors"
            title="Maximize"
          >
            <Square size={14} />
          </button>
          <button
            onClick={close}
            className="p-2 hover:bg-red-600 transition-colors"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </header>
  )
}
