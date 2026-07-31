import { useState } from 'react'
import { Plus, Trash2, AlertTriangle } from 'lucide-react'
import { BookDetailDTO, BookCopyDTO, CreateBookCopiesDTO } from '../../types/dtos/book'
import { LABELS } from '../../utils/labels'

interface BookDetailProps {
  book: BookDetailDTO
  copies: BookCopyDTO[]
  onAddCopies: (input: CreateBookCopiesDTO) => Promise<void>
  onDecommissionCopy: (id: string) => Promise<void>
}

const STATUS_STYLES: Record<string, string> = {
  AVAILABLE: 'bg-green-100 text-green-700',
  BORROWED: 'bg-blue-100 text-blue-700',
  LOST: 'bg-red-100 text-red-700',
  REMOVED: 'bg-slate-100 text-slate-400 line-through',
}

function conditionLabel(condition: string): string {
  const map = LABELS.COPY.CONDITION_MAP as Record<string, string>
  return map[condition] ?? condition
}

export default function BookDetail({ book, copies, onAddCopies, onDecommissionCopy }: BookDetailProps) {
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const [shelfLocation, setShelfLocation] = useState('')
  const [condition, setCondition] = useState('GOOD')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleAdd() {
    if (!shelfLocation.trim()) {
      setError('Lokasi rak wajib diisi.')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      await onAddCopies({
        quantity,
        shelfLocation: shelfLocation.trim(),
        condition
      })
      setShowAddDialog(false)
      setQuantity(1)
      setShelfLocation('')
      setCondition('GOOD')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDecommission(copy: BookCopyDTO) {
    const msg = copy.hasBorrowingHistory
      ? LABELS.COPY.CONFIRM_DECOMMISSION_WITH_HISTORY
      : LABELS.COPY.CONFIRM_DECOMMISSION
    if (!window.confirm(msg)) return
    await onDecommissionCopy(copy.id)
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Informasi Buku</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          <div>
            <h3 className="text-sm font-medium text-slate-500 mb-1">{LABELS.FIELD.TITLE}</h3>
            <p className="text-slate-800">{book.title}</p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-slate-500 mb-1">{LABELS.FIELD.ISBN}</h3>
            <p className="text-slate-800">{book.isbn ?? '-'}</p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-slate-500 mb-1">{LABELS.FIELD.CATEGORY}</h3>
            <p className="text-slate-800">{book.category?.name ?? '-'}</p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-slate-500 mb-1">{LABELS.FIELD.PUBLISHER}</h3>
            <p className="text-slate-800">{book.publisher?.name ?? '-'}</p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-slate-500 mb-1">{LABELS.FIELD.AUTHORS}</h3>
            <p className="text-slate-800">
              {book.authors.length === 0 ? '-' : book.authors.map((a) => a.name).join(', ')}
            </p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-slate-500 mb-1">{LABELS.FIELD.YEAR}</h3>
            <p className="text-slate-800">{book.publicationYear ?? '-'}</p>
          </div>
          {book.edition && (
            <div>
              <h3 className="text-sm font-medium text-slate-500 mb-1">{LABELS.FIELD.EDITION}</h3>
              <p className="text-slate-800">{book.edition}</p>
            </div>
          )}
          {book.language && (
            <div>
              <h3 className="text-sm font-medium text-slate-500 mb-1">{LABELS.FIELD.LANGUAGE}</h3>
              <p className="text-slate-800">{book.language}</p>
            </div>
          )}
          {book.pageCount && (
            <div>
              <h3 className="text-sm font-medium text-slate-500 mb-1">{LABELS.FIELD.PAGE_COUNT}</h3>
              <p className="text-slate-800">{book.pageCount}</p>
            </div>
          )}
        </div>
        {book.description && (
          <div className="mt-4">
            <h3 className="text-sm font-medium text-slate-500 mb-1">{LABELS.FIELD.DESCRIPTION}</h3>
            <p className="text-slate-700 whitespace-pre-wrap">{book.description}</p>
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800">
            {LABELS.COPY.TITLE} ({copies.length})
          </h2>
          <button
            onClick={() => setShowAddDialog(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} />
            {LABELS.COPY.ADD}
          </button>
        </div>

        {copies.length === 0 ? (
          <p className="text-slate-400 text-sm py-8 text-center">{LABELS.COPY.NO_COPIES}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-left">
                  <th className="pb-3 font-medium pr-4">{LABELS.COPY.INVENTORY_NUMBER}</th>
                  <th className="pb-3 font-medium pr-4">{LABELS.COPY.BARCODE}</th>
                  <th className="pb-3 font-medium pr-4">{LABELS.COPY.SHELF_LOCATION}</th>
                  <th className="pb-3 font-medium pr-4">{LABELS.COPY.CONDITION}</th>
                  <th className="pb-3 font-medium pr-4">{LABELS.COPY.STATUS}</th>
                  <th className="pb-3 font-medium">{LABELS.FIELD.ACTIONS}</th>
                </tr>
              </thead>
              <tbody>
                {copies.map((copy) => (
                  <tr key={copy.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="py-3 pr-4 font-mono text-slate-800">{copy.inventoryNumber}</td>
                    <td className="py-3 pr-4 font-mono text-slate-600 text-xs">{copy.barcode}</td>
                    <td className="py-3 pr-4 text-slate-500">{copy.shelfLocation}</td>
                    <td className="py-3 pr-4 text-slate-500">{conditionLabel(copy.condition)}</td>
                    <td className="py-3 pr-4">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_STYLES[copy.status] ?? 'bg-slate-100 text-slate-600'}`}>
                        {copy.status}
                      </span>
                    </td>
                    <td className="py-3">
                      <button
                        onClick={() => handleDecommission(copy)}
                        className="p-1.5 rounded hover:bg-slate-200 transition-colors text-slate-500 hover:text-red-600"
                        title={LABELS.COPY.DECOMMISSION}
                      >
                        {copy.hasBorrowingHistory ? <AlertTriangle size={16} /> : <Trash2 size={16} />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showAddDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">{LABELS.COPY.ADD_TITLE}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {LABELS.COPY.QUANTITY} <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  min={1}
                  max={100}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {LABELS.COPY.SHELF_LOCATION} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={shelfLocation}
                  onChange={(e) => setShelfLocation(e.target.value)}
                  placeholder="Contoh: Rak A - 01"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {LABELS.COPY.CONDITION_INITIAL}
                </label>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="GOOD">{LABELS.COPY.CONDITION_MAP.GOOD}</option>
                  <option value="LIGHT_DAMAGE">{LABELS.COPY.CONDITION_MAP.LIGHT_DAMAGE}</option>
                  <option value="HEAVY_DAMAGE">{LABELS.COPY.CONDITION_MAP.HEAVY_DAMAGE}</option>
                </select>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-slate-400">{LABELS.COPY.BARCODE_AUTO}</p>
                <p className="text-xs text-slate-400">{LABELS.COPY.INV_AUTO}</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-200">
              <button
                onClick={() => { setShowAddDialog(false); setError(''); }}
                className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
              >
                {LABELS.BOOK.CANCEL}
              </button>
              <button
                onClick={handleAdd}
                disabled={submitting}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {submitting ? LABELS.COPY.CREATING : LABELS.COPY.ADD}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
