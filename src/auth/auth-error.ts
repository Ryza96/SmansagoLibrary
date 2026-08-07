// Helper error AUTH untuk renderer (AUTH-5 revisi 1).
// Renderer TIDAK boleh bergantung pada `instanceof Error` — cukup membaca
// kontrak DTO `AuthErrorDTO` (message, code bila tersedia) dari nilai reject
// apa pun. Murni renderer, tanpa akses window/Electron.

import type { AuthErrorDTO } from '../shared/dto/auth'

export function authErrorPayload(err: unknown): AuthErrorDTO | null {
  if (typeof err === 'object' && err !== null) {
    const candidate = err as Record<string, unknown>
    if (typeof candidate.message === 'string' && candidate.message.trim() !== '') {
      return {
        message: candidate.message,
        code: typeof candidate.code === 'string' ? candidate.code : undefined
      }
    }
  }
  return null
}

export function authErrorMessageOf(err: unknown, fallback: string): string {
  return authErrorPayload(err)?.message ?? fallback
}

export function authErrorCodeOf(err: unknown): string | undefined {
  return authErrorPayload(err)?.code
}
