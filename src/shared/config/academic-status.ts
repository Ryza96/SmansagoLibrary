// Status akademik `MemberEnrollment.status` (RFC §2.1, §6.1).
// Satu-satunya sumber kebenaran nilai status akademik di seluruh aplikasi.
// ACTIVE adalah satu-satunya status non-terminal; sisanya terminal untuk tahun itu.
export const ACADEMIC_STATUS = {
  active: 'ACTIVE',
  promoted: 'PROMOTED',
  repeated: 'REPEATED',
  redistributed: 'REDISTRIBUTED',
  transferred: 'TRANSFERRED',
  dropped: 'DROPPED',
  graduated: 'GRADUATED'
} as const

export type AcademicStatusCode = keyof typeof ACADEMIC_STATUS
export type AcademicStatus = (typeof ACADEMIC_STATUS)[AcademicStatusCode]

export const ACADEMIC_STATUS_VALUES = Object.values(ACADEMIC_STATUS) as AcademicStatus[]

const TERMINAL_ACADEMIC_STATUS_SET: ReadonlySet<string> = new Set([
  ACADEMIC_STATUS.promoted,
  ACADEMIC_STATUS.repeated,
  ACADEMIC_STATUS.redistributed,
  ACADEMIC_STATUS.transferred,
  ACADEMIC_STATUS.dropped,
  ACADEMIC_STATUS.graduated
])

const ACADEMIC_STATUS_SET: ReadonlySet<string> = new Set(ACADEMIC_STATUS_VALUES)

export function isAcademicStatus(value: string): value is AcademicStatus {
  return ACADEMIC_STATUS_SET.has(value)
}

export function isTerminalAcademicStatus(value: string): value is AcademicStatus {
  return TERMINAL_ACADEMIC_STATUS_SET.has(value)
}
