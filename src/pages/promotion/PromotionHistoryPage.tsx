import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { TrendingUp } from 'lucide-react'
import { LABELS } from '../../utils/labels'
import { promotionDetailPath } from '../../utils/navigation'
import type { PromotionRunListItemDTO } from '../../shared/dto/promotion'

const api = window.electronAPI

const STATUS_LABEL: Record<string, string> = {
  SUCCESS: LABELS.PROMOTION.STATUS_SUCCESS,
  PARTIAL: LABELS.PROMOTION.STATUS_PARTIAL,
  FAILED: LABELS.PROMOTION.STATUS_FAILED
}

function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status
}

function formatDateTime(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString('id-ID') : '-'
}

export default function PromotionHistoryPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<PromotionRunListItemDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(false)
      try {
        const result = await api.promotions.findMany()
        if (cancelled) return
        setRows(result.data)
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return <p className="text-slate-400 text-sm">{LABELS.PROMOTION.LOADING}</p>
  }

  if (error) {
    return <p className="text-red-500 text-sm">{LABELS.PROMOTION.ERROR}</p>
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 rounded hover:bg-slate-200 transition-colors text-slate-500"
        >
          <span className="sr-only">Kembali</span>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{LABELS.PROMOTION.TITLE}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{LABELS.PROMOTION.SUBTITLE}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center mb-4">
              <TrendingUp size={28} className="text-slate-300" />
            </div>
            <p className="text-sm font-medium text-slate-600 mb-1">{LABELS.PROMOTION.EMPTY}</p>
            <p className="text-xs text-slate-400 max-w-xs">{LABELS.PROMOTION.EMPTY_DESC}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="px-4 py-3 font-medium whitespace-nowrap">{LABELS.PROMOTION.HEADER_RUN}</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">{LABELS.PROMOTION.HEADER_ACADEMIC_YEAR}</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">{LABELS.PROMOTION.HEADER_DATE}</th>
                  <th className="px-4 py-3 font-medium text-right whitespace-nowrap">{LABELS.PROMOTION.HEADER_TOTAL}</th>
                  <th className="px-4 py-3 font-medium text-right whitespace-nowrap">{LABELS.PROMOTION.HEADER_PROMOTED}</th>
                  <th className="px-4 py-3 font-medium text-right whitespace-nowrap">{LABELS.PROMOTION.HEADER_GRADUATED}</th>
                  <th className="px-4 py-3 font-medium text-right whitespace-nowrap">{LABELS.PROMOTION.HEADER_REPEATED}</th>
                  <th className="px-4 py-3 font-medium text-right whitespace-nowrap">{LABELS.PROMOTION.HEADER_REDISTRIBUTED}</th>
                  <th className="px-4 py-3 font-medium text-right whitespace-nowrap">{LABELS.PROMOTION.HEADER_TRANSFERRED}</th>
                  <th className="px-4 py-3 font-medium text-right whitespace-nowrap">{LABELS.PROMOTION.HEADER_DROPPED}</th>
                  <th className="px-4 py-3 font-medium text-right whitespace-nowrap">{LABELS.PROMOTION.HEADER_NO_TARGET}</th>
                  <th className="px-4 py-3 font-medium text-right whitespace-nowrap">{LABELS.PROMOTION.HEADER_ERROR}</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">{LABELS.PROMOTION.HEADER_STATUS}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => navigate(promotionDetailPath(row.id))}
                    className="border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 text-slate-700 font-mono text-xs">{row.id.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{`${row.fromYearName} → ${row.toYearName}`}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatDateTime(row.startedAt)}</td>
                    <td className="px-4 py-3 text-slate-700 text-right tabular-nums">{row.itemCount}</td>
                    <td className="px-4 py-3 text-slate-700 text-right tabular-nums">{row.counts.promoted}</td>
                    <td className="px-4 py-3 text-slate-700 text-right tabular-nums">{row.counts.graduated}</td>
                    <td className="px-4 py-3 text-slate-700 text-right tabular-nums">{row.counts.repeated}</td>
                    <td className="px-4 py-3 text-slate-700 text-right tabular-nums">{row.counts.redistributed}</td>
                    <td className="px-4 py-3 text-slate-700 text-right tabular-nums">{row.counts.transferred}</td>
                    <td className="px-4 py-3 text-slate-700 text-right tabular-nums">{row.counts.dropped}</td>
                    <td className="px-4 py-3 text-slate-700 text-right tabular-nums">{row.counts.noTarget}</td>
                    <td className="px-4 py-3 text-red-600 text-right tabular-nums">{row.counts.error}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'SUCCESS'
      ? 'bg-green-100 text-green-700'
      : status === 'FAILED'
        ? 'bg-red-100 text-red-700'
        : 'bg-amber-100 text-amber-700'
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${tone}`}>
      {statusLabel(status)}
    </span>
  )
}
