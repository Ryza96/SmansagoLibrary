export interface MemberBorrowRights {
  maxBooks: number
  maxDays: number
  extensions: string
}

export interface MemberTypeDefinition {
  code: string
  label: string
  memberNumberPrefix: string
  borrowRights: MemberBorrowRights
  hasAcademicRecord: boolean
}

export const MEMBER_TYPES = {
  // PO Decision (MEMBER BORROWING RIGHTS): seluruh tipe anggota distandarkan ke
  // maxBooks 20 & maxDays 90. `extensions` (kebijakan perpanjangan) TIDAK diubah.
  student: {
    code: 'student',
    label: 'Siswa',
    memberNumberPrefix: 'S',
    borrowRights: { maxBooks: 20, maxDays: 90, extensions: '1x' },
    hasAcademicRecord: true
  },
  teacher: {
    code: 'teacher',
    label: 'Guru',
    memberNumberPrefix: 'G',
    borrowRights: { maxBooks: 20, maxDays: 90, extensions: '3x' },
    hasAcademicRecord: false
  },
  general: {
    code: 'general',
    label: 'Umum',
    memberNumberPrefix: 'U',
    borrowRights: { maxBooks: 20, maxDays: 90, extensions: 'Tidak Terbatas' },
    hasAcademicRecord: false
  }
} as const satisfies Record<string, MemberTypeDefinition>

export type MemberTypeCode = keyof typeof MEMBER_TYPES
export type MemberType = (typeof MEMBER_TYPES)[MemberTypeCode]

export const MEMBER_TYPE_CODES = Object.keys(MEMBER_TYPES) as MemberTypeCode[]

const MEMBER_TYPE_CODE_SET = new Set<string>(MEMBER_TYPE_CODES)

export function isMemberTypeCode(value: string): value is MemberTypeCode {
  return MEMBER_TYPE_CODE_SET.has(value)
}

export function getMemberType(memberType?: string | null): MemberType | null {
  if (!memberType || !isMemberTypeCode(memberType)) return null
  return MEMBER_TYPES[memberType]
}

export function memberTypeLabel(memberType?: string | null): string | null {
  return getMemberType(memberType)?.label ?? null
}

export function memberNumberPrefix(memberType?: string | null): string {
  return getMemberType(memberType)?.memberNumberPrefix ?? MEMBER_TYPES.student.memberNumberPrefix
}

export function memberBorrowRights(memberType?: string | null): MemberBorrowRights | null {
  return getMemberType(memberType)?.borrowRights ?? null
}
