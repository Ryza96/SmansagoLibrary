import { PromotionRepository } from '../repositories/promotion.repository'
import type { PromotionOutcome, PromotionPreviewCounts, PromotionRunDTO } from '../../shared/dto/promotion'
import { AppError } from '../../../electron/main/errorHandler'

// WO P-2 — audit run promosi (RFC §2.2, §9). READ-ONLY: membaca hasil eksekusi
// (run + items + summary) tanpa menulis apa pun. Memetakan baris DB ke
// PromotionRunDTO (summary adalah JSON counts).
function parseSummary(raw: string | null): PromotionPreviewCounts | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as PromotionPreviewCounts
  } catch {
    return null
  }
}

export class PromotionRunService {
  constructor(private repository: PromotionRepository) {}

  // Audit penuh sebuah run — run + items (RFC §9). 404 bila tidak ada.
  async findById(id: string): Promise<PromotionRunDTO> {
    const run = await this.repository.findById(id)
    if (!run) {
      throw new AppError(404, 'Not Found', `Run promosi ${id} tidak ditemukan`)
    }
    return {
      id: run.id,
      fromYearId: run.fromYearId,
      toYearId: run.toYearId,
      mode: run.mode as PromotionRunDTO['mode'],
      runBy: run.runBy,
      status: run.status as PromotionRunDTO['status'],
      summary: parseSummary(run.summary),
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
      items: run.items.map((item) => ({
        id: item.id,
        promotionRunId: item.promotionRunId,
        memberId: item.memberId,
        sourceClassId: item.sourceClassId,
        targetClassId: item.targetClassId,
        outcome: item.outcome as PromotionOutcome,
        message: item.message
      }))
    }
  }

  // Daftar run terbaru terlebih dahulu (ringkas, dengan jumlah item).
  async findMany(options?: { page?: number; limit?: number }) {
    const result = await this.repository.findMany(options)
    return {
      data: result.data.map((run) => ({
        id: run.id,
        fromYearId: run.fromYearId,
        toYearId: run.toYearId,
        mode: run.mode,
        runBy: run.runBy,
        status: run.status,
        summary: parseSummary(run.summary),
        startedAt: run.startedAt.toISOString(),
        finishedAt: run.finishedAt?.toISOString() ?? null,
        itemCount: run._count.items
      })),
      total: result.total,
      page: result.page,
      limit: result.limit
    }
  }
}
