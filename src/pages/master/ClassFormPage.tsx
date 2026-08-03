import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import type { AcademicYearDTO, CurriculumDTO, ClassDTO } from '../../types/dtos/academic'
import ClassForm, { type ClassFormInput } from '../../components/master/ClassForm'
import { LABELS } from '../../utils/labels'

const api = window.electronAPI

export default function ClassFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id

  const [academicYears, setAcademicYears] = useState<AcademicYearDTO[]>([])
  const [curricula, setCurricula] = useState<CurriculumDTO[]>([])
  const [klass, setKlass] = useState<ClassDTO | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [yearsResult, curriculaResult] = await Promise.all([
        api.academicYears.findMany(),
        api.curricula.findMany()
      ])
      if (cancelled) return
      setAcademicYears(yearsResult.data)
      setCurricula(curriculaResult.data)
      if (id) {
        const data = await api.classes.findById(id)
        if (cancelled) return
        setKlass(data)
      }
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [id])

  async function handleSubmit(input: ClassFormInput) {
    try {
      if (isEdit && id) {
        await api.classes.update(id, {
          academicYearId: input.academicYearId,
          curriculumId: input.curriculumId,
          homeroomTeacher: input.homeroomTeacher,
          isActive: input.isActive
        })
      } else {
        await api.classes.create({
          academicYearId: input.academicYearId,
          curriculumId: input.curriculumId,
          educationLevel: input.educationLevel,
          parallel: input.parallel,
          homeroomTeacher: input.homeroomTeacher ?? undefined,
          isActive: input.isActive
        })
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
          {isEdit ? LABELS.CLASS.EDIT : LABELS.CLASS.NEW}
        </h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <ClassForm
          initial={klass}
          academicYears={academicYears}
          curricula={curricula}
          onSubmit={handleSubmit}
          onCancel={() => navigate(-1)}
        />
      </div>
    </div>
  )
}
