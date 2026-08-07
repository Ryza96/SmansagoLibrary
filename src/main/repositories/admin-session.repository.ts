import { BaseRepository } from './base/base.repository'
import type { AdminSession } from '@prisma/client'

export interface CreateAdminSessionData {
  sessionId: string
  adminId: string
  expiresAt: Date
}

// Row valid untuk dipakai session mirror — join admin (username) untuk restore tanpa query tambahan.
export type ValidAdminSession = AdminSession & { admin: { username: string } }

// RFC_AUTH_SESSION_PERSISTENCE.md (AUTH-7, Opsi A) — session admin di-persist ke SQLite
// agar bertahan setelah restart. Single admin → query "latest valid" cukup (tanpa adminId filter).
export class AdminSessionRepository extends BaseRepository {
  async create(data: CreateAdminSessionData): Promise<AdminSession> {
    return this.prisma.adminSession.create({ data })
  }

  // Baris session valid TERBARU (expiresAt > now, join admin). Dipakai SessionManager.load()
  // saat proses baru: single admin → row terbaru adalah session aktif.
  async findLatestValid(now: Date = new Date()): Promise<ValidAdminSession | null> {
    return this.prisma.adminSession.findFirst({
      where: { expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
      include: { admin: { select: { username: true } } }
    })
  }

  // Verifikasi token spesifik (cadangan) — dipakai smoke untuk membuktikan re-validasi per token.
  async findValidBySessionId(sessionId: string, now: Date = new Date()): Promise<ValidAdminSession | null> {
    return this.prisma.adminSession.findFirst({
      where: { sessionId, expiresAt: { gt: now } },
      include: { admin: { select: { username: true } } }
    })
  }

  // Logout: hapus baris session (RFC — logout menghapus row, bukan set revoked).
  async deleteBySessionId(sessionId: string): Promise<void> {
    await this.prisma.adminSession.deleteMany({ where: { sessionId } })
  }

  // Login/setup: ganti session lama admin yang sama → maksimal satu baris valid per admin.
  async deleteByAdminId(adminId: string): Promise<void> {
    await this.prisma.adminSession.deleteMany({ where: { adminId } })
  }

  // Prune row yang sudah lewat TTL (dipanggil saat login, via SessionManager.open persist).
  async deleteExpired(now: Date = new Date()): Promise<void> {
    await this.prisma.adminSession.deleteMany({ where: { expiresAt: { lte: now } } })
  }

  async count(): Promise<number> {
    return this.prisma.adminSession.count()
  }
}
