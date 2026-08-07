import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react'
import { LABELS } from '../../utils/labels'
import { ROUTES } from '../../utils/navigation'
import { validateChangePasswordForm, type ChangePasswordFormErrors } from '../../auth/change-password-validation'
import { authErrorMessageOf } from '../../auth/auth-error'

// AUTH-6 — Ubah Password. Form renderer; seluruh guard keamanan & validasi
// kebijakan password berada di AuthService.changePassword (Main = penegak
// keamanan, RFC §1.4/§11.4). Setelah sukses, session TETAP aktif — tidak ada
// logout/login ulang (RFC §10).
export default function ChangePasswordPage() {
  const navigate = useNavigate()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<ChangePasswordFormErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [changed, setChanged] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return

    const nextErrors = validateChangePasswordForm(currentPassword, newPassword, confirmPassword)
    setErrors(nextErrors)
    if (nextErrors.currentPassword || nextErrors.newPassword || nextErrors.confirmPassword) return

    setSubmitError(null)
    setChanged(false)
    setSubmitting(true)
    try {
      await window.electronAPI.auth.changePassword({ currentPassword, newPassword })
      setChanged(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setErrors({})
    } catch (err: unknown) {
      setSubmitError(authErrorMessageOf(err, LABELS.AUTH.SUBMIT_ERROR_DEFAULT))
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass = (hasError: boolean) =>
    `w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
      hasError ? 'border-red-400' : 'border-slate-300'
    }`

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <button
          type="button"
          onClick={() => navigate(ROUTES.SETTINGS)}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft size={16} />
          {LABELS.AUTH.CHANGE_PASSWORD_BACK}
        </button>
        <h2 className="mt-3 text-2xl font-bold text-slate-800">{LABELS.AUTH.CHANGE_PASSWORD_TITLE}</h2>
        <p className="mt-1 text-sm text-slate-500">{LABELS.AUTH.CHANGE_PASSWORD_SUBTITLE}</p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {LABELS.AUTH.CURRENT_PASSWORD} <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputClass(!!errors.currentPassword)}
              autoComplete="current-password"
              autoFocus
            />
            {errors.currentPassword && (
              <p className="text-red-500 text-xs mt-1">{errors.currentPassword}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {LABELS.AUTH.NEW_PASSWORD} <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass(!!errors.newPassword)}
              autoComplete="new-password"
            />
            {errors.newPassword && <p className="text-red-500 text-xs mt-1">{errors.newPassword}</p>}
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

          {changed && (
            <p className="flex items-center gap-2 text-emerald-600 text-xs bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <CheckCircle2 size={16} className="shrink-0" />
              {LABELS.AUTH.CHANGE_PASSWORD_SUCCESS}
            </p>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
              {submitting ? LABELS.AUTH.CHANGE_PASSWORD_PROCESSING : LABELS.AUTH.CHANGE_PASSWORD_BUTTON}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
