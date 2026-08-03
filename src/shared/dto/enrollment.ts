export interface EnrollmentDTO {
  id: string
  memberId: string
  memberNumber: string
  memberName: string
  classId: string
  className: string
  academicYearId: string
  academicYearName: string
  status: string
  enrolledAt: string
  leftAt: string | null
  note: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateEnrollmentDTO {
  memberId: string
  classId: string
  academicYearId: string
  note?: string
}

export interface CloseEnrollmentDTO {
  status: string
  note?: string
}

export interface RepointEnrollmentDTO {
  targetClassId: string
  note?: string
}
