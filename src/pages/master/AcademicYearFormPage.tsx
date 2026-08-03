import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import type { AcademicYearDTO } from '../../types/dtos/academic'
import AcademicYearForm from '../../components/master/AcademicYearForm'
import { LABELS } from '../../utils/labels'

const api = window.electronAPI

interface AcademicYearFormValue {
  name: string
  startDate: string
  endDate: string
  isActive: boolean
}

export default function AcademicYearFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id

  const [year, setYear] = useState<AcademicYearDTO | null>(null)
  const [loading, setLoading] = useState(isEdit)

  useEffect(() => {
    if (id) {
      api.academicYears.findById(id).then((data: AcademicYearDTO) => {
        setYear(data)
        setLoading(false)
      })
    }
  }, [id])

  async function handleSubmit(value: AcademicYearFormValue) {
    try {
      if (isEdit && id) {
        await api.academicYears.update(id, value)
      } else {
        await api.academicYears.create(value)
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
          {isEdit ? LABELS.ACADEMIC_YEAR.EDIT : LABELS.ACADEMIC_YEAR.NEW}
        </h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <AcademicYearForm
          initial={year}
          onSubmit={handleSubmit}
          onCancel={() => navigate(-1)}
        />
      </div>
    </div>
  )
}
