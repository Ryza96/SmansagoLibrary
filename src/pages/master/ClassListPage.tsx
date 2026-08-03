import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import type { ClassDTO, AcademicYearDTO, CurriculumDTO } from '../../types/dtos/academic'
import MasterTable, { type Column } from '../../components/master/MasterTable'
import { LABELS } from '../../utils/labels'
import { ROUTES, classEditPath } from '../../utils/navigation'

const api = window.electronAPI

const FETCH_ALL_LIMIT = 100

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

export default function ClassListPage() {
  const navigate = useNavigate()
  const [classes, setClasses] = useState<ClassDTO[]>([])
  const [academicYears, setAcademicYears] = useState<AcademicYearDTO[]>([])
  const [curricula, setCurricula] = useState<CurriculumDTO[]>([])
  const [yearFilter, setYearFilter] = useState('')
  const [curriculumFilter, setCurriculumFilter] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  async function fetchData() {
    setLoading(true)
    try {
      const [years, curriculums, allClasses] = await Promise.all([
        api.academicYears.findMany(),
        api.curricula.findMany(),
        fetchAllClasses()
      ])
      setAcademicYears(years.data)
      setCurricula(curriculums.data)
      setClasses(allClasses)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const yearNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const year of academicYears) map.set(year.id, year.name)
    return map
  }, [academicYears])

  const curriculumNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const curriculum of curricula) map.set(curriculum.id, curriculum.name)
    return map
  }, [curricula])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return classes.filter((klass) => {
      if (yearFilter && klass.academicYearId !== yearFilter) return false
      if (curriculumFilter && klass.curriculumId !== curriculumFilter) return false
      if (needle) {
        const haystack = `${klass.educationLevel} ${klass.parallel}`.toLowerCase()
        if (!haystack.includes(needle)) return false
      }
      return true
    })
  }, [classes, yearFilter, curriculumFilter, search])

  async function handleDelete(klass: ClassDTO) {
    if (!window.confirm(LABELS.CLASS.CONFIRM_DELETE)) return
    try {
      await api.classes.delete(klass.id)
      setClasses((prev) => prev.filter((c) => c.id !== klass.id))
    } catch (err: any) {
      alert(err.message)
    }
  }

  const columns: Column<ClassDTO>[] = [
    { key: 'displayName', label: 'Kelas', render: (c) => c.displayName },
    {
      key: 'academicYearId',
      label: LABELS.CLASS.YEAR,
      render: (c) => yearNameById.get(c.academicYearId) ?? '—'
    },
    {
      key: 'curriculumId',
      label: LABELS.CLASS.CURRICULUM,
      render: (c) => curriculumNameById.get(c.curriculumId) ?? '—'
    },
    {
      key: 'homeroomTeacher',
      label: LABELS.CLASS.HOMEROOM_TEACHER,
      render: (c) => c.homeroomTeacher ?? '—'
    },
    {
      key: 'isActive',
      label: LABELS.FIELD.STATUS,
      render: (c) =>
        c.isActive ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
            {LABELS.FIELD.ACTIVE}
          </span>
        ) : (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
            {LABELS.FIELD.INACTIVE}
          </span>
        )
    }
  ]

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 rounded hover:bg-slate-200 transition-colors text-slate-500"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-slate-800">{LABELS.CLASS.TITLE}</h1>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">{LABELS.CLASS.ALL_YEARS}</option>
          {academicYears.map((year) => (
            <option key={year.id} value={year.id}>{year.name}</option>
          ))}
        </select>
        <select
          value={curriculumFilter}
          onChange={(e) => setCurriculumFilter(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">{LABELS.CLASS.ALL_CURRICULA}</option>
          {curricula.map((curriculum) => (
            <option key={curriculum.id} value={curriculum.id}>{curriculum.name}</option>
          ))}
        </select>
      </div>

      <MasterTable
        columns={columns}
        data={filtered}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={LABELS.CLASS.SEARCH}
        addLabel={LABELS.CLASS.NEW}
        onAdd={() => navigate(ROUTES.MASTER_CLASS_NEW)}
        onEdit={(klass) => navigate(classEditPath(klass.id))}
        onDelete={handleDelete}
        loading={loading}
      />
    </div>
  )
}
