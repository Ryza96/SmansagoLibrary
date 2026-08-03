import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import type { AcademicYearDTO } from '../../types/dtos/academic'
import MasterTable, { type Column } from '../../components/master/MasterTable'
import { LABELS } from '../../utils/labels'
import { ROUTES, academicYearEditPath } from '../../utils/navigation'

const api = window.electronAPI

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('id-ID')
}

export default function AcademicYearListPage() {
  const navigate = useNavigate()
  const [years, setYears] = useState<AcademicYearDTO[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  async function fetchYears() {
    setLoading(true)
    try {
      const data = await api.academicYears.findMany(search || undefined)
      setYears(data.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchYears()
  }, [])

  const debouncedSearch = useMemo(() => {
    const timer = setTimeout(() => {
      fetchYears()
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    debouncedSearch()
  }, [debouncedSearch])

  async function handleDelete(year: AcademicYearDTO) {
    if (!window.confirm(LABELS.ACADEMIC_YEAR.CONFIRM_DELETE)) return
    try {
      await api.academicYears.delete(year.id)
      setYears((prev) => prev.filter((y) => y.id !== year.id))
    } catch (err: any) {
      alert(err.message)
    }
  }

  async function handleActivate(year: AcademicYearDTO) {
    if (!window.confirm(LABELS.ACADEMIC_YEAR.ACTIVATE_CONFIRM)) return
    try {
      await api.academicYears.activate(year.id)
      alert(LABELS.ACADEMIC_YEAR.ACTIVATED)
      fetchYears()
    } catch (err: any) {
      alert(err.message)
    }
  }

  async function handleDeactivate(year: AcademicYearDTO) {
    if (!window.confirm(LABELS.ACADEMIC_YEAR.DEACTIVATE_CONFIRM)) return
    try {
      await api.academicYears.deactivate(year.id)
      alert(LABELS.ACADEMIC_YEAR.DEACTIVATED)
      fetchYears()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const columns: Column<AcademicYearDTO>[] = [
    { key: 'name', label: LABELS.ACADEMIC_YEAR.NAME, render: (y) => y.name },
    { key: 'startDate', label: LABELS.ACADEMIC_YEAR.START_DATE, render: (y) => formatDate(y.startDate) },
    { key: 'endDate', label: LABELS.ACADEMIC_YEAR.END_DATE, render: (y) => formatDate(y.endDate) },
    {
      key: 'isActive',
      label: LABELS.ACADEMIC_YEAR.STATUS,
      render: (y) =>
        y.isActive ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
            {LABELS.FIELD.ACTIVE}
          </span>
        ) : (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
            {LABELS.FIELD.INACTIVE}
          </span>
        )
    },
    {
      key: 'transition',
      label: '',
      render: (y) =>
        y.isActive ? (
          <button
            onClick={() => handleDeactivate(y)}
            className="px-2 py-1 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
          >
            {LABELS.ACADEMIC_YEAR.DEACTIVATE}
          </button>
        ) : (
          <button
            onClick={() => handleActivate(y)}
            className="px-2 py-1 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
          >
            {LABELS.ACADEMIC_YEAR.ACTIVATE}
          </button>
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
        <h1 className="text-2xl font-bold text-slate-800">{LABELS.ACADEMIC_YEAR.TITLE}</h1>
      </div>

      <MasterTable
        columns={columns}
        data={years}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={LABELS.ACADEMIC_YEAR.SEARCH}
        addLabel={LABELS.ACADEMIC_YEAR.NEW}
        onAdd={() => navigate(ROUTES.MASTER_ACADEMIC_YEAR_NEW)}
        onEdit={(year) => navigate(academicYearEditPath(year.id))}
        onDelete={handleDelete}
        loading={loading}
      />
    </div>
  )
}
