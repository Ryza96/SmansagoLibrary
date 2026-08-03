import type {
  MemberImportPreviewDTO,
  MemberImportPreviewIssue,
  MemberImportProgressEvent,
  MemberImportResultDTO,
  MemberImportRowInput,
  MemberImportScope
} from '../../shared/dto/member'
import type { Prisma } from '@prisma/client'
import { MemberDuplicateChecker } from './member-duplicate-checker.service'
import { MemberClassResolver } from './member-class-resolver.service'
import { NumberGeneratorService } from './number-generator.service'
import { MemberRepository } from '../repositories/member.repository'
import { EnrollmentRepository } from '../repositories/enrollment.repository'
import { getPrisma } from '../repositories/base/prisma'
import { runTransaction } from '../repositories/base/transaction'
import { normalizeMemberImportRows } from '../../shared/utils/member-import-normalization'
import { MEMBER_TYPES } from '../../shared/config/member-type'
import { ACADEMIC_STATUS } from '../../shared/config/academic-status'

/*
 * Orchestrator import anggota (WO-5 P4C — Transaction & Database Write).
 *
 * Referensi: MEMBER_IMPORT_SERVICE_ARCHITECTURE_RFC.md (APPROVED),
 *            WORK_ORDER_5_P4B_REPORT.md (APPROVED).
 *
 * Scope P4B (sudah selesai):
 *   - Constructor DI sesuai RFC (4 dependensi).
 *   - previewCheck(): preflight read-only -> MemberImportPreviewDTO.
 *   - import(): single-flight guard + preflight ULANG + validasi blocker.
 *
 * Scope P4C (fasa ini):
 *   - writePhase() diaktifkan: SATU $transaction (runTransaction reuse)
 *     berisi allocateMemberNumbers (NumberGeneratorService, di dalam tx) +
 *     createManyWithTx (MemberRepository, chunked DI DALAM tx).
 *   - buildPayload: MemberCreateManyInput per RFC §6.3 (memberType=student,
 *     status=INACTIVE, classId dari hasil resolver, nomor berurutan max+1).
 *   - Rollback otomatis oleh Prisma bila ada exception (all-or-nothing).
 *   - P2002 (unique constraint) -> MemberImportResultDTO success:false,
 *     TIDAK di-throw (kasus bisnis -> result object).
 *
 * Scope WO-18 MI-2 (impor berorientasi enrollment — RFC §12.1 step 5):
 *   - Member.classId TIDAK LAGI ditulis (nilai null di kolom).
 *   - writePhase menulis Member + MemberEnrollment(ACTIVE) dalam SATU
 *     $transaction yang sama. MemberEnrollment = Source of Truth penempatan
 *     kelas. academicYearId enrollment = tahun yang DIPAKAI resolver
 *     (classResult.academicYearId, termasuk fallback tahun aktif) sehingga
 *     tahun enrollment selalu sama dengan tahun resolusi kelas.
 *   - Invarian "tidak ada Member tanpa Enrollment": commit sekali di akhir;
 *     bila createMany enrollment gagal (exception apa pun) -> rollback penuh
 *     -> 0 Member + 0 Enrollment tersimpan.
 *
 * Kontrak lempar-vs-return (RFC §3.2 / §9):
 *   - Kasus bisnis (preflight blocker, P2002 saat commit, single-flight)
 *     -> RESULT OBJECT.
 *   - Error sistem (DB down/timeout) -> throw -> reject promise.
 */

export const MEMBER_IMPORT_IMPORT_FAILED_MESSAGE_KEY = 'memberImport.importFailed'
export const MEMBER_IMPORT_CREATE_FAILED_MESSAGE_KEY = 'memberImport.createFailed'

const NON_ROW_NUMBER = -1

interface MemberImportPreflight {
  errors: MemberImportPreviewIssue[]
  warnings: MemberImportPreviewIssue[]
  classIdByRow: Map<number, string>
  // WO-18 MI-2 — tahun ajaran efektif hasil resolusi (termasuk fallback tahun
  // aktif). Dipakai writePhase untuk MemberEnrollment.academicYearId.
  academicYearId: string | null
}

export class MemberImportService {
  private importRunning = false

  constructor(
    private readonly duplicateChecker: MemberDuplicateChecker,
    private readonly classResolver: MemberClassResolver,
    private readonly numberGenerator: NumberGeneratorService,
    private readonly memberRepository: MemberRepository,
    private readonly enrollmentRepository: EnrollmentRepository
  ) {}

  isImportRunning(): boolean {
    return this.importRunning
  }

  // WO-17 MI-1: scope (academicYearId + curriculumId) opsional — bila tidak diberikan
  // (UI import lama), resolver memakai tahun ajaran aktif tanpa filter kurikulum
  // (backward-compat). UI MI-2 akan selalu mengirim scope eksplisit.
  async previewCheck(rows: MemberImportRowInput[], scope?: MemberImportScope): Promise<MemberImportPreviewDTO> {
    const preflight = await this.preflight(normalizeMemberImportRows(rows), scope)
    return {
      valid: preflight.errors.length === 0,
      errorCount: preflight.errors.length,
      warningCount: preflight.warnings.length,
      errors: preflight.errors,
      warnings: preflight.warnings
    }
  }

  async import(
    rows: MemberImportRowInput[],
    options?: { onProgress?: (event: MemberImportProgressEvent) => void; scope?: MemberImportScope }
  ): Promise<MemberImportResultDTO> {
    const startedAt = Date.now()
    const normalized = normalizeMemberImportRows(rows)

    if (this.importRunning) {
      return this.failedResult(startedAt, normalized, [
        { rowNumber: NON_ROW_NUMBER, messageKey: MEMBER_IMPORT_IMPORT_FAILED_MESSAGE_KEY }
      ])
    }

    this.importRunning = true
    let preflight: MemberImportPreflight | null = null
    try {
      options?.onProgress?.({ stage: 'preparing', current: 0, total: normalized.length })

      preflight = await this.preflight(normalized, options?.scope, options?.onProgress)

      if (preflight.errors.length > 0) {
        return {
          success: false,
          totalRows: normalized.length,
          created: 0,
          failed: normalized.length,
          warnings: preflight.warnings.length,
          durationMs: Date.now() - startedAt,
          errors: preflight.errors
        }
      }

      // SATU transaksi: allocateMemberNumbers (NumberGeneratorService) +
      // createManyWithTx (MemberRepository, chunked) + createManyWithTx
      // (EnrollmentRepository, ACTIVE) DI DALAM tx yang sama.
      // Commit sekali di akhir oleh prisma.$transaction.
      options?.onProgress?.({ stage: 'generating-number', current: 0, total: normalized.length })
      const created = await this.writePhase(
        normalized,
        preflight.classIdByRow,
        preflight.academicYearId,
        options?.onProgress
      )
      options?.onProgress?.({ stage: 'completed', current: normalized.length, total: normalized.length })

      return {
        success: true,
        totalRows: normalized.length,
        created,
        failed: normalized.length - created,
        warnings: preflight.warnings.length,
        durationMs: Date.now() - startedAt,
        errors: []
      }
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        // P2002 saat commit -> Prisma otomatis ROLLBACK penuh (0 baris
        // tersimpan). Business error -> result object, TIDAK di-throw.
        return {
          success: false,
          totalRows: normalized.length,
          created: 0,
          failed: normalized.length,
          warnings: preflight?.warnings.length ?? 0,
          durationMs: Date.now() - startedAt,
          errors: [{ rowNumber: NON_ROW_NUMBER, messageKey: MEMBER_IMPORT_CREATE_FAILED_MESSAGE_KEY }]
        }
      }
      throw error
    } finally {
      this.importRunning = false
    }
  }

  private async preflight(
    rows: readonly MemberImportRowInput[],
    scope?: MemberImportScope,
    onProgress?: (event: MemberImportProgressEvent) => void
  ): Promise<MemberImportPreflight> {
    const total = rows.length

    onProgress?.({ stage: 'checking-duplicate', current: 0, total })
    const duplicateResult = await this.duplicateChecker.checkDatabase(rows)
    onProgress?.({ stage: 'checking-duplicate', current: total, total })

    onProgress?.({ stage: 'resolving-class', current: 0, total })
    const classResult = await this.classResolver.resolve(
      rows,
      scope?.academicYearId ?? null,
      scope?.curriculumId ?? null
    )
    onProgress?.({ stage: 'resolving-class', current: total, total })

    const errors: MemberImportPreviewIssue[] = []
    const warnings: MemberImportPreviewIssue[] = []
    const classIdByRow = new Map<number, string>()

    for (const issue of duplicateResult.errors) {
      errors.push({
        rowNumber: issue.rowNumber,
        messageKey: issue.messageKey,
        field: issue.field,
        existingMemberNumber: issue.existingMemberNumber,
        existingMemberName: issue.existingMemberName
      })
    }

    for (const issue of classResult.errors) {
      errors.push({
        rowNumber: issue.rowNumber,
        messageKey: issue.messageKey,
        className: issue.className
      })
    }

    for (const item of classResult.items) {
      if (item.classId !== null) classIdByRow.set(item.rowNumber, item.classId)
    }

    return { errors, warnings, classIdByRow, academicYearId: classResult.academicYearId }
  }

  // Fase tulis (P4C + WO-18 MI-2): SATU $transaction. Alokasi nomor
  // (NumberGeneratorService), createMany Member (tanpa classId) dan
  // createMany MemberEnrollment(ACTIVE) memakai objek tx yang sama; commit
  // sekali di akhir. Exception apa pun -> Prisma ROLLBACK otomatis
  // (all-or-nothing) -> TIDAK ada Member tanpa Enrollment.
  private async writePhase(
    rows: MemberImportRowInput[],
    classIdByRow: Map<number, string>,
    academicYearId: string | null,
    _onProgress?: (event: MemberImportProgressEvent) => void
  ): Promise<number> {
    if (academicYearId === null) {
      // Tidak mungkin terjadi saat preflight.errors kosong (tanpa tahun semua
      // baris classNotFound). Guard defensif: jangan tulis Member tanpa tahun.
      throw new Error('MemberImportService: academic year tidak tersedia untuk enrollment')
    }

    return runTransaction(getPrisma(), async (tx) => {
      const numbers = await this.numberGenerator.allocateMemberNumbers(tx, rows.length, MEMBER_TYPES.student.code)
      const memberPayload = this.buildMemberPayload(rows, numbers)
      await this.memberRepository.createManyWithTx(tx, memberPayload)

      const createdMembers = await tx.member.findMany({
        where: { memberNumber: { in: numbers } },
        select: { id: true, memberNumber: true }
      })
      const idByNumber = new Map(createdMembers.map((member) => [member.memberNumber, member.id]))

      const enrollments = rows.map((row, index) => {
        const memberNumber = numbers[index]
        const memberId = memberNumber === undefined ? undefined : idByNumber.get(memberNumber)
        if (memberNumber === undefined || memberId === undefined) {
          throw new Error('MemberImportService: enrollment member lookup mismatch')
        }
        const classId = classIdByRow.get(row.rowNumber)
        if (classId === undefined) {
          throw new Error('MemberImportService: enrollment class lookup mismatch')
        }
        return {
          memberId,
          classId,
          academicYearId,
          status: ACADEMIC_STATUS.active,
          note: null
        }
      })

      await this.enrollmentRepository.createManyWithTx(tx, enrollments)
      return enrollments.length
    })
  }

  // MemberCreateManyInput TANPA classId (WO-18 MI-2): MemberEnrollment adalah
  // Source of Truth penempatan kelas. Member.status tetap INACTIVE (RFC §12.1
  // step 5); status keanggotaan tidak diubah di sini.
  private buildMemberPayload(rows: MemberImportRowInput[], numbers: string[]): Prisma.MemberCreateManyInput[] {
    return rows.map((row, index) => {
      const memberNumber = numbers[index]
      if (memberNumber === undefined) {
        throw new Error('MemberImportService: member number allocation mismatch')
      }
      return {
        memberNumber,
        memberType: MEMBER_TYPES.student.code,
        fullName: row.fullName,
        gender: row.gender,
        nisn: row.nisn,
        birthPlace: row.birthPlace,
        birthDate: this.parseBirthDate(row.birthDate),
        address: row.address,
        phone: row.phone,
        email: row.email,
        status: 'INACTIVE'
      }
    })
  }

  private parseBirthDate(value: string | undefined): Date | undefined {
    if (!value) return undefined
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? undefined : date
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (error as { code?: string })?.code === 'P2002'
  }

  private failedResult(
    startedAt: number,
    rows: MemberImportRowInput[],
    errors: MemberImportPreviewIssue[]
  ): MemberImportResultDTO {
    return {
      success: false,
      totalRows: rows.length,
      created: 0,
      failed: rows.length,
      warnings: 0,
      durationMs: Date.now() - startedAt,
      errors
    }
  }
}
