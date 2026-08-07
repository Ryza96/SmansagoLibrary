// Validasi form Ubah Password (AUTH-6). Murni renderer — TIDAK menyentuh
// AuthService/Prisma/Repository/SessionManager; kontrak auth hanya lewat
// window.electronAPI.auth (RFC_AUTH_ARCHITECTURE.md §1.4).
// Kebijakan password (min 8 / maks 128) dibaca dari PASSWORD_POLICY
// (src/shared/config/auth.ts) — sumber yang sama dengan validator Main
// (password-policy.ts) sehingga renderer dan Main tidak pernah bergeser.

import { PASSWORD_POLICY } from '../shared/config/auth'
import { LABELS } from '../utils/labels'

export interface ChangePasswordFormErrors {
  currentPassword?: string
  newPassword?: string
  confirmPassword?: string
}

export function validateChangePasswordForm(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
): ChangePasswordFormErrors {
  const errors: ChangePasswordFormErrors = {}

  if (!currentPassword) {
    errors.currentPassword = LABELS.AUTH.ERR_CURRENT_PASSWORD_REQUIRED
  }

  if (newPassword.length < PASSWORD_POLICY.minLength) {
    errors.newPassword = LABELS.AUTH.ERR_PASSWORD_MIN
  } else if (newPassword.length > PASSWORD_POLICY.maxLength) {
    errors.newPassword = LABELS.AUTH.ERR_PASSWORD_MAX
  }

  if (newPassword !== confirmPassword) {
    errors.confirmPassword = LABELS.AUTH.ERR_PASSWORD_MISMATCH
  }

  return errors
}
