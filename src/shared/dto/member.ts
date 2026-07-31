export interface MemberDTO {
  id: string
  memberNumber: string
  fullName: string
  memberType: string | null
  gender: string | null
  nisn: string | null
  nip: string | null
  nuptk: string | null
  nik: string | null
  birthPlace: string | null
  birthDate: string | null
  address: string | null
  phone: string | null
  email: string | null
  classId: string | null
  classInfo: {
    id: string
    educationLevel: string
    parallel: string
    academicYear: { id: string; name: string; isActive: boolean } | null
    curriculum: { id: string; name: string } | null
  } | null
  status: string
  createdAt: string
  updatedAt: string
}

export interface CreateMemberDTO {
  fullName: string
  memberType?: string
  gender?: string
  nisn?: string
  nip?: string
  nuptk?: string
  nik?: string
  birthPlace?: string
  birthDate?: string
  address?: string
  phone?: string
  email?: string
  classId?: string
}

export interface UpdateMemberDTO {
  fullName?: string
  memberType?: string
  gender?: string
  nisn?: string
  nip?: string
  nuptk?: string
  nik?: string
  birthPlace?: string
  birthDate?: string
  address?: string
  phone?: string
  email?: string
  classId?: string
  status?: string
}
