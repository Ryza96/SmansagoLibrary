import { getPrisma } from '../repositories/base/prisma'
import { runTransaction } from '../repositories/base/transaction'
import { MEMBER_TYPES } from '../../shared/config/member-type'
import type {
  TeacherImportRowInput,
  TeacherImportPreviewDTO,
  TeacherImportPreviewIssue,
  TeacherImportResultDTO
} from '../../shared/dto/teacher'
import type { MemberRepository } from '../repositories/member.repository'
import type { NumberGeneratorService } from './number-generator.service'
import type { TeacherDuplicateChecker } from './teacher-duplicate-checker.service'

export const TEACHER_CREATE_FAILED_MESSAGE_KEY = 'teacherImport.createFailed'
export const TEACHER_IMPORT_ALREADY_RUNNING_MESSAGE =
  'Import guru sedang berjalan. Silakan tunggu hingga selesai.'

function isPrismaP2002(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  )
}

export class TeacherImportService {
  private isImporting = false

  constructor(
    private readonly teacherDuplicateChecker: TeacherDuplicateChecker,
    private readonly numberGeneratorService: NumberGeneratorService,
    private readonly memberRepository: MemberRepository
  ) {}

  isImportRunning(): boolean {
    return this.isImporting
  }

  async previewCheck(rows: TeacherImportRowInput[]): Promise<TeacherImportPreviewDTO> {
    const { errors } = await this.teacherDuplicateChecker.checkDatabase(rows)
    return {
      valid: errors.length === 0,
      errorCount: errors.length,
      warningCount: 0,
      errors,
      warnings: []
    }
  }

  async import(
    rows: TeacherImportRowInput[],
    onProgress?: (stage: string) => void
  ): Promise<TeacherImportResultDTO> {
    if (this.isImporting) {
      throw new Error(TEACHER_IMPORT_ALREADY_RUNNING_MESSAGE)
    }
    this.isImporting = true
    const startedAt = Date.now()
    try {
      onProgress?.('preparing')

      const duplicateCheck = await this.teacherDuplicateChecker.checkDatabase(rows)
      onProgress?.('checking-duplicate')
      if (duplicateCheck.errors.length > 0) {
        return {
          success: false,
          totalRows: rows.length,
          created: 0,
          skipped: 0,
          failed: duplicateCheck.errors.length,
          warnings: 0,
          durationMs: Date.now() - startedAt,
          errors: duplicateCheck.errors
        }
      }

      onProgress?.('generating-number')
      const createdCount = await runTransaction(getPrisma(), async (tx) => {
        const memberNumbers = await this.numberGeneratorService.allocateMemberNumbers(
          tx,
          rows.length,
          MEMBER_TYPES.teacher.code
        )
        const payloads = rows.map((row, index) => ({
          memberNumber: memberNumbers[index],
          memberType: MEMBER_TYPES.teacher.code,
          fullName: row.fullName,
          gender: row.gender,
          nip: (row.nip ?? '').trim() || undefined,
          birthPlace: row.birthPlace,
          birthDate: row.birthDate ? new Date(row.birthDate) : undefined,
          address: row.address,
          phone: row.phone,
          email: row.email,
          status: 'INACTIVE'
        }))
        await this.memberRepository.createManyWithTx(tx, payloads)
        return payloads.length
      })
      onProgress?.('completed')

      return {
        success: true,
        totalRows: rows.length,
        created: createdCount,
        skipped: 0,
        failed: 0,
        warnings: 0,
        durationMs: Date.now() - startedAt,
        errors: []
      }
    } catch (error) {
      if (isPrismaP2002(error)) {
        return {
          success: false,
          totalRows: rows.length,
          created: 0,
          skipped: 0,
          failed: rows.length,
          warnings: 0,
          durationMs: Date.now() - startedAt,
          errors: [{ rowNumber: 0, messageKey: TEACHER_CREATE_FAILED_MESSAGE_KEY, field: 'nip' }]
        }
      }
      throw error
    } finally {
      this.isImporting = false
    }
  }
}
