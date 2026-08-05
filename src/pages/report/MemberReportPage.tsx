import { useState, useEffect } from 'react'
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Users,
  UserCheck,
  UserX,
  CalendarDays,
  GraduationCap
} from 'lucide-react'
import type { MemberReportDTO } from '../../shared/dto/report'
import type { ClassDTO } from '../../shared/dto/academic'
import { LABELS } from '../../utils/labels'

const api = window.electronAPI

const FETCH_ALL_LIMIT = 100

async function fetchAllClasses(): Promise<ClassDTO[]> {
  const all: ClassDTO[] = []
  let page = 1
  for (;;) {
    const result = await api.classes.findMany(undefined, page, FETCH_ALL_LIMIT)
    all.push(...result.data)
    if (all.length >= result.total) break
    page += 1
  }
  return all
}

function formatReportDate(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const STATUS_BADGE: Record<'ACTIVE' | 'INACTIVE', { label: string; className: string }> = {
  ACTIVE: { label: LABELS.REPORT.MEMBERSHIP_ACTIVE, className: 'bg-emerald-100 text-emerald-700' },
  INACTIVE: { label: LABELS.REPORT.MEMBERSHIP_INACTIVE, className: 'bg-slate-100 text-slate-600' },
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

export default function MemberReportPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'' | 'ACTIVE' | 'INACTIVE'>('')
  const [classId, setClassId] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState<MemberReportDTO | null>(null)
  const [classes, setClasses] = useState<ClassDTO[]>([])

  const limit = 20

  useEffect(() => {
    let cancelled = false
    fetchAllClasses()
      .then((data) => {
        if (!cancelled) setClasses(data)
      })
      .catch(() => {
        if (!cancelled) setClasses([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.reports
      .members({
        search: search || undefined,
        status: status || undefined,
        classId: classId || undefined,
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
  }, [search, status, classId, page])

  const summary = report?.summary
  const totalPages = report?.pagination.totalPages ?? 1

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{LABELS.REPORT.MEMBERS}</h1>
        <p className="text-sm text-slate-500 mt-1">{LABELS.REPORT.MEMBERS_DESC}</p>
      </div>

      {/* ── FILTER BAR ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
              <Users size={12} />
              {LABELS.REPORT.MEMBERSHIP_STATUS}
            </span>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as '' | 'ACTIVE' | 'INACTIVE')
                setPage(1)
              }}
              className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">{LABELS.REPORT.MEMBERSHIP_ALL}</option>
              <option value="ACTIVE">{LABELS.REPORT.MEMBERSHIP_ACTIVE}</option>
              <option value="INACTIVE">{LABELS.REPORT.MEMBERSHIP_INACTIVE}</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
              <GraduationCap size={12} />
              {LABELS.REPORT.CLASS_FILTER}
            </span>
            <select
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value)
                setPage(1)
              }}
              className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">{LABELS.REPORT.CLASS_ALL}</option>
              {classes.map((klass) => (
                <option key={klass.id} value={klass.id}>
                  {klass.displayName}
                </option>
              ))}
            </select>
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
                placeholder={LABELS.REPORT.SEARCH_MEMBER}
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── STAT CARDS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <StatCard
          icon={<Users size={20} />}
          label={LABELS.REPORT.TOTAL_MEMBERS}
          value={loading ? '...' : report?.pagination.total ?? '—'}
          color="text-blue-600 bg-blue-50"
        />
        <StatCard
          icon={<UserCheck size={20} />}
          label={LABELS.REPORT.MEMBERSHIP_ACTIVE}
          value={loading ? '...' : summary?.active ?? '—'}
          color="text-emerald-600 bg-emerald-50"
        />
        <StatCard
          icon={<UserX size={20} />}
          label={LABELS.REPORT.MEMBERSHIP_INACTIVE}
          value={loading ? '...' : summary?.nonActive ?? '—'}
          color="text-slate-600 bg-slate-100"
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
                    <th className="pb-3 font-medium">{LABELS.REPORT.COL_MEMBER_NUMBER}</th>
                    <th className="pb-3 font-medium">{LABELS.REPORT.COL_NAME}</th>
                    <th className="pb-3 font-medium">{LABELS.REPORT.COL_CLASS}</th>
                    <th className="pb-3 font-medium">{LABELS.REPORT.MEMBERSHIP_STATUS}</th>
                    <th className="pb-3 font-medium">{LABELS.REPORT.COL_JOINED}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => (
                    <tr key={row.memberNumber} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 text-slate-600 font-medium whitespace-nowrap">{row.memberNumber}</td>
                      <td className="py-3 text-slate-700">{row.fullName}</td>
                      <td className="py-3 text-slate-600">{row.className ?? '—'}</td>
                      <td className="py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[row.membershipStatus].className}`}>
                          {STATUS_BADGE[row.membershipStatus].label}
                        </span>
                      </td>
                      <td className="py-3 text-slate-600 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays size={13} className="text-slate-400" />
                          {formatReportDate(row.joinedAt)}
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
                Total {report.pagination.total} anggota
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
