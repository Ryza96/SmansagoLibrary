import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { LABELS } from '../../utils/labels'
import { useAuthGate } from '../../auth/AuthGate'
import { validateLoginForm, type LoginFormErrors } from '../../auth/login-validation'
import { authErrorMessageOf } from '../../auth/auth-error'

export default function LoginPage() {
  const { refreshStatus } = useAuthGate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<LoginFormErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return

    const nextErrors = validateLoginForm(username, password)
    setErrors(nextErrors)
    if (nextErrors.username || nextErrors.password) return

    setSubmitError(null)
    setSubmitting(true)
    try {
      await window.electronAPI.auth.login({ username: username.trim(), password })
      await refreshStatus()
    } catch (err: unknown) {
      setSubmitError(authErrorMessageOf(err, LABELS.AUTH.SUBMIT_ERROR_DEFAULT))
      setSubmitting(false)
    }
  }

  const inputClass = (hasError: boolean) =>
    `w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
      hasError ? 'border-red-400' : 'border-slate-300'
    }`

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-slate-200 p-8">
        <h1 className="text-2xl font-bold text-slate-800">{LABELS.AUTH.APP_NAME}</h1>
        <h2 className="text-lg font-semibold text-slate-700 mt-1">{LABELS.AUTH.LOGIN_TITLE}</h2>

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
              autoComplete="current-password"
            />
            {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
          </div>

          {submitError && (
            <p className="text-red-500 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {submitError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            {submitting ? LABELS.AUTH.LOGIN_PROCESSING : LABELS.AUTH.LOGIN_BUTTON}
          </button>
        </form>
      </div>
    </div>
  )
}
