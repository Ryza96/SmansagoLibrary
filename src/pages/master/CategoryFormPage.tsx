import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import type { CategoryDTO } from '../../types/dtos/master'
import CategoryForm from '../../components/master/CategoryForm'
import { LABELS } from '../../utils/labels'

const api = window.electronAPI

export default function CategoryFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id

  const [category, setCategory] = useState<CategoryDTO | null>(null)
  const [loading, setLoading] = useState(isEdit)

  useEffect(() => {
    if (id) {
      api.categories.findById(id).then((data: CategoryDTO | null) => {
        setCategory(data)
        setLoading(false)
      })
    }
  }, [id])

  async function handleSubmit(code: string, name: string, description?: string) {
    try {
      if (isEdit && id) {
        await api.categories.update(id, { code, name, description: description ?? null })
      } else {
        await api.categories.create({ code, name, description })
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
          {isEdit ? LABELS.MASTER.EDIT_CATEGORY : LABELS.MASTER.NEW_CATEGORY}
        </h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <CategoryForm
          initialCode={category?.code}
          initialName={category?.name}
          initialDescription={category?.description ?? undefined}
          onSubmit={handleSubmit}
          onCancel={() => navigate(-1)}
        />
      </div>
    </div>
  )
}
