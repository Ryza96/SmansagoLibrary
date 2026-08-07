// Validasi form Login (AUTH-5). Murni renderer — TIDAK menyentuh
// AuthService/Prisma/Repository/SessionManager; kontrak auth hanya lewat
// window.electronAPI.auth (RFC_AUTH_ARCHITECTURE.md §1.4).

import { LABELS } from '../utils/labels'

export interface LoginFormErrors {
  username?: string
  password?: string
}

export function validateLoginForm(username: string, password: string): LoginFormErrors {
  const errors: LoginFormErrors = {}

  if (!username.trim()) {
    errors.username = LABELS.AUTH.ERR_USERNAME_REQUIRED
  }

  if (!password) {
    errors.password = LABELS.AUTH.ERR_PASSWORD_REQUIRED
  }

  return errors
}
