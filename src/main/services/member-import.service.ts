import type {
  MemberImportPreviewDTO,
  MemberImportPreviewIssue,
  MemberImportProgressEvent,
  MemberImportResultDTO,
  MemberImportRowInput
} from '../../shared/dto/member'
import type { Prisma } from '@prisma/client'
import { MemberDuplicateChecker } from './member-duplicate-checker.service'
import { MemberClassResolver } from './member-class-resolver.service'
import { NumberGeneratorService } from './number-generator.service'
import { MemberRepository } from '../repositories/member.repository'
import { getPrisma } from '../repositories/base/prisma'
import { runTransaction } from '../repositories/base/transaction'
import { normalizeMemberImportRows } from '../../shared/utils/member-import-normalization'

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
}

export class MemberImportService {
  private importRunning = false

  constructor(
    private readonly duplicateChecker: MemberDuplicateChecker,
    private readonly classResolver: MemberClassResolver,
    private readonly numberGenerator: NumberGeneratorService,
    private readonly memberRepository: MemberRepository
  ) {}

  isImportRunning(): boolean {
    return this.importRunning
  }

  async previewCheck(rows: MemberImportRowInput[]): Promise<MemberImportPreviewDTO> {
    const preflight = await this.preflight(normalizeMemberImportRows(rows))
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
    options?: { onProgress?: (event: MemberImportProgressEvent) => void }
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

      preflight = await this.preflight(normalized, options?.onProgress)

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
      // createManyWithTx (MemberRepository, chunked) DI DALAM tx yang sama.
      // Commit sekali di akhir oleh prisma.$transaction.
      options?.onProgress?.({ stage: 'generating-number', current: 0, total: normalized.length })
      const created = await this.writePhase(normalized, preflight.classIdByRow, options?.onProgress)
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
    onProgress?: (event: MemberImportProgressEvent) => void
  ): Promise<MemberImportPreflight> {
    const total = rows.length

    onProgress?.({ stage: 'checking-duplicate', current: 0, total })
    const duplicateResult = await this.duplicateChecker.checkDatabase(rows)
    onProgress?.({ stage: 'checking-duplicate', current: total, total })

    onProgress?.({ stage: 'resolving-class', current: 0, total })
    const classResult = await this.classResolver.resolve(rows)
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

    return { errors, warnings, classIdByRow }
  }

  // Fase tulis (P4C): SATU $transaction. Alokasi nomor (NumberGeneratorService)
  // dan createManyWithTx (chunked) memakai objek tx yang sama; commit sekali di
  // akhir. Exception apa pun -> Prisma ROLLBACK otomatis (all-or-nothing).
  private async writePhase(
    rows: MemberImportRowInput[],
    classIdByRow: Map<number, string>,
    _onProgress?: (event: MemberImportProgressEvent) => void
  ): Promise<number> {
    return runTransaction(getPrisma(), async (tx) => {
      const numbers = await this.numberGenerator.allocateMemberNumbers(tx, rows.length, 'student')
      const payload = this.buildPayload(rows, classIdByRow, numbers)
      await this.memberRepository.createManyWithTx(tx, payload)
      return payload.length
    })
  }

  private buildPayload(
    rows: MemberImportRowInput[],
    classIdByRow: Map<number, string>,
    numbers: string[]
  ): Prisma.MemberCreateManyInput[] {
    return rows.map((row, index) => {
      const memberNumber = numbers[index]
      if (memberNumber === undefined) {
        throw new Error('MemberImportService: member number allocation mismatch')
      }
      return {
        memberNumber,
        memberType: 'student',
        fullName: row.fullName,
        gender: row.gender,
        nisn: row.nisn,
        birthPlace: row.birthPlace,
        birthDate: this.parseBirthDate(row.birthDate),
        address: row.address,
        phone: row.phone,
        email: row.email,
        classId: classIdByRow.get(row.rowNumber) ?? null,
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
