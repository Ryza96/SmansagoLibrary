import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import type { PublisherDTO } from '../../types/dtos/master'
import MasterTable, { type Column } from '../../components/master/MasterTable'
import { LABELS } from '../../constants/labels'
import { ROUTES, publisherEditPath } from '../../config/navigation'

const api = (window as any).electronAPI

export default function PublisherListPage() {
  const navigate = useNavigate()
  const [publishers, setPublishers] = useState<PublisherDTO[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  async function fetchPublishers() {
    setLoading(true)
    try {
      const data = await api.publishers.findMany({ search: search || undefined })
      setPublishers(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPublishers()
  }, [])

  const debouncedSearch = useMemo(() => {
    const timer = setTimeout(() => {
      fetchPublishers()
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    debouncedSearch()
  }, [debouncedSearch])

  async function handleDelete(publisher: PublisherDTO) {
    if (!window.confirm(LABELS.MASTER.CONFIRM_DELETE_PUBLISHER)) return
    try {
      await api.publishers.delete(publisher.id)
      setPublishers((prev) => prev.filter((p) => p.id !== publisher.id))
    } catch (err: any) {
      alert(err.message)
    }
  }

  const columns: Column<PublisherDTO>[] = [
    { key: 'name', label: LABELS.MASTER.NAME, render: (p) => p.name }
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
        <h1 className="text-2xl font-bold text-slate-800">{LABELS.MASTER.PUBLISHER}</h1>
      </div>

      <MasterTable
        columns={columns}
        data={publishers}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={LABELS.MASTER.SEARCH_PUBLISHER}
        addLabel={LABELS.MASTER.NEW_PUBLISHER}
        onAdd={() => navigate(ROUTES.MASTER_PUBLISHER_NEW)}
        onEdit={(pub) => navigate(publisherEditPath(pub.id))}
        onDelete={handleDelete}
        loading={loading}
      />
    </div>
  )
}
