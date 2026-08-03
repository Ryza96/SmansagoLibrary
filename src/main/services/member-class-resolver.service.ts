import type { Class } from '@prisma/client'
import { ClassRepository } from '../repositories/class.repository'
import type { MemberImportRowInput } from '../../shared/dto/member'
import { EDUCATION_LEVELS } from '../../shared/config/education-level'

/*
 * Class Resolver untuk import anggota (RFC v2 §6, §12.1; WBS WO-17 MI-1).
 *
 * Aturan (keputusan PO #5):
 *   - DILARANG auto-create kelas. Data master (AcademicYear, Curriculum,
 *     Class) wajib sudah ada.
 *   - Kelas tidak ditemukan / ambigu  -> BLOCKER -> import gagal.
 *   - Error WAJIB memuat nama kelas (className) yang gagal dicari.
 *
 * Skop eksplisit (RFC §12.1 step 4 — MI-1, dikencangkan WO-20 MI-4):
 *   - resolve(rows, academicYearId, curriculumId) HANYA mencari Class pada
 *     KOMBINASI AcademicYear + Curriculum.
 *   - academicYearId WAJIB (string, bukan null) — fallback tahun ajaran AKTIF
 *     implicit dihapus (MI-4). UI selalu mengirim scope eksplisit.
 *   - curriculumId WAJIB (string) — filter kurikulum selalu aktif.
 *
 * Strategi batch (RFC §6.3):
 *   - 1 query kelas tahun+kurikulum -> Map<key, Class[]> di memori.
 *   - Per baris: lookup map -> 1 kelas = classId; 0 kelas = classNotFound;
 *     >1 kelas = classAmbiguous. Tidak ada query per baris. Tidak ada tulis.
 */

export const MEMBER_CLASS_NOT_FOUND_MESSAGE_KEY = 'memberImport.classNotFound'
export const MEMBER_CLASS_AMBIGUOUS_MESSAGE_KEY = 'memberImport.classAmbiguous'

export interface MemberClassResolutionItem {
  rowNumber: number
  className: string
  classId: string | null
}

export interface MemberClassResolutionIssue {
  rowNumber: number
  className: string
  messageKey: string
}

export interface MemberClassResolutionResult {
  items: MemberClassResolutionItem[]
  errors: MemberClassResolutionIssue[]
  // WO-18 MI-2 — tahun ajaran yang DIPAKAI resolver (nilai scope eksplisit).
  // Konsumen write-phase memakai nilai ini untuk MemberEnrollment.academicYearId
  // agar tahun enrollment SELALU sama dengan tahun resolusi kelas (SSOT resolusi).
  academicYearId: string
}

function normalizeParallel(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function classKey(educationLevel: string, parallel: string): string {
  return `${educationLevel.toUpperCase()} ${normalizeParallel(parallel).toUpperCase()}`
}

function parseClassName(className: string): { educationLevel: string; parallel: string } | null {
  const trimmed = className.trim()
  const spaceIndex = trimmed.indexOf(' ')
  if (spaceIndex === -1) return null

  const educationLevel = trimmed.slice(0, spaceIndex).toUpperCase()
  if (!EDUCATION_LEVELS.has(educationLevel)) return null

  const parallel = normalizeParallel(trimmed.slice(spaceIndex + 1))
  if (parallel === '') return null

  return { educationLevel, parallel }
}

export class MemberClassResolver {
  constructor(private classRepository: ClassRepository) {}

  async resolve(
    rows: readonly MemberImportRowInput[],
    academicYearId: string,
    curriculumId: string
  ): Promise<MemberClassResolutionResult> {
    const classes = await this.classRepository.findByAcademicYearAndCurriculum(academicYearId, curriculumId)
    const classMap = new Map<string, Class[]>()
    for (const klass of classes) {
      const key = classKey(klass.educationLevel, klass.parallel)
      const list = classMap.get(key)
      if (list) list.push(klass)
      else classMap.set(key, [klass])
    }

    const items: MemberClassResolutionItem[] = []
    const errors: MemberClassResolutionIssue[] = []

    for (const row of rows) {
      const className = row.className
      const parsed = parseClassName(className)

      if (!parsed) {
        errors.push({ rowNumber: row.rowNumber, className, messageKey: MEMBER_CLASS_NOT_FOUND_MESSAGE_KEY })
        items.push({ rowNumber: row.rowNumber, className, classId: null })
        continue
      }

      const candidates = classMap.get(classKey(parsed.educationLevel, parsed.parallel)) ?? []

      if (candidates.length === 0) {
        errors.push({ rowNumber: row.rowNumber, className, messageKey: MEMBER_CLASS_NOT_FOUND_MESSAGE_KEY })
        items.push({ rowNumber: row.rowNumber, className, classId: null })
        continue
      }

      if (candidates.length > 1) {
        errors.push({ rowNumber: row.rowNumber, className, messageKey: MEMBER_CLASS_AMBIGUOUS_MESSAGE_KEY })
        items.push({ rowNumber: row.rowNumber, className, classId: null })
        continue
      }

      items.push({ rowNumber: row.rowNumber, className, classId: candidates[0].id })
    }

    return { items, errors, academicYearId }
  }
}
