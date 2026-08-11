import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type { AcademicYearDTO, ClassDTO } from '../../types/dtos/academic'
import { LABELS } from '../../utils/labels'
import { MEMBER_TYPES } from '../../shared/config/member-type'
import Section from './Section'

const FETCH_ALL_LIMIT = 100

const api = window.electronAPI

async function fetchAllClasses(): Promise<ClassDTO[]> {
  const all: ClassDTO[] = []
  let page = 1
  for (;;) {
    const result = await api.classes.findMany(undefined, page, FETCH_ALL_LIMIT)
    all.push(...result.data)
    if (all.length >= result.total) break
    page += 1
  }
  return all
}

interface MemberClassSectionProps {
  memberType: string
  academicYearId: string
  setAcademicYearId: Dispatch<SetStateAction<string>>
  classId: string
  setClassId: Dispatch<SetStateAction<string>>
  errors: Record<string, string>
}

export default function MemberClassSection({
  memberType,
  academicYearId,
  setAcademicYearId,
  classId,
  setClassId,
  errors
}: MemberClassSectionProps) {
  const isStudent = memberType === MEMBER_TYPES.student.code
  const [academicYears, setAcademicYears] = useState<AcademicYearDTO[]>([])
  const [classes, setClasses] = useState<ClassDTO[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isStudent) return
    let cancelled = false
    setLoading(true)
    Promise.all([api.academicYears.findMany(), fetchAllClasses()])
      .then(([years, allClasses]) => {
        if (cancelled) return
        setAcademicYears(years.data)
        const active = years.data.find((y) => y.isActive)
        if (active) setAcademicYearId((prev) => prev || active.id)
        setClasses(allClasses)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isStudent])

  if (!isStudent) return null

  const activeYear = academicYears.find((y) => y.isActive)
  const defaultYear = academicYearId || activeYear?.id || ''
  const yearName = (id: string) => academicYears.find((y) => y.id === id)?.name ?? id

  const classesOfYear = classes.filter((c) => c.academicYearId === defaultYear)

  return (
    <Section title={LABELS.MEMBER_CLASS.TITLE}>
      <p className="text-sm text-slate-500 -mt-3">{LABELS.MEMBER_CLASS.SUBTITLE}</p>
      {loading ? (
        <p className="text-sm text-slate-400">{LABELS.PLACEHOLDER.LOADING}</p>
      ) : academicYears.length === 0 ? (
        <p className="text-sm text-amber-600">{LABELS.MEMBER_CLASS.YEAR_EMPTY}</p>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {LABELS.MEMBER_CLASS.ACADEMIC_YEAR} <span className="text-red-500">*</span>
            </label>
            <select
              value={academicYearId}
              onChange={(e) => {
                setAcademicYearId(e.target.value)
                setClassId('')
              }}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.academicYearId ? 'border-red-400' : 'border-slate-300'}`}
            >
              <option value="">{LABELS.MEMBER_CLASS.SELECT_YEAR}</option>
              {academicYears.map((y) => (
                <option key={y.id} value={y.id}>{y.name}</option>
              ))}
            </select>
            {errors.academicYearId && <p className="text-red-500 text-xs mt-1">{errors.academicYearId}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {LABELS.MEMBER_CLASS.CLASS} <span className="text-red-500">*</span>
            </label>
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.classId ? 'border-red-400' : 'border-slate-300'}`}
            >
              <option value="">{LABELS.MEMBER_CLASS.SELECT_CLASS}</option>
              {classesOfYear.map((c) => (
                <option key={c.id} value={c.id}>{c.displayName}</option>
              ))}
            </select>
            {errors.classId && <p className="text-red-500 text-xs mt-1">{errors.classId}</p>}
            {defaultYear && classesOfYear.length === 0 && (
              <p className="text-xs text-slate-400 mt-1">{LABELS.MEMBER_CLASS.CLASS_EMPTY} ({yearName(defaultYear)})</p>
            )}
          </div>
        </div>
      )}
    </Section>
  )
}
