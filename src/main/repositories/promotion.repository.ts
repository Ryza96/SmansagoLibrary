import { BaseRepository } from './base/base.repository'
import type { Prisma } from '@prisma/client'

// WO P-2 — data yang dibutuhkan untuk menulis satu PromotionRun (+ items) DI
// DALAM transaksi eksekusi. Seluruh nilai ditentukan oleh service (status,
// summary, mode) — repository hanya menulis, tidak memutuskan.
export type PromotionRunWrite = {
  fromYearId: string
  toYearId: string
  mode: string
  runBy: string | null
  status: string
  summary: string | null
  startedAt: Date
  finishedAt: Date
}

export type PromotionRunItemWrite = {
  memberId: string
  sourceClassId: string
  targetClassId: string | null
  outcome: string
  message: string | null
}

const promotionRunInclude = { items: true } as const

// Audit promosi (RFC §2.2, §9): satu run + baris item per member.
// P-2 hanya membaca/menulis — tidak ada logika keputusan di sini (decide() ada
// di service P-1). Transaksi eksekusi dimiliki service; repository menerima tx.
export class PromotionRepository extends BaseRepository {
  // Tulis run + seluruh items dalam SATU transaksi (tx dari service).
  // Mengembalikan id run yang dibuat.
  async createRunWithTx(tx: Prisma.TransactionClient, run: PromotionRunWrite, items: PromotionRunItemWrite[]): Promise<string> {
    const created = await tx.promotionRun.create({ data: run })
    if (items.length > 0) {
      await tx.promotionRunItem.createMany({
        data: items.map((item) => ({ ...item, promotionRunId: created.id }))
      })
    }
    return created.id
  }

  // Audit penuh sebuah run — run + seluruh items (RFC §9).
  async findById(id: string) {
    return this.prisma.promotionRun.findUnique({ where: { id }, include: promotionRunInclude })
  }

  // Daftar run terbaru terlebih dahulu (ringkas, tanpa items).
  async findMany(options?: { page?: number; limit?: number }) {
    const page = options?.page ?? 1
    const take = Math.min(options?.limit ?? 20, 100)
    const skip = (page - 1) * take
    const [data, total] = await Promise.all([
      this.prisma.promotionRun.findMany({
        skip,
        take,
        orderBy: { startedAt: 'desc' },
        include: { _count: { select: { items: true } } }
      }),
      this.prisma.promotionRun.count()
    ])
    return { data, total, page, limit: take }
  }
}
