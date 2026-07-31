import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import type { CategoryDTO } from '../../types/dtos/master'
import MasterTable, { type Column } from '../../components/master/MasterTable'
import { LABELS } from '../../utils/labels'
import { ROUTES, categoryEditPath } from '../../utils/navigation'

const api = window.electronAPI

export default function CategoryListPage() {
  const navigate = useNavigate()
  const [categories, setCategories] = useState<CategoryDTO[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  async function fetchCategories() {
    setLoading(true)
    try {
      const data = await api.categories.findMany({ search: search || undefined })
      setCategories(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCategories()
  }, [])

  const debouncedSearch = useMemo(() => {
    const timer = setTimeout(() => {
      fetchCategories()
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    debouncedSearch()
  }, [debouncedSearch])

  async function handleDelete(category: CategoryDTO) {
    if (!window.confirm(LABELS.MASTER.CONFIRM_DELETE_CATEGORY)) return
    try {
      await api.categories.delete(category.id)
      setCategories((prev) => prev.filter((c) => c.id !== category.id))
    } catch (err: any) {
      alert(err.message)
    }
  }

  const columns: Column<CategoryDTO>[] = [
    { key: 'code', label: LABELS.MASTER.CODE, render: (c) => c.code },
    { key: 'name', label: LABELS.MASTER.NAME, render: (c) => c.name }
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
        <h1 className="text-2xl font-bold text-slate-800">{LABELS.MASTER.CATEGORY}</h1>
      </div>

      <MasterTable
        columns={columns}
        data={categories}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={LABELS.MASTER.SEARCH_CATEGORY}
        addLabel={LABELS.MASTER.NEW_CATEGORY}
        onAdd={() => navigate(ROUTES.MASTER_CATEGORY_NEW)}
        onEdit={(cat) => navigate(categoryEditPath(cat.id))}
        onDelete={handleDelete}
        loading={loading}
      />
    </div>
  )
}
