import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, Inbox } from 'lucide-react'
import { LABELS } from '../utils/labels'
import { receiptPreviewPath } from '../utils/navigation'

interface ActiveBorrowingRow {
  id: string
  borrowingNumber: string
  memberName: string
  memberNumber: string
  borrowDate: string
  dueDate: string
  totalItems: number
}

const PAGE_LIMIT = 100

export default function BorrowCardPrintPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<ActiveBorrowingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const active: ActiveBorrowingRow[] = []
        let page = 1
        for (;;) {
          const result = await window.electronAPI.borrowings.findMany('', page, PAGE_LIMIT)
          for (const row of result.data) {
            if (row.status === 'ACTIVE') {
              active.push(row)
            }
          }
          if (active.length >= result.total || page >= result.totalPages) break
          page += 1
        }
        if (!cancelled) setRows(active)
      } catch {
        if (!cancelled) setError(LABELS.BORROW_CARD_PRINT.ERROR)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const hasRows = rows.length > 0

  const formattedRows = useMemo(
    () =>
      rows.map((row) => ({
        ...row,
        borrowDateLabel: new Date(row.borrowDate).toLocaleDateString('id-ID'),
        dueDateLabel: new Date(row.dueDate).toLocaleDateString('id-ID'),
      })),
    [rows]
  )

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-1">{LABELS.BORROW_CARD_PRINT.TITLE}</h1>
      <p className="text-sm text-slate-500 mb-6">{LABELS.BORROW_CARD_PRINT.SUBTITLE}</p>

      {loading ? (
        <div className="text-sm text-slate-400">{LABELS.BORROW_CARD_PRINT.LOADING}</div>
      ) : error ? (
        <div className="text-sm text-red-600">{error}</div>
      ) : !hasRows ? (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-10 flex flex-col items-center text-center">
          <Inbox size={40} className="text-slate-300 mb-3" />
          <div className="text-sm font-medium text-slate-600">{LABELS.BORROW_CARD_PRINT.EMPTY}</div>
          <div className="text-xs text-slate-400 mt-1">{LABELS.BORROW_CARD_PRINT.EMPTY_DESC}</div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-slate-500 text-xs uppercase">
                <th className="text-left px-4 py-3 font-medium">{LABELS.BORROW_CARD_PRINT.COL_BORROW_DATE}</th>
                <th className="text-left px-4 py-3 font-medium">{LABELS.BORROW_CARD_PRINT.COL_NUMBER}</th>
                <th className="text-left px-4 py-3 font-medium">{LABELS.BORROW_CARD_PRINT.COL_MEMBER}</th>
                <th className="text-left px-4 py-3 font-medium">{LABELS.BORROW_CARD_PRINT.COL_MEMBER_NUMBER}</th>
                <th className="text-center px-4 py-3 font-medium">{LABELS.BORROW_CARD_PRINT.COL_ITEMS}</th>
                <th className="text-left px-4 py-3 font-medium">{LABELS.BORROW_CARD_PRINT.COL_DUE_DATE}</th>
                <th className="text-center px-4 py-3 font-medium">{LABELS.BORROW_CARD_PRINT.COL_ACTION}</th>
              </tr>
            </thead>
            <tbody>
              {formattedRows.map((row) => (
                <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-slate-700">{row.borrowDateLabel}</td>
                  <td className="px-4 py-2.5 text-slate-700 font-medium">{row.borrowingNumber}</td>
                  <td className="px-4 py-2.5 text-slate-700">{row.memberName}</td>
                  <td className="px-4 py-2.5 text-slate-500">{row.memberNumber}</td>
                  <td className="px-4 py-2.5 text-center text-slate-700">{row.totalItems}</td>
                  <td className="px-4 py-2.5 text-slate-700">{row.dueDateLabel}</td>
                  <td className="px-4 py-2.5 text-center">
                    <button
                      type="button"
                      onClick={() => navigate(receiptPreviewPath(row.id))}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Eye size={14} />
                      {LABELS.BORROW_CARD_PRINT.ACTION_PREVIEW}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
