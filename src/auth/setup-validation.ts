// Validasi form Setup Admin (AUTH-4). Murni renderer — TIDAK menyentuh
// AuthService/Prisma/Repository/SessionManager; kontrak auth hanya lewat
// window.electronAPI.auth (RFC_AUTH_ARCHITECTURE.md §1.4).

import { LABELS } from '../utils/labels'

export interface SetupFormErrors {
  username?: string
  password?: string
  confirmPassword?: string
}

export function validateSetupForm(
  username: string,
  password: string,
  confirmPassword: string
): SetupFormErrors {
  const errors: SetupFormErrors = {}

  if (!username.trim()) {
    errors.username = LABELS.AUTH.ERR_USERNAME_REQUIRED
  }

  if (password.length < 8) {
    errors.password = LABELS.AUTH.ERR_PASSWORD_MIN
  } else if (password.length > 128) {
    errors.password = LABELS.AUTH.ERR_PASSWORD_MAX
  }

  if (password !== confirmPassword) {
    errors.confirmPassword = LABELS.AUTH.ERR_PASSWORD_MISMATCH
  }

  return errors
}
