import { useState } from 'react'
import { LABELS } from '../../utils/labels'
import type { AcademicYearDTO } from '../../types/dtos/academic'

interface AcademicYearFormProps {
  initial?: AcademicYearDTO | null
  onSubmit: (input: { name: string; startDate: string; endDate: string }) => Promise<void>
  onCancel: () => void
}

function toDateInputValue(iso: string | undefined): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

export default function AcademicYearForm({ initial, onSubmit, onCancel }: AcademicYearFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [startDate, setStartDate] = useState(toDateInputValue(initial?.startDate))
  const [endDate, setEndDate] = useState(toDateInputValue(initial?.endDate))
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError(LABELS.ACADEMIC_YEAR.NAME + ' wajib diisi.')
      return
    }
    if (!startDate) {
      setError(LABELS.ACADEMIC_YEAR.START_DATE + ' wajib diisi.')
      return
    }
    if (!endDate) {
      setError(LABELS.ACADEMIC_YEAR.END_DATE + ' wajib diisi.')
      return
    }
    if (new Date(endDate) < new Date(startDate)) {
      setError('Tanggal selesai tidak boleh sebelum tanggal mulai.')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      await onSubmit({
        name: name.trim(),
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString()
      })
    } catch {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          {LABELS.ACADEMIC_YEAR.NAME} <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${error && error.startsWith(LABELS.ACADEMIC_YEAR.NAME) ? 'border-red-400' : 'border-slate-300'}`}
          placeholder="Contoh: 2026/2027"
          autoFocus
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            {LABELS.ACADEMIC_YEAR.START_DATE} <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            {LABELS.ACADEMIC_YEAR.END_DATE} <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={false}
            disabled
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <span>{LABELS.FIELD.ACTIVE}</span>
        </label>
        <p className="text-slate-400 text-xs mt-1">
          Status aktif diubah melalui aksi &quot;Buka Tahun&quot; / &quot;Tutup Tahun&quot; pada daftar tahun ajaran.
        </p>
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
