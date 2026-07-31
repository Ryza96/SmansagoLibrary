import { useState } from 'react'
import { LABELS } from '../../utils/labels'

interface CategoryFormProps {
  initialCode?: string
  initialName?: string
  initialDescription?: string
  onSubmit: (code: string, name: string, description?: string) => Promise<void>
  onCancel: () => void
}

export default function CategoryForm({ initialCode, initialName, initialDescription, onSubmit, onCancel }: CategoryFormProps) {
  const [code, setCode] = useState(initialCode ?? '')
  const [name, setName] = useState(initialName ?? '')
  const [description, setDescription] = useState(initialDescription ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const newErrors: Record<string, string> = {}
    if (!code.trim()) newErrors.code = 'Kode wajib diisi.'
    if (!name.trim()) newErrors.name = 'Nama wajib diisi.'
    setErrors(newErrors)
    if (Object.keys(newErrors).length > 0) return

    setSubmitting(true)
    try {
      await onSubmit(code.trim(), name.trim(), description.trim() || undefined)
    } catch {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          {LABELS.MASTER.CODE} <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.code ? 'border-red-400' : 'border-slate-300'}`}
          autoFocus
        />
        {errors.code && <p className="text-red-500 text-xs mt-1">{errors.code}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          {LABELS.MASTER.NAME} <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.name ? 'border-red-400' : 'border-slate-300'}`}
        />
        {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{LABELS.MASTER.DESCRIPTION}</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>

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
