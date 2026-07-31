import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import type { AuthorDTO } from '../../types/dtos/master'
import MasterTable, { type Column } from '../../components/master/MasterTable'
import { LABELS } from '../../utils/labels'
import { ROUTES, authorEditPath } from '../../utils/navigation'

const api = window.electronAPI

export default function AuthorListPage() {
  const navigate = useNavigate()
  const [authors, setAuthors] = useState<AuthorDTO[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  async function fetchAuthors() {
    setLoading(true)
    try {
      const data = await api.authors.findMany({ search: search || undefined })
      setAuthors(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAuthors()
  }, [])

  const debouncedSearch = useMemo(() => {
    const timer = setTimeout(() => {
      if (search) {
        fetchAuthors()
      } else {
        fetchAuthors()
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    debouncedSearch()
  }, [debouncedSearch])

  async function handleDelete(author: AuthorDTO) {
    if (!window.confirm(LABELS.MASTER.CONFIRM_DELETE_AUTHOR)) return
    try {
      await api.authors.delete(author.id)
      setAuthors((prev) => prev.filter((a) => a.id !== author.id))
    } catch (err: any) {
      alert(err.message)
    }
  }

  const columns: Column<AuthorDTO>[] = [
    { key: 'name', label: LABELS.MASTER.NAME, render: (a) => a.name }
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
        <h1 className="text-2xl font-bold text-slate-800">{LABELS.MASTER.AUTHOR}</h1>
      </div>

      <MasterTable
        columns={columns}
        data={authors}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={LABELS.MASTER.SEARCH_AUTHOR}
        addLabel={LABELS.MASTER.NEW_AUTHOR}
        onAdd={() => navigate(ROUTES.MASTER_AUTHOR_NEW)}
        onEdit={(author) => navigate(authorEditPath(author.id))}
        onDelete={handleDelete}
        loading={loading}
      />
    </div>
  )
}
