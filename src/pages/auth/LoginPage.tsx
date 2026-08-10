import { useState } from 'react'
import { BookOpen, Loader2, Lock, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { LABELS } from '../../utils/labels'
import { useAuthGate } from '../../auth/AuthGate'
import { validateLoginForm, type LoginFormErrors } from '../../auth/login-validation'
import { authErrorMessageOf } from '../../auth/auth-error'

export default function LoginPage() {
  const { refreshStatus } = useAuthGate()
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<LoginFormErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return

    const nextErrors = validateLoginForm(password)
    setErrors(nextErrors)
    if (nextErrors.password) return

    setSubmitError(null)
    setSubmitting(true)
    try {
      await window.electronAPI.auth.login({ password })
      await refreshStatus()
    } catch (err: unknown) {
      setSubmitError(authErrorMessageOf(err, LABELS.AUTH.SUBMIT_ERROR_DEFAULT))
      setSubmitting(false)
    }
  }

  const inputClass = (hasError: boolean) =>
    `w-full rounded-lg border bg-white py-2.5 pl-9 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
      hasError ? 'border-red-400' : 'border-slate-300'
    }`

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-200 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-slate-200 p-8 sm:p-10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white">
          <BookOpen size={28} />
        </div>

        <h1 className="mt-4 text-center text-2xl font-bold text-slate-800">
          {LABELS.AUTH.APP_NAME}
        </h1>
        <p className="mt-1 text-center text-sm text-slate-500">{LABELS.AUTH.APP_SUBTITLE}</p>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200" />
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <Lock size={13} />
          </div>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <h2 className="text-center text-lg font-semibold text-slate-800">
          {LABELS.AUTH.LOGIN_TITLE}
        </h2>
        <p className="mt-1 text-center text-sm text-slate-500">{LABELS.AUTH.LOGIN_SUBTITLE}</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
          <div>
            <label className="block text-sm font-bold text-blue-600 mb-1">
              {LABELS.AUTH.PASSWORD} <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Lock
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass(!!errors.password)}
                autoComplete="current-password"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
                aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                title={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
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
            {submitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Lock size={15} />
            )}
            {submitting ? LABELS.AUTH.LOGIN_PROCESSING : LABELS.AUTH.LOGIN_BUTTON}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-center gap-1.5 border-t border-slate-100 pt-4 text-xs text-slate-400">
          <ShieldCheck size={14} />
          <span>{LABELS.AUTH.FOOTER_AUTHORIZED}</span>
        </div>
      </div>
    </div>
  )
}
