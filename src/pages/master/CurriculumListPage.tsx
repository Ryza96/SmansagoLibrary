import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import type { CurriculumDTO } from '../../types/dtos/academic'
import MasterTable, { type Column } from '../../components/master/MasterTable'
import { LABELS } from '../../utils/labels'
import { ROUTES, curriculumEditPath } from '../../utils/navigation'

const api = window.electronAPI

export default function CurriculumListPage() {
  const navigate = useNavigate()
  const [curricula, setCurricula] = useState<CurriculumDTO[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  async function fetchCurricula() {
    setLoading(true)
    try {
      const data = await api.curricula.findMany(search || undefined)
      setCurricula(data.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCurricula()
  }, [])

  const debouncedSearch = useMemo(() => {
    const timer = setTimeout(() => {
      fetchCurricula()
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    debouncedSearch()
  }, [debouncedSearch])

  async function handleDelete(curriculum: CurriculumDTO) {
    if (!window.confirm(LABELS.CURRICULUM.CONFIRM_DELETE)) return
    try {
      await api.curricula.delete(curriculum.id)
      setCurricula((prev) => prev.filter((c) => c.id !== curriculum.id))
    } catch (err: any) {
      alert(err.message)
    }
  }

  const columns: Column<CurriculumDTO>[] = [
    { key: 'name', label: LABELS.CURRICULUM.NAME, render: (c) => c.name }
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
        <h1 className="text-2xl font-bold text-slate-800">{LABELS.CURRICULUM.TITLE}</h1>
      </div>

      <MasterTable
        columns={columns}
        data={curricula}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={LABELS.CURRICULUM.SEARCH}
        addLabel={LABELS.CURRICULUM.NEW}
        onAdd={() => navigate(ROUTES.MASTER_CURRICULUM_NEW)}
        onEdit={(curriculum) => navigate(curriculumEditPath(curriculum.id))}
        onDelete={handleDelete}
        loading={loading}
      />
    </div>
  )
}
