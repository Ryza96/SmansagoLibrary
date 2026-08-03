import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import type { CurriculumDTO } from '../../types/dtos/academic'
import CurriculumForm from '../../components/master/CurriculumForm'
import { LABELS } from '../../utils/labels'

const api = window.electronAPI

export default function CurriculumFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id

  const [curriculum, setCurriculum] = useState<CurriculumDTO | null>(null)
  const [loading, setLoading] = useState(isEdit)

  useEffect(() => {
    if (id) {
      api.curricula.findById(id).then((data: CurriculumDTO | null) => {
        setCurriculum(data)
        setLoading(false)
      })
    }
  }, [id])

  async function handleSubmit(name: string) {
    try {
      if (isEdit && id) {
        await api.curricula.update(id, { name })
      } else {
        await api.curricula.create({ name })
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
          {isEdit ? LABELS.CURRICULUM.EDIT : LABELS.CURRICULUM.NEW}
        </h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <CurriculumForm
          initialName={curriculum?.name}
          onSubmit={handleSubmit}
          onCancel={() => navigate(-1)}
        />
      </div>
    </div>
  )
}
