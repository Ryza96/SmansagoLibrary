import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { LABELS } from '../../utils/labels'
import { StatusBadge } from './PromotionHistoryPage'
import type { PromotionOutcome, PromotionRunDTO, PromotionRunSummaryCounts } from '../../shared/dto/promotion'

const api = window.electronAPI

const OUTCOME_LABEL: Record<string, string> = {
  PROMOTED: LABELS.PROMOTION.OUTCOME_PROMOTED,
  REPEATED: LABELS.PROMOTION.OUTCOME_REPEATED,
  REDISTRIBUTED: LABELS.PROMOTION.OUTCOME_REDISTRIBUTED,
  GRADUATED: LABELS.PROMOTION.OUTCOME_GRADUATED,
  NO_TARGET: LABELS.PROMOTION.OUTCOME_NO_TARGET,
  ERROR: LABELS.PROMOTION.OUTCOME_ERROR
}

const MODE_LABEL: Record<string, string> = {
  AUTOMATIC: LABELS.PROMOTION.MODE_AUTOMATIC,
  MAPPING: LABELS.PROMOTION.MODE_MAPPING,
  BULK_EDIT: LABELS.PROMOTION.MODE_BULK_EDIT
}

function outcomeLabel(outcome: PromotionOutcome): string {
  return OUTCOME_LABEL[outcome] ?? outcome
}

function modeLabel(mode: string): string {
  return MODE_LABEL[mode] ?? mode
}

function formatDateTime(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString('id-ID') : '-'
}

const COUNT_ROWS: { key: keyof PromotionRunSummaryCounts; label: string; tone: string }[] = [
  { key: 'promoted', label: LABELS.PROMOTION.HEADER_PROMOTED, tone: 'bg-blue-50 text-blue-700' },
  { key: 'graduated', label: LABELS.PROMOTION.HEADER_GRADUATED, tone: 'bg-emerald-50 text-emerald-700' },
  { key: 'repeated', label: LABELS.PROMOTION.HEADER_REPEATED, tone: 'bg-amber-50 text-amber-700' },
  { key: 'redistributed', label: LABELS.PROMOTION.HEADER_REDISTRIBUTED, tone: 'bg-violet-50 text-violet-700' },
  { key: 'transferred', label: LABELS.PROMOTION.HEADER_TRANSFERRED, tone: 'bg-cyan-50 text-cyan-700' },
  { key: 'dropped', label: LABELS.PROMOTION.HEADER_DROPPED, tone: 'bg-rose-50 text-rose-700' },
  { key: 'noTarget', label: LABELS.PROMOTION.HEADER_NO_TARGET, tone: 'bg-slate-100 text-slate-600' },
  { key: 'error', label: LABELS.PROMOTION.HEADER_ERROR, tone: 'bg-red-50 text-red-700' }
]

export default function PromotionRunDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [run, setRun] = useState<PromotionRunDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!id) return
      setLoading(true)
      setError(false)
      try {
        const data = await api.promotions.findById(id)
        if (cancelled) return
        setRun(data)
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
  }, [id])

  if (loading) {
    return <p className="text-slate-400 text-sm">{LABELS.PROMOTION.LOADING}</p>
  }

  if (error || !run) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm font-medium text-slate-600 mb-4">{LABELS.PROMOTION.ERROR}</p>
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
        >
          <ArrowLeft size={16} />
          {LABELS.PROMOTION.BACK_TO_LIST}
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-start gap-4 mb-6">
        <button
          onClick={() => navigate('/promotions')}
          className="p-1.5 rounded hover:bg-slate-200 transition-colors text-slate-500 mt-1"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-0.5">
            <span>{LABELS.PROMOTION.TITLE}</span>
            <span className="text-slate-300">/</span>
            <span className="text-blue-600 font-medium">{LABELS.PROMOTION.DETAIL_TITLE}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">{LABELS.PROMOTION.DETAIL_TITLE}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{LABELS.PROMOTION.DETAIL_SUBTITLE}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm mb-4">
          <div>
            <p className="text-slate-500 text-xs mb-0.5">{LABELS.PROMOTION.HEADER_RUN}</p>
            <p className="text-slate-800 font-medium font-mono text-xs">{run.id}</p>
          </div>
          <div>
            <p className="text-slate-500 text-xs mb-0.5">{LABELS.PROMOTION.HEADER_ACADEMIC_YEAR}</p>
            <p className="text-slate-800 font-medium">{`${run.fromYearName} → ${run.toYearName}`}</p>
          </div>
          <div>
            <p className="text-slate-500 text-xs mb-0.5">{LABELS.PROMOTION.HEADER_DATE}</p>
            <p className="text-slate-800 font-medium">{formatDateTime(run.startedAt)}</p>
          </div>
          <div>
            <p className="text-slate-500 text-xs mb-0.5">{LABELS.PROMOTION.HEADER_TOTAL}</p>
            <p className="text-slate-800 font-medium tabular-nums">{run.items.length}</p>
          </div>
          <div>
            <p className="text-slate-500 text-xs mb-0.5">Mode</p>
            <p className="text-slate-800 font-medium">{modeLabel(run.mode)}</p>
          </div>
          <div>
            <p className="text-slate-500 text-xs mb-0.5">{LABELS.PROMOTION.HEADER_STATUS}</p>
            <StatusBadge status={run.status} />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {COUNT_ROWS.map((row) => (
            <div key={row.key} className={`rounded-lg px-3 py-2.5 ${row.tone}`}>
              <p className="text-2xl font-bold tabular-nums">{run.counts[row.key]}</p>
              <p className="text-xs font-medium mt-0.5">{row.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 text-sm font-medium text-slate-700">
          {LABELS.PROMOTION.DETAIL_ITEMS}
          <span className="ml-2 text-slate-400 font-normal">({run.items.length})</span>
        </div>
        {run.items.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-12">{LABELS.PROMOTION.DETAIL_ITEM_EMPTY}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="px-4 py-3 font-medium whitespace-nowrap">{LABELS.PROMOTION.ITEM_HEADER_MEMBER}</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">{LABELS.PROMOTION.ITEM_HEADER_SOURCE_CLASS}</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">{LABELS.PROMOTION.ITEM_HEADER_TARGET_CLASS}</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">{LABELS.PROMOTION.ITEM_HEADER_OUTCOME}</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">{LABELS.PROMOTION.ITEM_HEADER_MESSAGE}</th>
                </tr>
              </thead>
              <tbody>
                {run.items.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-800 font-medium whitespace-nowrap">{item.memberName}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{item.sourceClassLabel ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{item.targetClassLabel ?? '-'}</td>
                    <td className="px-4 py-3">
                      <OutcomeBadge outcome={item.outcome} />
                    </td>
                    <td className="px-4 py-3 text-slate-500 max-w-[280px] truncate" title={item.message ?? undefined}>
                      {item.message ?? '-'}
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

function OutcomeBadge({ outcome }: { outcome: PromotionOutcome }) {
  const tone =
    outcome === 'PROMOTED'
      ? 'bg-blue-100 text-blue-700'
      : outcome === 'GRADUATED'
        ? 'bg-emerald-100 text-emerald-700'
        : outcome === 'REPEATED'
          ? 'bg-amber-100 text-amber-700'
          : outcome === 'REDISTRIBUTED'
            ? 'bg-violet-100 text-violet-700'
            : outcome === 'ERROR'
              ? 'bg-red-100 text-red-700'
              : 'bg-slate-100 text-slate-600'
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${tone}`}>
      {outcomeLabel(outcome)}
    </span>
  )
}
