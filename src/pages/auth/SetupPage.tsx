import { useEffect, useState } from 'react'
import { LABELS } from '../../utils/labels'
import { validateSetupForm, type SetupFormErrors } from '../../auth/setup-validation'
import { useAuthGate } from '../../auth/AuthGate'
import RecoveryCodeDisplay from './RecoveryCodeDisplay'

export default function SetupPage() {
  const { refreshStatus } = useAuthGate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<SetupFormErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null)

  useEffect(() => {
    // Anti-macet: flag pending bertahan setelah reload, tapi kode tidak disimpan.
    // Bila flag ada namun state kosong (mis. Ctrl+R di layar kode), bersihkan lalu
    // refresh agar AuthGate keluar ke aplikasi (admin sudah ada; kode baru bisa dibuat di Pengaturan).
    if (sessionStorage.getItem('recoveryCodePending') === '1' && !recoveryCode) {
      sessionStorage.removeItem('recoveryCodePending')
      refreshStatus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const nextErrors = validateSetupForm(username, password, confirmPassword)
    setErrors(nextErrors)
    if (nextErrors.username || nextErrors.password || nextErrors.confirmPassword) return

    setSubmitError(null)
    setSubmitting(true)
    try {
      const result = await window.electronAPI.auth.setup({ username: username.trim(), password })
      if (result?.recoveryCode) {
        sessionStorage.setItem('recoveryCodePending', '1')
        setRecoveryCode(result.recoveryCode)
        return
      }
      await refreshStatus()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : LABELS.AUTH.SUBMIT_ERROR_DEFAULT
      setSubmitError(message)
      setSubmitting(false)
    }
  }

  const inputClass = (hasError: boolean) =>
    `w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
      hasError ? 'border-red-400' : 'border-slate-300'
    }`

  if (recoveryCode) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-slate-200 p-8">
          <RecoveryCodeDisplay
            recoveryCode={recoveryCode}
            onContinue={async () => {
              sessionStorage.removeItem('recoveryCodePending')
              await refreshStatus()
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-slate-200 p-8">
        <h1 className="text-2xl font-bold text-slate-800">{LABELS.AUTH.SETUP_TITLE}</h1>
        <p className="text-sm text-slate-500 mt-1">{LABELS.AUTH.SETUP_SUBTITLE}</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {LABELS.AUTH.USERNAME} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputClass(!!errors.username)}
              autoComplete="username"
              autoFocus
            />
            {errors.username && <p className="text-red-500 text-xs mt-1">{errors.username}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {LABELS.AUTH.PASSWORD} <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass(!!errors.password)}
              autoComplete="new-password"
            />
            {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {LABELS.AUTH.CONFIRM_PASSWORD} <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass(!!errors.confirmPassword)}
              autoComplete="new-password"
            />
            {errors.confirmPassword && (
              <p className="text-red-500 text-xs mt-1">{errors.confirmPassword}</p>
            )}
          </div>

          {submitError && (
            <p className="text-red-500 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {submitError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {submitting ? LABELS.AUTH.SETUP_PROCESSING : LABELS.AUTH.SETUP_BUTTON}
          </button>
        </form>
      </div>
    </div>
  )
}
