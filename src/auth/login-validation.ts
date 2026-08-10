// Validasi form Login (AUTH-5). Murni renderer — TIDAK menyentuh
// AuthService/Prisma/Repository/SessionManager; kontrak auth hanya lewat
// window.electronAPI.auth (RFC_AUTH_ARCHITECTURE.md §1.4).
//
// Opsi B (login tanpa username): hanya password yang divalidasi — username
// dihapus dari form karena single-admin (RFC §1.2).

import { LABELS } from '../utils/labels'

export interface LoginFormErrors {
  password?: string
}

export function validateLoginForm(password: string): LoginFormErrors {
  const errors: LoginFormErrors = {}

  if (!password) {
    errors.password = LABELS.AUTH.ERR_PASSWORD_REQUIRED
  }

  return errors
}
