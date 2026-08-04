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

  // Audit penuh sebuah run — run + tahun sumber/target + seluruh items (RFC §9).
  // WO P-3 (history): setiap item dilengkapi nama member (relation member) dan
  // label kelas sumber/target. PromotionRunItem TIDAK punya relation ke Class,
  // sehingga label kelas diambil via batch lookup classByIds (dilarang query
  // per baris) lalu dipetakan. Label = "LEVEL PARALLEL" — data display murni,
  // bukan hitung ulang keputusan.
  async findById(id: string) {
    const run = await this.prisma.promotionRun.findUnique({
      where: { id },
      include: {
        fromYear: true,
        toYear: true,
        items: { include: { member: { select: { fullName: true } } } }
      }
    })
    if (!run) return null

    const classIds = Array.from(
      new Set(
        run.items.flatMap((item) =>
          item.targetClassId ? [item.sourceClassId, item.targetClassId] : [item.sourceClassId]
        )
      )
    )
    const classes =
      classIds.length > 0
        ? await this.prisma.class.findMany({
            where: { id: { in: classIds } },
            select: { id: true, educationLevel: true, parallel: true }
          })
        : []
    const classLabelById = new Map(classes.map((c) => [c.id, `${c.educationLevel} ${c.parallel}`]))

    return {
      ...run,
      items: run.items.map((item) => ({
        ...item,
        sourceClassLabel: classLabelById.get(item.sourceClassId) ?? null,
        targetClassLabel: item.targetClassId ? (classLabelById.get(item.targetClassId) ?? null) : null
      }))
    }
  }

  // Daftar run terbaru terlebih dahulu (ringkas, tanpa items), dengan nama
  // tahun sumber/target untuk tampilan history (WO P-3).
  async findMany(options?: { page?: number; limit?: number }) {
    const page = options?.page ?? 1
    const take = Math.min(options?.limit ?? 20, 100)
    const skip = (page - 1) * take
    const [data, total] = await Promise.all([
      this.prisma.promotionRun.findMany({
        skip,
        take,
        orderBy: { startedAt: 'desc' },
        include: { fromYear: true, toYear: true, _count: { select: { items: true } } }
      }),
      this.prisma.promotionRun.count()
    ])
    return { data, total, page, limit: take }
  }
}
