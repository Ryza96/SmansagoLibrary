import { LABELS } from '../utils/labels'

export interface RecoveryFormErrors {
  code?: string
  password?: string
  confirmPassword?: string
}

export function validateRecoveryForm(
  code: string,
  newPassword: string,
  confirmPassword: string
): RecoveryFormErrors {
  const errors: RecoveryFormErrors = {}
  if (!code.trim()) errors.code = LABELS.AUTH.ERR_RECOVERY_CODE_REQUIRED
  if (newPassword.length < 8) errors.password = LABELS.AUTH.ERR_PASSWORD_MIN
  else if (newPassword.length > 128) errors.password = LABELS.AUTH.ERR_PASSWORD_MAX
  if (newPassword !== confirmPassword) errors.confirmPassword = LABELS.AUTH.ERR_PASSWORD_MISMATCH
  return errors
}
