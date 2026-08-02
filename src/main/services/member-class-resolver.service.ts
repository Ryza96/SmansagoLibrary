import type { Class } from '@prisma/client'
import { AcademicYearRepository } from '../repositories/academic-year.repository'
import { ClassRepository } from '../repositories/class.repository'
import type { MemberImportRowInput } from '../../shared/dto/member'

/*
 * Class Resolver untuk import anggota (RFC v2 §6).
 *
 * Aturan (keputusan PO #5):
 *   - DILARANG auto-create kelas. Data master (AcademicYear, Curriculum,
 *     Class) wajib sudah ada.
 *   - Kelas tidak ditemukan / ambigu  -> BLOCKER -> import gagal.
 *   - Error WAJIB memuat nama kelas (className) yang gagal dicari.
 *
 * Strategi batch (RFC §6.3):
 *   - findActive (1 query) -> tahun ajaran aktif, null -> semua baris
 *     classNotFound.
 *   - findByAcademicYear (1 query) -> SELURUH kelas tahun aktif, lalu
 *     bangun Map<key, Class[]> di memori.
 *   - Per baris: lookup map -> 1 kelas = classId; 0 kelas = classNotFound;
 *     >1 kelas = classAmbiguous.
 *
 * Tidak ada query per baris. Tidak ada tulis.
 *
 * API publik ini dipakai oleh P4 (MemberImportService / preflight) —
 * P4 belum dikerjakan.
 */

export const MEMBER_CLASS_NOT_FOUND_MESSAGE_KEY = 'memberImport.classNotFound'
export const MEMBER_CLASS_AMBIGUOUS_MESSAGE_KEY = 'memberImport.classAmbiguous'

const EDUCATION_LEVELS = new Set(['X', 'XI', 'XII'])

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
  constructor(
    private academicYearRepository: AcademicYearRepository,
    private classRepository: ClassRepository
  ) {}

  async resolve(rows: readonly MemberImportRowInput[]): Promise<MemberClassResolutionResult> {
    const items: MemberClassResolutionItem[] = []
    const errors: MemberClassResolutionIssue[] = []

    const activeYear = await this.academicYearRepository.findActive()

    const classes: Class[] = activeYear
      ? await this.classRepository.findByAcademicYear(activeYear.id)
      : []
    const classMap = new Map<string, Class[]>()
    for (const klass of classes) {
      const key = classKey(klass.educationLevel, klass.parallel)
      const list = classMap.get(key)
      if (list) list.push(klass)
      else classMap.set(key, [klass])
    }

    for (const row of rows) {
      const className = row.className
      const parsed = parseClassName(className)

      if (!parsed || !activeYear) {
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

    return { items, errors }
  }
}
