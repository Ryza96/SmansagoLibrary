import { AcademicYearRepository } from '../repositories/academic-year.repository'
import { ClassRepository } from '../repositories/class.repository'
import { EnrollmentRepository } from '../repositories/enrollment.repository'
import { PromotionRepository, type PromotionRunItemWrite } from '../repositories/promotion.repository'
import { PromotionRunService } from './promotion-run.service'
import { decide } from './promotion-preview.service'
import { ACADEMIC_STATUS } from '../../shared/config/academic-status'
import { getPrisma } from '../repositories/base/prisma'
import { runTransaction } from '../repositories/base/transaction'
import { AppError } from '../../../electron/main/errorHandler'
import type {
  AutomaticPromotionExecuteInput,
  PromotionOutcome,
  PromotionPreviewCounts,
  PromotionRunDTO,
  PromotionTargetClassInput
} from '../../shared/dto/promotion'

// Pemetaan outcome keputusan (huruf besar) ke key counts preview (RFC §8).
const OUTCOME_COUNT_KEY: Record<PromotionOutcome, keyof PromotionPreviewCounts> = {
  PROMOTED: 'promoted',
  REPEATED: 'repeated',
  GRADUATED: 'graduated',
  REDISTRIBUTED: 'redistributed',
  NO_TARGET: 'noTarget',
  ERROR: 'error'
}

// ===========================================================================
// WO P-2 — PROMOTION EXECUTE (RFC §7A, §9).
//
// SATU transaksi all-or-nothing per run:
//   1) re-validasi state TERBARU di dalam $transaction (RFC §7.1/§8) — hanya
//      enrollment ACTIVE sumber yang diproses;
//   2) keputusan dihitung oleh decide() P-1 (SATU-SATUNYA decision engine —
//      tidak ada logika keputusan kedua di manapun);
//   3) tulis: tutup enrollment sumber (terminal + leftAt) → buka enrollment ACTIVE
//      baru di kelas target (PROMOTED/REPEATED); tutup saja untuk GRADUATED;
//      NO_TARGET/ERROR tanpa mutasi (enrollment tetap ACTIVE — RFC §9 state-based
//      eligibility). Member.status TIDAK disentuh (MEMBER_STATUS_ALIGNMENT Fase 1 —
//      status membership terpisah dari status akademik);
//   4) simpan PromotionRun + seluruh PromotionRunItem (audit, RFC §2.2/§9).
// Exception apa pun di dalam transaksi = rollback penuh (tidak ada paruh tulis).
//
// Service TIDAK mengakses Prisma langsung — seluruh baca/tulis lewat repository
// (arsitektur project, keputusan Review PO P-1); transaksi dibungkus runTransaction.
// ===========================================================================
export class PromotionExecuteService {
  constructor(
    private academicYearRepository: AcademicYearRepository,
    private classRepository: ClassRepository,
    private enrollmentRepository: EnrollmentRepository,
    private promotionRepository: PromotionRepository,
    private runService: PromotionRunService
  ) {}

  async executeAutomatic(input: AutomaticPromotionExecuteInput): Promise<PromotionRunDTO> {
    if (input.mode !== 'AUTOMATIC') {
      throw new AppError(400, 'Conflict', `Mode ${input.mode} belum didukung — WO P-2 hanya AUTOMATIC (MAPPING/BULK_EDIT = P-3/P-5)`)
    }

    const fromYear = await this.academicYearRepository.findById(input.fromYearId)
    if (!fromYear) {
      throw new AppError(404, 'Not Found', `Tahun ajaran sumber ${input.fromYearId} tidak ditemukan`)
    }
    const toYear = await this.academicYearRepository.findById(input.toYearId)
    if (!toYear) {
      throw new AppError(404, 'Not Found', `Tahun ajaran target ${input.toYearId} tidak ditemukan`)
    }
    if (fromYear.id === toYear.id) {
      throw new AppError(400, 'Conflict', 'Tahun ajaran sumber dan target tidak boleh sama')
    }

    // Kelas sumber: satu kelas (opsional) atau semua kelas tahun sumber.
    let sourceClasses = await this.classRepository.findByAcademicYear(input.fromYearId)
    if (input.fromClassId) {
      const only = await this.classRepository.findById(input.fromClassId)
      if (!only) {
        throw new AppError(404, 'Not Found', `Kelas ${input.fromClassId} tidak ditemukan`)
      }
      if (only.academicYearId !== input.fromYearId) {
        throw new AppError(400, 'Conflict', `Kelas ${only.educationLevel} ${only.parallel} bukan milik tahun ajaran sumber ${fromYear.name}`)
      }
      sourceClasses = [only]
    }
    const sourceClassIds = sourceClasses.map((cls) => cls.id)

    const note = `Promosi otomatis ${fromYear.name} → ${toYear.name}`

    const runId = await runTransaction(getPrisma(), async (tx) => {
      // 1) Re-validasi: baca ulang enrollment ACTIVE + kelas kandidat target
      //    TERBARU di dalam transaksi. Keputusan basi (state berubah sejak
      //    preview) tidak pernah dieksekusi — hanya state aktif yang diproses.
      const rows = await this.enrollmentRepository.findActiveByClassesWithTx(tx, sourceClassIds, input.fromYearId)
      const targetClasses: PromotionTargetClassInput[] = (
        await this.classRepository.findByAcademicYearWithTx(tx, input.toYearId)
      ).map((cls) => ({
        id: cls.id,
        educationLevel: cls.educationLevel,
        parallel: cls.parallel,
        curriculumId: cls.curriculumId
      }))

      const sourceClassById = new Map(sourceClasses.map((cls) => [cls.id, cls]))

      const items: PromotionRunItemWrite[] = []
      const counts: PromotionPreviewCounts = { promoted: 0, repeated: 0, graduated: 0, redistributed: 0, noTarget: 0, error: 0 }

      // 2) Keputusan via decide() P-1 — fungsi SAMA yang dipakai preview
      //    (Preview == Execute terbukti dari pemakaian engine tunggal).
      for (const row of rows) {
        const sourceClass = sourceClassById.get(row.classId)
        const sourceLabel = sourceClass ? `${sourceClass.educationLevel} ${sourceClass.parallel}` : `${row.class.educationLevel} ${row.class.parallel}`
        const decision = decide({
          memberId: row.memberId,
          memberName: row.member.fullName,
          sourceClassId: row.classId,
          sourceClassLabel: sourceLabel,
          sourceLevel: row.class.educationLevel,
          sourceParallel: row.class.parallel,
          sourceCurriculumId: row.class.curriculumId,
          targetClasses,
          repeat: false
        })

        items.push({
          memberId: row.memberId,
          sourceClassId: row.classId,
          targetClassId: decision.targetClassId,
          outcome: decision.outcome,
          message: decision.message
        })
        counts[OUTCOME_COUNT_KEY[decision.outcome]] += 1

        // 3) Tulis mutasi enrollment — hanya untuk outcome yang memindahkan/
        //    mengeluarkan member. NO_TARGET/ERROR/bersifat non-terminal.
        switch (decision.outcome) {
          case 'PROMOTED':
          case 'REPEATED': {
            if (!decision.targetClassId) {
              throw new AppError(500, 'Internal', `Keputusan ${decision.outcome} tanpa kelas target untuk member ${row.memberId}`)
            }
            await this.enrollmentRepository.closeWithTx(tx, row.id, decision.outcome, note)
            await this.enrollmentRepository.createActiveWithTx(tx, {
              memberId: row.memberId,
              classId: decision.targetClassId,
              academicYearId: input.toYearId,
              note
            })
            break
          }
          case 'GRADUATED': {
            await this.enrollmentRepository.closeWithTx(tx, row.id, ACADEMIC_STATUS.graduated, note)
            break
          }
          case 'REDISTRIBUTED':
          case 'NO_TARGET':
          case 'ERROR':
            // Tidak ada mutasi — enrollment sumber tetap ACTIVE (masih eligible
            // untuk run berikutnya / penanganan manual; RFC §9).
            break
        }
      }

      // 4) Audit: satu PromotionRun + seluruh items dalam transaksi yang sama.
      return this.promotionRepository.createRunWithTx(
        tx,
        {
          fromYearId: input.fromYearId,
          toYearId: input.toYearId,
          mode: 'AUTOMATIC',
          runBy: input.runBy ?? null,
          status: 'SUCCESS',
          summary: JSON.stringify(counts),
          startedAt: new Date(),
          finishedAt: new Date()
        },
        items
      )
    })

    return this.runService.findById(runId)
  }
}
