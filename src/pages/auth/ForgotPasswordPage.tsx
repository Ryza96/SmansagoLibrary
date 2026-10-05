import { useState } from 'react'
import { LABELS } from '../../utils/labels'
import { useNotification } from '../../notification/NotificationContext'
import { authErrorMessageOf } from '../../auth/auth-error'
import { validateRecoveryForm, type RecoveryFormErrors } from '../../auth/recovery-validation'
import RecoveryCodeDisplay from './RecoveryCodeDisplay'

interface Props {
  onBack: () => void
}

export default function ForgotPasswordPage({ onBack }: Props) {
  const { notify } = useNotification()
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<RecoveryFormErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [newCode, setNewCode] = useState<string | null>(null)

  if (newCode) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-slate-200 p-8">
          <RecoveryCodeDisplay
            recoveryCode={newCode}
            onContinue={() => {
              notify.success(LABELS.AUTH.PASSWORD_CHANGED_LOGIN)
              onBack()
            }}
          />
        </div>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    const next = validateRecoveryForm(code, newPassword, confirmPassword)
    setErrors(next)
    if (next.code || next.password || next.confirmPassword) return
    setSubmitError(null)
    setSubmitting(true)
    try {
      const result = await window.electronAPI.auth.resetWithRecoveryCode({ code, newPassword })
      setNewCode(result.recoveryCode)
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
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-slate-200 p-8">
        <h1 className="text-2xl font-bold text-slate-800">{LABELS.AUTH.FORGOT_TITLE}</h1>
        <p className="text-sm text-slate-500 mt-1">{LABELS.AUTH.FORGOT_SUBTITLE}</p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{LABELS.AUTH.RECOVERY_CODE_LABEL}</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} className={inputClass(!!errors.code)} autoFocus />
            {errors.code && <p className="text-red-500 text-xs mt-1">{errors.code}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{LABELS.AUTH.NEW_PASSWORD}</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputClass(!!errors.password)} autoComplete="new-password" />
            {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{LABELS.AUTH.CONFIRM_PASSWORD}</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputClass(!!errors.confirmPassword)} autoComplete="new-password" />
            {errors.confirmPassword && <p className="text-red-500 text-xs mt-1">{errors.confirmPassword}</p>}
          </div>
          {submitError && <p className="text-red-500 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">{submitError}</p>}
          <button type="submit" disabled={submitting} className="w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {submitting ? LABELS.AUTH.FORGOT_PROCESSING : LABELS.AUTH.FORGOT_BUTTON}
          </button>
          <button type="button" onClick={onBack} className="w-full text-sm text-slate-500 underline">
            {LABELS.AUTH.FORGOT_BACK}
          </button>
        </form>
      </div>
    </div>
  )
}
