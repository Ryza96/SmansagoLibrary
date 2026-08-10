// Helper error AUTH untuk renderer (AUTH-5 revisi 1).
// Renderer TIDAK boleh bergantung pada `instanceof Error` — cukup membaca
// kontrak DTO `AuthErrorDTO` (message, code bila tersedia) dari nilai reject
// apa pun. Murni renderer, tanpa akses window/Electron.

import type { AuthErrorDTO } from '../shared/dto/auth'

// Electron membungkus error yang dilempar handler main sebagai
// `Error invoking remote method '<channel>': AppError: <pesan>` (tech debt B-7).
// Helper ini memangkas prefix teknis tersebut agar hanya pesan bersih yang
// sampai ke user (login gagal, change password, logout).
export function cleanAuthErrorMessage(message: string): string {
  const trimmed = message.trim()
  const wrapped = /^Error invoking remote method '[^']+':\s*(.*)$/s.exec(trimmed)
  const afterChannel = wrapped ? wrapped[1] : trimmed
  const marker = 'AppError: '
  const afterMarker = afterChannel.startsWith(marker)
    ? afterChannel.slice(marker.length)
    : afterChannel
  return afterMarker.trim()
}

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
  return cleanAuthErrorMessage(authErrorPayload(err)?.message ?? fallback)
}

export function authErrorCodeOf(err: unknown): string | undefined {
  return authErrorPayload(err)?.code
}
