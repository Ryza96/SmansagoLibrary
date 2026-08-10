import { BaseRepository } from './base/base.repository'
import type { Admin } from '@prisma/client'

export interface CreateAdminData {
  username: string
  passwordHash: string
  passwordChangedAt: Date
}

export class AdminRepository extends BaseRepository {
  async count(): Promise<number> {
    return this.prisma.admin.count()
  }

  async create(data: CreateAdminData): Promise<Admin> {
    return this.prisma.admin.create({ data })
  }

  async findById(id: string): Promise<Admin | null> {
    return this.prisma.admin.findUnique({ where: { id } })
  }

  // Opsi B (login tanpa username): resolve single-admin. Tabel admin maksimal
  // satu baris (invariant Service, RFC §1.2) sehingga findFirst() aman.
  // orderBy createdAt asc → deterministik: bila melanggar invariant (2+ baris),
  // yang dikembalikan adalah admin pertama dibuat.
  async findSingle(): Promise<Admin | null> {
    return this.prisma.admin.findFirst({ orderBy: { createdAt: 'asc' } })
  }

  // REV-1: lookup case-insensitive. SQLite TIDAK mendukung `mode: 'insensitive'`
  // pada Prisma → normalisasi dilakukan SAAT VERIFIKASI (bukan saat persist).
  // Tabel Admin maksimal satu baris (invariant Service, RFC §1.2) sehingga
  // findMany + filter di JS aman dan murah.
  async findByUsernameCaseInsensitive(username: string): Promise<Admin | null> {
    const target = username.trim().toLowerCase()
    const admins = await this.prisma.admin.findMany()
    return admins.find((a) => a.username.trim().toLowerCase() === target) ?? null
  }

  async updatePassword(id: string, passwordHash: string, passwordChangedAt: Date): Promise<Admin> {
    return this.prisma.admin.update({ where: { id }, data: { passwordHash, passwordChangedAt } })
  }

  async updateLastLogin(id: string): Promise<Admin> {
    return this.prisma.admin.update({ where: { id }, data: { lastLoginAt: new Date() } })
  }
}
