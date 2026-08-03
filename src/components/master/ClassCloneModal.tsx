import { useState } from 'react'
import { X, Loader2, Copy } from 'lucide-react'
import type { AcademicYearDTO } from '../../types/dtos/academic'
import type { CloneClassResult } from '../../shared/dto/academic'
import { LABELS } from '../../utils/labels'

const api = window.electronAPI

interface ClassCloneModalProps {
  academicYears: AcademicYearDTO[]
  onClose: () => void
  onCloned: () => void
}

export default function ClassCloneModal({ academicYears, onClose, onCloned }: ClassCloneModalProps) {
  const [sourceYearId, setSourceYearId] = useState('')
  const [targetYearId, setTargetYearId] = useState('')
  const [cloning, setCloning] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<CloneClassResult | null>(null)

  async function handleClone(e: React.FormEvent) {
    e.preventDefault()
    if (!sourceYearId || !targetYearId) {
      setError('Tahun sumber dan tahun target wajib dipilih.')
      return
    }
    if (sourceYearId === targetYearId) {
      setError('Tahun sumber dan target tidak boleh sama.')
      return
    }
    setError('')
    setCloning(true)
    setResult(null)
    try {
      const res = await api.classes.cloneToYear(sourceYearId, targetYearId)
      setResult(res)
      onCloned()
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan.')
    } finally {
      setCloning(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="text-base font-semibold text-slate-800">{LABELS.CLASS.CLONE_TITLE}</h3>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-400">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleClone} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {LABELS.CLASS.CLONE_SOURCE_YEAR} <span className="text-red-500">*</span>
            </label>
            <select
              value={sourceYearId}
              onChange={(e) => setSourceYearId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{LABELS.CLASS.SELECT_YEAR}</option>
              {academicYears.map((year) => (
                <option key={year.id} value={year.id}>{year.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {LABELS.CLASS.CLONE_TARGET_YEAR} <span className="text-red-500">*</span>
            </label>
            <select
              value={targetYearId}
              onChange={(e) => setTargetYearId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{LABELS.CLASS.SELECT_YEAR}</option>
              {academicYears.map((year) => (
                <option key={year.id} value={year.id}>{year.name}</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-slate-500">{LABELS.CLASS.CLONE_NOTE}</p>
          {error && <p className="text-red-500 text-xs">{error}</p>}
          {result && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {result.created} {LABELS.CLASS.CLONE_RESULT_CREATED} · {result.skipped} {LABELS.CLASS.CLONE_RESULT_SKIPPED}
            </div>
          )}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={cloning}
              className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              {result ? LABELS.CLASS.CLONE_CLOSING : 'Batal'}
            </button>
            {!result && (
              <button
                type="submit"
                disabled={cloning}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {cloning ? <Loader2 size={16} className="animate-spin" /> : <Copy size={16} />}
                {cloning ? 'Meng-clone...' : LABELS.CLASS.CLONE_RUN}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
