import { AcademicYearRepository } from '../repositories/academic-year.repository'
import { ClassRepository } from '../repositories/class.repository'
import { EnrollmentRepository } from '../repositories/enrollment.repository'
import { levelOrder } from '../../shared/config/education-level'
import { AppError } from '../../../electron/main/errorHandler'
import type {
  PromotionDecideInput,
  PromotionDecision,
  PromotionPreviewDTO,
  PromotionTargetClassInput,
  AutomaticPromotionPreviewInput
} from '../../shared/dto/promotion'

// ===========================================================================
// decide() — SINGLE DECISION ENGINE (WO P-1, keputusan arsitektur PO).
// MURNI: tidak ada akses DB, tidak membaca state global, tidak menulis.
// Seluruh input dipassing melalui parameter. P-2 WAJIB memakai fungsi ini —
// TIDAK boleh ada logika keputusan kedua di manapun.
//
// Mode A (Automatic, RFC §7): siswa ACTIVE dipromosikan ke levelOrder+1,
// parallel + kurikulum dicocokkan otomatis (X MERDEKA 1 → XI MERDEKA 1);
// XII → GRADUATED (menang atas repeat — RFC tanpa syarat); tanpa target →
// NO_TARGET; repeat (eksplisit) → REPEATED untuk X/XI.
// ===========================================================================
export function decide(input: PromotionDecideInput): PromotionDecision {
  const order = levelOrder(input.sourceLevel)

  if (Number.isNaN(order)) {
    return {
      outcome: 'ERROR',
      targetClassId: null,
      targetClassLabel: null,
      message: `Tingkat tidak dikenal: ${input.sourceLevel}`
    }
  }

  // XII → GRADUATED (RFC §7 Mode A). "XII → GRADUATED" dinyatakan TANPA syarat;
  // REPEATED hanya untuk tinggal kelas di tingkat yang sama (X→X, XI→XI),
  // bukan untuk XII yang terminal. GRADUATED MENANG atas repeat.
  if (order === 3) {
    return {
      outcome: 'GRADUATED',
      targetClassId: null,
      targetClassLabel: null,
      message: null
    }
  }

  // RFC §7 Mode A — "tidak ada yang dipromosikan ke tingkat sama (kecuali
  // dinyatakan REPEATED)". repeat adalah keputusan eksplisit (bukan otomatis).
  if (input.repeat === true) {
    const repeatTarget = findTarget(input, order)
    return repeatTarget
      ? toDecision('REPEATED', repeatTarget, input)
      : {
          outcome: 'NO_TARGET',
          targetClassId: null,
          targetClassLabel: null,
          message: `Tidak ada kelas target tingkat sama untuk ${input.sourceClassLabel}`
        }
  }

  // Promosi ke tingkat berikutnya.
  const nextTarget = findTarget(input, order + 1)
  return nextTarget
    ? toDecision('PROMOTED', nextTarget, input)
    : {
        outcome: 'NO_TARGET',
        targetClassId: null,
        targetClassLabel: null,
        message: `Tidak ada kelas target di tahun target untuk ${input.sourceClassLabel}`
      }
}

// Pencocokan kelas target otomatis (RFC §7 Mode A): tingkat yang diharapkan +
// parallel SAMA + kurikulum SAMA. Unique komposit (academicYearId, curriculumId,
// educationLevel, parallel) menjamin hasil deterministik — maksimal 1 match.
function findTarget(input: PromotionDecideInput, expectedOrder: number): PromotionTargetClassInput | null {
  return (
    input.targetClasses.find(
      (target) =>
        levelOrder(target.educationLevel) === expectedOrder &&
        target.parallel === input.sourceParallel &&
        target.curriculumId === input.sourceCurriculumId
    ) ?? null
  )
}

function toDecision(outcome: 'PROMOTED' | 'REPEATED', target: PromotionTargetClassInput, input: PromotionDecideInput): PromotionDecision {
  return {
    outcome,
    targetClassId: target.id,
    targetClassLabel: `${target.educationLevel} ${target.parallel}`,
    message: null
  }
}

// ===========================================================================
// PromotionPreviewService — READ-ONLY (RFC §7.1 step 1, RFC §8).
// Menghitung pratinjau tanpa menulis apa pun: baca enrollment ACTIVE dari
// kelas sumber, jalankan decide() (fungsi SAMA dengan execute), agregasi counts.
// ===========================================================================
export class PromotionPreviewService {
  constructor(
    private academicYearRepository: AcademicYearRepository,
    private classRepository: ClassRepository,
    private enrollmentRepository: EnrollmentRepository
  ) {}

  async preview(input: AutomaticPromotionPreviewInput): Promise<PromotionPreviewDTO> {
    if (input.mode !== 'AUTOMATIC') {
      throw new AppError(400, 'Conflict', `Mode ${input.mode} belum didukung — WO P-1 hanya AUTOMATIC (MAPPING/BULK_EDIT = P-3/P-5)`)
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

    // Kelas kandidat target: semua kelas tahun target (RFC §7 — parallel otomatis).
    const targetClasses: PromotionTargetClassInput[] = (await this.classRepository.findByAcademicYear(input.toYearId)).map((cls) => ({
      id: cls.id,
      educationLevel: cls.educationLevel,
      parallel: cls.parallel,
      curriculumId: cls.curriculumId
    }))

    // Enrollment ACTIVE sumber — read-only melalui EnrollmentRepository
    // (Service TIDAK mengakses Prisma langsung; arsitektur project = Service
    // melalui Repository).
    const rows = await this.enrollmentRepository.findActiveByClasses(
      sourceClasses.map((cls) => cls.id),
      input.fromYearId
    )

    const sourceClassById = new Map(sourceClasses.map((cls) => [cls.id, cls]))

    const items = rows.map((row) => {
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
      return {
        memberId: row.memberId,
        memberName: row.member.fullName,
        sourceClassId: row.classId,
        sourceLabel,
        targetClassId: decision.targetClassId,
        targetLabel: decision.targetClassLabel,
        outcome: decision.outcome,
        message: decision.message
      }
    })

    const counts = {
      promoted: 0,
      repeated: 0,
      graduated: 0,
      redistributed: 0,
      noTarget: 0,
      error: 0
    }
    for (const item of items) {
      switch (item.outcome) {
        case 'PROMOTED':
          counts.promoted++
          break
        case 'REPEATED':
          counts.repeated++
          break
        case 'GRADUATED':
          counts.graduated++
          break
        case 'REDISTRIBUTED':
          counts.redistributed++
          break
        case 'NO_TARGET':
          counts.noTarget++
          break
        case 'ERROR':
          counts.error++
          break
      }
    }

    return {
      mode: 'AUTOMATIC',
      fromYearId: input.fromYearId,
      toYearId: input.toYearId,
      fromClassId: input.fromClassId ?? null,
      counts,
      items
    }
  }
}
