import { useState, useEffect } from 'react'
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Undo2,
  CheckCircle2,
  TriangleAlert,
  CalendarDays
} from 'lucide-react'
import type { ReturnReportDTO, ReturnStatus } from '../../shared/dto/report'
import { LABELS } from '../../utils/labels'

const api = window.electronAPI

// Konversi nilai input date (YYYY-MM-DD) menjadi ISO string berdasarkan tengah
// malam WAKTU LOKAL sehingga batas periode selalu pada hari kalender yang sama.
function toFilterDate(value: string): string {
  return value ? new Date(`${value}T00:00:00`).toISOString() : ''
}

function formatReportDate(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const STATUS_BADGE: Record<ReturnStatus, { label: string; className: string }> = {
  ON_TIME: { label: LABELS.REPORT.ON_TIME, className: 'bg-emerald-100 text-emerald-700' },
  LATE: { label: LABELS.REPORT.LATE, className: 'bg-rose-100 text-rose-700' },
}

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  color: string
}

function StatCard({ icon, label, value, color }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4">
      <div className={`p-3 rounded-lg shrink-0 ${color}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-sm text-slate-500">{label}</p>
        <p className="text-xl font-bold text-slate-800 mt-0.5">{value}</p>
      </div>
    </div>
  )
}

export default function ReturnReportPage() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState<ReturnReportDTO | null>(null)

  const limit = 20

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.reports
      .returns({
        from: toFilterDate(from),
        to: toFilterDate(to),
        search: search || undefined,
        page,
        limit,
      })
      .then((result) => {
        if (!cancelled) setReport(result)
      })
      .catch(() => {
        if (!cancelled) setReport(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [from, to, search, page])

  const summary = report?.summary
  const totalPages = report?.pagination.totalPages ?? 1

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{LABELS.REPORT.RETURNS}</h1>
        <p className="text-sm text-slate-500 mt-1">{LABELS.REPORT.RETURNS_DESC}</p>
      </div>

      {/* ── FILTER BAR ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
              <CalendarDays size={12} />
              {LABELS.REPORT.FROM}
            </span>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value)
                setPage(1)
              }}
              className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
              <CalendarDays size={12} />
              {LABELS.REPORT.TO}
            </span>
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value)
                setPage(1)
              }}
              className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <div className="block">
            <span className="text-xs font-medium text-slate-500">{LABELS.REPORT.SEARCH_LABEL}</span>
            <div className="relative mt-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                placeholder={LABELS.REPORT.SEARCH}
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── STAT CARDS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <StatCard
          icon={<Undo2 size={20} />}
          label={LABELS.REPORT.TOTAL_RETURNS}
          value={loading ? '...' : summary?.total ?? '—'}
          color="text-blue-600 bg-blue-50"
        />
        <StatCard
          icon={<CheckCircle2 size={20} />}
          label={LABELS.REPORT.ON_TIME}
          value={loading ? '...' : summary?.onTime ?? '—'}
          color="text-emerald-600 bg-emerald-50"
        />
        <StatCard
          icon={<TriangleAlert size={20} />}
          label={LABELS.REPORT.LATE}
          value={loading ? '...' : summary?.late ?? '—'}
          color="text-rose-600 bg-rose-50"
        />
      </div>

      {/* ── TABLE ── */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200">
        <div className="p-4">
          {loading ? (
            <p className="text-slate-400 text-sm text-center py-8">{LABELS.PLACEHOLDER.LOADING}</p>
          ) : !report || report.rows.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">{LABELS.PLACEHOLDER.NO_DATA}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="pb-3 font-medium">{LABELS.REPORT.COL_RETURN_DATE}</th>
                    <th className="pb-3 font-medium">{LABELS.REPORT.COL_NUMBER}</th>
                    <th className="pb-3 font-medium">{LABELS.REPORT.COL_MEMBER}</th>
                    <th className="pb-3 font-medium">{LABELS.REPORT.COL_CLASS}</th>
                    <th className="pb-3 font-medium">{LABELS.REPORT.COL_TITLE}</th>
                    <th className="pb-3 font-medium">{LABELS.REPORT.COL_DURATION}</th>
                    <th className="pb-3 font-medium">{LABELS.REPORT.COL_STATUS}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row, idx) => (
                    <tr key={`${row.borrowNumber}-${idx}`} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 text-slate-600 whitespace-nowrap">{formatReportDate(row.returnedAt)}</td>
                      <td className="py-3 text-slate-700 font-medium">{row.borrowNumber}</td>
                      <td className="py-3 text-slate-700">
                        <span className="text-slate-500">{row.memberNumber}</span> · {row.memberName}
                      </td>
                      <td className="py-3 text-slate-600">{row.className ?? '—'}</td>
                      <td className="py-3 text-slate-600 max-w-xs truncate">{row.bookTitle}</td>
                      <td className="py-3 text-slate-600 whitespace-nowrap">
                        {row.durationDays} {LABELS.REPORT.DAYS}
                      </td>
                      <td className="py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[row.status].className}`}>
                          {STATUS_BADGE[row.status].label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {report && report.pagination.total > 0 && (
            <div className="flex items-center justify-between pt-4 border-t border-slate-200 mt-4">
              <p className="text-sm text-slate-500">
                Total {report.pagination.total} pengembalian
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page <= 1}
                  className="p-1.5 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="px-2 py-1 text-sm text-slate-600">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={page >= totalPages}
                  className="p-1.5 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
