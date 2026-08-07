// DTO kontrak autentikasi AUTH v1 (RFC_AUTH_ARCHITECTURE.md §4.3).
// TIDAK ada passwordHash / sessionId di DTO mana pun — secret tidak pernah
// keluar dari Main Process (RFC §1.4, §11.3).

export interface AuthStatusDTO {
  needsSetup: boolean
  authenticated: boolean
  username?: string
}

export interface SetupAdminDTO {
  username: string
  password: string
}

export interface LoginAdminDTO {
  username: string
  password: string
}

export interface ChangePasswordDTO {
  currentPassword: string
  newPassword: string
}

export interface AuthResultDTO {
  authenticated: true
  username: string
}

export interface AuthOkDTO {
  ok: true
}
