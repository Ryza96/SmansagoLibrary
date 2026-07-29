import { useState } from 'react'
import { LABELS } from '../../constants/labels'

interface PublisherFormProps {
  initialName?: string
  onSubmit: (name: string) => Promise<void>
  onCancel: () => void
}

export default function PublisherForm({ initialName, onSubmit, onCancel }: PublisherFormProps) {
  const [name, setName] = useState(initialName ?? '')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Nama penerbit wajib diisi.')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      await onSubmit(name.trim())
    } catch {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          {LABELS.MASTER.NAME} <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${error ? 'border-red-400' : 'border-slate-300'}`}
          autoFocus
        />
        {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
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
