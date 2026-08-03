import { useState } from 'react'
import { LABELS } from '../../utils/labels'
import { EDUCATION_LEVELS } from '../../shared/config/education-level'
import type { AcademicYearDTO, CurriculumDTO, ClassDTO } from '../../types/dtos/academic'

export interface ClassFormInput {
  academicYearId: string
  curriculumId: string
  educationLevel: string
  parallel: string
  homeroomTeacher?: string | null
  isActive: boolean
}

interface ClassFormProps {
  initial?: ClassDTO | null
  academicYears: AcademicYearDTO[]
  curricula: CurriculumDTO[]
  onSubmit: (input: ClassFormInput) => Promise<void>
  onCancel: () => void
}

const LEVEL_OPTIONS = Array.from(EDUCATION_LEVELS)

export default function ClassForm({ initial, academicYears, curricula, onSubmit, onCancel }: ClassFormProps) {
  const isEdit = !!initial
  const [academicYearId, setAcademicYearId] = useState(initial?.academicYearId ?? '')
  const [curriculumId, setCurriculumId] = useState(initial?.curriculumId ?? '')
  const [educationLevel, setEducationLevel] = useState(initial?.educationLevel ?? '')
  const [parallel, setParallel] = useState(initial?.parallel ?? '')
  const [homeroomTeacher, setHomeroomTeacher] = useState(initial?.homeroomTeacher ?? '')
  const [isActive, setIsActive] = useState(initial?.isActive ?? true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!academicYearId) {
      setError(LABELS.CLASS.YEAR + ' wajib diisi.')
      return
    }
    if (!curriculumId) {
      setError(LABELS.CLASS.CURRICULUM + ' wajib diisi.')
      return
    }
    if (!educationLevel) {
      setError(LABELS.CLASS.LEVEL + ' wajib diisi.')
      return
    }
    if (!parallel.trim()) {
      setError(LABELS.CLASS.PARALLEL + ' wajib diisi.')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      await onSubmit({
        academicYearId,
        curriculumId,
        educationLevel,
        parallel: parallel.trim(),
        homeroomTeacher: homeroomTeacher.trim() || null,
        isActive
      })
    } catch {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            {LABELS.CLASS.YEAR} <span className="text-red-500">*</span>
          </label>
          <select
            value={academicYearId}
            onChange={(e) => setAcademicYearId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{LABELS.CLASS.SELECT_YEAR}</option>
            {academicYears.map((ay) => (
              <option key={ay.id} value={ay.id}>{ay.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            {LABELS.CLASS.CURRICULUM} <span className="text-red-500">*</span>
          </label>
          <select
            value={curriculumId}
            onChange={(e) => setCurriculumId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{LABELS.CLASS.SELECT_CURRICULUM}</option>
            {curricula.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            {LABELS.CLASS.LEVEL} <span className="text-red-500">*</span>
          </label>
          <select
            value={educationLevel}
            onChange={(e) => setEducationLevel(e.target.value)}
            disabled={isEdit}
            className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${isEdit ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed' : 'border-slate-300'}`}
          >
            <option value="">{LABELS.CLASS.SELECT_LEVEL}</option>
            {LEVEL_OPTIONS.map((level) => (
              <option key={level} value={level}>{level}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            {LABELS.CLASS.PARALLEL} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={parallel}
            onChange={(e) => setParallel(e.target.value)}
            disabled={isEdit}
            className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${isEdit ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed' : 'border-slate-300'}`}
            placeholder="Contoh: MERDEKA 1"
          />
        </div>
      </div>

      {isEdit && (
        <p className="text-amber-600 text-xs">{LABELS.CLASS.IMMUTABLE_HINT}</p>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          {LABELS.CLASS.HOMEROOM_TEACHER}
        </label>
        <input
          type="text"
          value={homeroomTeacher}
          onChange={(e) => setHomeroomTeacher(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Contoh: Budi Santoso, S.Pd."
        />
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <span>{LABELS.FIELD.ACTIVE}</span>
        </label>
      </div>

      {error && <p className="text-red-500 text-xs">{error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {LABELS.MASTER.SAVE}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
        >
          {LABELS.MASTER.CANCEL}
        </button>
      </div>
    </form>
  )
}
