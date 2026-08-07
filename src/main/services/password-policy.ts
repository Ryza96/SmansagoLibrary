import { PASSWORD_POLICY } from '../../shared/config/auth'

// RFC §11.6 (REV-3): minimal 8 karakter, maksimal 128 karakter,
// tanpa syarat kompleksitas (huruf besar/angka/simbol) di v1.
// Policy ditegakkan di Service (AuthService.setup/changePassword), bukan di DB
// dan bukan sekadar validasi renderer (RFC §11.6).

// Mengembalikan pesan error bila password melanggar policy, null bila valid.
export function validatePassword(password: string): string | null {
  if (typeof password !== 'string' || password.length < PASSWORD_POLICY.minLength) {
    return `Password minimal ${PASSWORD_POLICY.minLength} karakter`
  }
  if (password.length > PASSWORD_POLICY.maxLength) {
    return `Password maksimal ${PASSWORD_POLICY.maxLength} karakter`
  }
  return null
}

export function isValidPassword(password: string): boolean {
  return validatePassword(password) === null
}
