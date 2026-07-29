import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import type { PublisherDTO } from '../../types/dtos/master'
import PublisherForm from '../../components/master/PublisherForm'
import { LABELS } from '../../constants/labels'

const api = window.electronAPI

export default function PublisherFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id

  const [publisher, setPublisher] = useState<PublisherDTO | null>(null)
  const [loading, setLoading] = useState(isEdit)

  useEffect(() => {
    if (id) {
      api.publishers.findById(id).then((data: PublisherDTO | null) => {
        setPublisher(data)
        setLoading(false)
      })
    }
  }, [id])

  async function handleSubmit(name: string) {
    try {
      if (isEdit && id) {
        await api.publishers.update(id, { name })
      } else {
        await api.publishers.create({ name })
      }
      navigate(-1)
    } catch (err: any) {
      alert(err.message)
    }
  }

  if (loading) {
    return <p className="text-slate-400 text-sm">{LABELS.PLACEHOLDER.LOADING}</p>
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 rounded hover:bg-slate-200 transition-colors text-slate-500"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-slate-800">
          {isEdit ? LABELS.MASTER.EDIT_PUBLISHER : LABELS.MASTER.NEW_PUBLISHER}
        </h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <PublisherForm
          initialName={publisher?.name}
          onSubmit={handleSubmit}
          onCancel={() => navigate(-1)}
        />
      </div>
    </div>
  )
}
