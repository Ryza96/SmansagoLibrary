import { PromotionRepository } from '../repositories/promotion.repository'
import type {
  PromotionOutcome,
  PromotionPreviewCounts,
  PromotionRunDTO,
  PromotionRunListItemDTO,
  PromotionRunSummaryCounts
} from '../../shared/dto/promotion'
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

// WO P-3 — ringkasan history (PromotionRunSummaryCounts). Semua nilai BERASAL
// dari kolom summary (PromotionRun) yang ditulis saat eksekusi (P-2) — TIDAK ada
// perhitungan ulang / decide(). transferred/dropped default 0 (run AUTOMATIC
// tidak pernah memproduksi status tersebut; nilai hanya diisi bila mode lain
// menuliskannya ke summary).
const EMPTY_RUN_COUNTS: PromotionRunSummaryCounts = {
  promoted: 0,
  repeated: 0,
  graduated: 0,
  redistributed: 0,
  transferred: 0,
  dropped: 0,
  noTarget: 0,
  error: 0
}

function parseRunCounts(raw: string | null): PromotionRunSummaryCounts {
  if (!raw) return { ...EMPTY_RUN_COUNTS }
  let parsed: Partial<PromotionRunSummaryCounts> = {}
  try {
    parsed = JSON.parse(raw) as Partial<PromotionRunSummaryCounts>
  } catch {
    parsed = {}
  }
  return {
    promoted: parsed.promoted ?? 0,
    repeated: parsed.repeated ?? 0,
    graduated: parsed.graduated ?? 0,
    redistributed: parsed.redistributed ?? 0,
    transferred: parsed.transferred ?? 0,
    dropped: parsed.dropped ?? 0,
    noTarget: parsed.noTarget ?? 0,
    error: parsed.error ?? 0
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
      fromYearName: run.fromYear.name,
      toYearName: run.toYear.name,
      mode: run.mode as PromotionRunDTO['mode'],
      runBy: run.runBy,
      status: run.status as PromotionRunDTO['status'],
      summary: parseSummary(run.summary),
      counts: parseRunCounts(run.summary),
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
      items: run.items.map((item) => ({
        id: item.id,
        promotionRunId: item.promotionRunId,
        memberId: item.memberId,
        memberName: item.member.fullName,
        sourceClassId: item.sourceClassId,
        sourceClassLabel: item.sourceClassLabel,
        targetClassId: item.targetClassId,
        targetClassLabel: item.targetClassLabel,
        outcome: item.outcome as PromotionOutcome,
        message: item.message
      }))
    }
  }

  // Daftar run terbaru terlebih dahulu (ringkas, dengan jumlah item + counts
  // history). Dipakai halaman Riwayat Promosi (WO P-3).
  async findMany(options?: { page?: number; limit?: number }): Promise<{
    data: PromotionRunListItemDTO[]
    total: number
    page: number
    limit: number
  }> {
    const result = await this.repository.findMany(options)
    return {
      data: result.data.map((run) => ({
        id: run.id,
        fromYearId: run.fromYearId,
        toYearId: run.toYearId,
        fromYearName: run.fromYear.name,
        toYearName: run.toYear.name,
        mode: run.mode as PromotionRunListItemDTO['mode'],
        runBy: run.runBy,
        status: run.status as PromotionRunListItemDTO['status'],
        counts: parseRunCounts(run.summary),
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
