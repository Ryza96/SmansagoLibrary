import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Settings, LogOut } from 'lucide-react'
import { LABELS } from '../../utils/labels'
import { ROUTES } from '../../utils/navigation'
import { useAuthGate } from '../../auth/AuthGate'
import { useNotification } from '../../notification/NotificationContext'
import { authErrorMessageOf } from '../../auth/auth-error'
import FileMenuDropdown from './FileMenuDropdown'

export default function TopBar() {
  const navigate = useNavigate()
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
        <FileMenuDropdown />
        <span className="font-bold text-lg tracking-wide">APLibrary</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-sm text-slate-300">
          <User size={16} />
          <span>Admin</span>
        </div>

        <button
          onClick={() => navigate(ROUTES.SETTINGS)}
          className="p-1.5 rounded hover:bg-slate-700 transition-colors"
          title={LABELS.SETTINGS.TITLE}
        >
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
      </div>
    </header>
  )
}
