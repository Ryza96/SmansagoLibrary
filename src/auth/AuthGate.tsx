import { createContext, useContext, useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import type { AuthStatusDTO } from '../shared/dto/auth'
import { LABELS } from '../utils/labels'

export interface AuthGateValue {
  refreshStatus: () => Promise<void>
}

const AuthGateContext = createContext<AuthGateValue | null>(null)

export function useAuthGate(): AuthGateValue {
  const ctx = useContext(AuthGateContext)
  if (!ctx) {
    throw new Error('useAuthGate must be used within AuthGate')
  }
  return ctx
}

function FullScreenMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-6">
      {children}
    </div>
  )
}

export default function AuthGate() {
  const navigate = useNavigate()
  const location = useLocation()
  const [status, setStatus] = useState<AuthStatusDTO | null>(null)
  const [loadError, setLoadError] = useState(false)

  async function refreshStatus() {
    setLoadError(false)
    try {
      const next = await window.electronAPI.auth.status()
      setStatus(next)
    } catch {
      setLoadError(true)
    }
  }

  useEffect(() => {
    refreshStatus()
  }, [])

  useEffect(() => {
    if (!status) return
    if (status.needsSetup) {
      if (location.pathname !== '/setup') navigate('/setup', { replace: true })
    } else if (!status.authenticated) {
      if (location.pathname !== '/login') navigate('/login', { replace: true })
    } else if (location.pathname === '/setup' || location.pathname === '/login') {
      navigate('/', { replace: true })
    }
  }, [status, location.pathname, navigate])

  if (loadError) {
    return (
      <FullScreenMessage>
        <p className="text-sm text-slate-600 mb-4">{LABELS.AUTH.LOAD_ERROR}</p>
        <button
          onClick={refreshStatus}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          {LABELS.AUTH.RETRY}
        </button>
      </FullScreenMessage>
    )
  }

  if (!status) {
    return (
      <FullScreenMessage>
        <p className="text-sm text-slate-400">{LABELS.AUTH.LOADING}</p>
      </FullScreenMessage>
    )
  }

  const redirecting =
    (status.needsSetup && location.pathname !== '/setup') ||
    (!status.needsSetup && !status.authenticated && location.pathname !== '/login') ||
    (status.authenticated &&
      (location.pathname === '/setup' || location.pathname === '/login'))

  if (redirecting) {
    return (
      <FullScreenMessage>
        <p className="text-sm text-slate-400">{LABELS.AUTH.LOADING}</p>
      </FullScreenMessage>
    )
  }

  return (
    <AuthGateContext.Provider value={{ refreshStatus }}>
      <Outlet />
    </AuthGateContext.Provider>
  )
}
