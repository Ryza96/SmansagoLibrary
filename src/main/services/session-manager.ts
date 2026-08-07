import { randomUUID } from 'crypto'

// RFC §3.1 — Session adalah objek runtime di Main Process, BUKAN entitas DB.
// Tidak dipersist, tanpa Remember Me, tanpa expiry/idle-timeout di v1 (K4).
export interface Session {
  sessionId: string
  adminId: string
  username: string
  createdAt: Date
}

export interface SessionAdmin {
  adminId: string
  username: string
}

export class SessionManager {
  private session: Session | null = null

  // Single admin → maksimal satu session aktif per proses; login baru saat
  // sudah ada session = session lama ditutup (RFC §3.1, replace).
  open(admin: { id: string; username: string }): Session {
    const next: Session = {
      sessionId: randomUUID(),
      adminId: admin.id,
      username: admin.username,
      createdAt: new Date()
    }
    this.session = next
    return next
  }

  get(): Session | null {
    return this.session
  }

  // Proyeksi session untuk Service (AuthService.changePassword) — adminId
  // dipakai memuat admin beserta passwordHash dari repository.
  currentAdmin(): SessionAdmin | null {
    if (!this.session) return null
    return { adminId: this.session.adminId, username: this.session.username }
  }

  close(): void {
    this.session = null
  }

  isAuthenticated(): boolean {
    return this.session !== null
  }
}
