import { randomBytes } from 'crypto'
import { SESSION_CONFIG } from '../../shared/config/session'
import { AdminSessionRepository } from '../repositories/admin-session.repository'

// RFC_AUTH_SESSION_PERSISTENCE.md (AUTH-7, Opsi A) — session di-persist ke tabel AdminSession
// (TTL 24 jam absolute). Mirror in-memory tetap sumber kebenaran selama proses hidup
// (speed & kontrak lama); load() memulihkan dari DB saat proses baru (restart).
export interface Session {
  sessionId: string
  adminId: string
  username: string
  createdAt: Date
  expiresAt: Date
}

export interface SessionAdmin {
  adminId: string
  username: string
}

export class SessionManager {
  private session: Session | null = null

  constructor(private repo: AdminSessionRepository) {}

  // open(): buat token baru + persist ke DB (kecuali persist=false utk uji in-memory murni).
  // Single admin → maksimal satu session aktif (RFC §3.1); login saat session ada = replace,
  // baris DB lama admin yang sama diganti (deleteByAdminId). Row expire di-prune di sini.
  async open(admin: { id: string; username: string }, persist = true): Promise<Session> {
    const now = new Date()
    const sessionId = randomBytes(SESSION_CONFIG.tokenBytes).toString('base64url')
    const next: Session = {
      sessionId,
      adminId: admin.id,
      username: admin.username,
      createdAt: now,
      expiresAt: new Date(now.getTime() + SESSION_CONFIG.ttlHours * 60 * 60 * 1000)
    }
    if (persist) {
      await this.repo.deleteExpired()
      await this.repo.deleteByAdminId(admin.id)
      await this.repo.create({ sessionId, adminId: admin.id, expiresAt: next.expiresAt })
    }
    this.session = next
    return next
  }

  // load(): pulihkan session dari DB setelah proses di-restart (lazy — dipanggil
  // AuthService.status/changePassword). Row sudah expire / tidak ada → null (TTL absolute).
  async load(): Promise<Session | null> {
    if (this.session) return this.session
    const row = await this.repo.findLatestValid()
    if (!row) return null
    this.session = {
      sessionId: row.sessionId,
      adminId: row.adminId,
      username: row.admin.username,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt
    }
    return this.session
  }

  get(): Session | null {
    return this.session
  }

  // Proyeksi session untuk Service (AuthService.changePassword) — adminId dipakai
  // memuat admin beserta passwordHash dari repository.
  currentAdmin(): SessionAdmin | null {
    if (!this.session) return null
    return { adminId: this.session.adminId, username: this.session.username }
  }

  // close(): logout — mirror dikosongkan DULU (efek langsung, isAuthenticated langsung false),
  // lalu baris DB dihapus. Error hapus DB diteruskan (kegagalan terlihat, bukan diam-diam).
  async close(): Promise<void> {
    const current = this.session
    this.session = null
    if (current) {
      await this.repo.deleteBySessionId(current.sessionId)
    }
  }

  isAuthenticated(): boolean {
    return this.session !== null
  }
}
