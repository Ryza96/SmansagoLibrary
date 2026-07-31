export interface AcademicYearDTO {
  id: string
  name: string
  startDate: string
  endDate: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateAcademicYearDTO {
  name: string
  startDate: string
  endDate: string
  isActive?: boolean
}

export interface UpdateAcademicYearDTO {
  name?: string
  startDate?: string
  endDate?: string
  isActive?: boolean
}

export interface CurriculumDTO {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface CreateCurriculumDTO {
  name: string
}

export interface UpdateCurriculumDTO {
  name?: string
}

export interface ClassDTO {
  id: string
  academicYearId: string
  curriculumId: string
  educationLevel: string
  parallel: string
  displayName: string
  homeroomTeacher: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateClassDTO {
  academicYearId: string
  curriculumId: string
  educationLevel: string
  parallel: string
  homeroomTeacher?: string
  isActive?: boolean
}

export interface UpdateClassDTO {
  academicYearId?: string
  curriculumId?: string
  educationLevel?: string
  parallel?: string
  homeroomTeacher?: string | null
  isActive?: boolean
}
