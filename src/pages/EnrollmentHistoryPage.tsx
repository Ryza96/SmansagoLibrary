import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronDown, ChevronRight, GraduationCap } from 'lucide-react'
import { LABELS } from '../utils/labels'
import { memberDetailPath } from '../utils/navigation'
import { memberTypeLabel } from '../shared/config/member-type'
import type { MemberDTO } from '../shared/dto/member'
import type { EnrollmentDTO } from '../shared/dto/enrollment'

const api = window.electronAPI

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: LABELS.ENROLLMENT_HISTORY.ACTIVE,
  PROMOTED: LABELS.ENROLLMENT_HISTORY.PROMOTED,
  REPEATED: LABELS.ENROLLMENT_HISTORY.REPEATED,
  REDISTRIBUTED: LABELS.ENROLLMENT_HISTORY.REDISTRIBUTED,
  TRANSFERRED: LABELS.ENROLLMENT_HISTORY.TRANSFERRED,
  DROPPED: LABELS.ENROLLMENT_HISTORY.DROPPED,
  GRADUATED: LABELS.ENROLLMENT_HISTORY.GRADUATED,
}

function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status
}

function formatDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleDateString('id-ID') : '-'
}

function formatDateTime(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString('id-ID') : '-'
}

export default function EnrollmentHistoryPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [member, setMember] = useState<MemberDTO | null>(null)
  const [rows, setRows] = useState<EnrollmentDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!id) return
      setLoading(true)
      setNotFound(false)
      try {
        const [m, h] = await Promise.all([
          api.members.findById(id),
          api.enrollments.historyByMember(id)
        ])
        if (cancelled) return
        setMember(m)
        setRows(h)
      } catch {
        if (!cancelled) setNotFound(true)
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
    return <p className="text-slate-400 text-sm">{LABELS.PLACEHOLDER.LOADING}</p>
  }

  if (notFound || !member) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm font-medium text-slate-600 mb-4">{LABELS.ENROLLMENT_HISTORY.SUBTITLE}</p>
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
        >
          <ArrowLeft size={16} />
          Kembali
        </button>
      </div>
    )
  }

  return (
    <div>
      <Header
        member={member}
        onBack={() => navigate(memberDetailPath(member.id))}
      />
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-4 py-3 font-medium w-8" />
              <th className="px-4 py-3 font-medium">{LABELS.ENROLLMENT_HISTORY.HEADER_ACADEMIC_YEAR}</th>
              <th className="px-4 py-3 font-medium">{LABELS.ENROLLMENT_HISTORY.HEADER_CURRICULUM}</th>
              <th className="px-4 py-3 font-medium">{LABELS.ENROLLMENT_HISTORY.HEADER_CLASS}</th>
              <th className="px-4 py-3 font-medium">{LABELS.ENROLLMENT_HISTORY.HEADER_STATUS}</th>
              <th className="px-4 py-3 font-medium">{LABELS.ENROLLMENT_HISTORY.HEADER_JOINED_AT}</th>
              <th className="px-4 py-3 font-medium">{LABELS.ENROLLMENT_HISTORY.HEADER_LEFT_AT}</th>
              <th className="px-4 py-3 font-medium">{LABELS.ENROLLMENT_HISTORY.HEADER_NOTE}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-16 text-center">
                  <div className="flex flex-col items-center">
                    <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                      <GraduationCap size={28} className="text-slate-300" />
                    </div>
                    <p className="text-sm font-medium text-slate-600 mb-1">{LABELS.ENROLLMENT_HISTORY.EMPTY}</p>
                    <p className="text-xs text-slate-400 max-w-xs">{LABELS.ENROLLMENT_HISTORY.EMPTY_DESC}</p>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <HistoryRow
                  key={row.id}
                  row={row}
                  expanded={expanded === row.id}
                  onToggle={() => setExpanded(expanded === row.id ? null : row.id)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Header({ member, onBack }: { member: MemberDTO; onBack: () => void }) {
  const memberType = memberTypeLabel(member.memberType) ?? member.memberType ?? '-'
  return (
    <div className="flex items-start gap-4 mb-6">
      <button
        onClick={onBack}
        className="p-1.5 rounded hover:bg-slate-200 transition-colors text-slate-500 mt-1"
      >
        <ArrowLeft size={20} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-0.5">
          <span>{LABELS.MEMBER.TITLE}</span>
          <span className="text-slate-300">/</span>
          <span className="text-slate-800 font-medium">{member.fullName}</span>
          <span className="text-slate-300">/</span>
          <span className="text-blue-600 font-medium">{LABELS.ENROLLMENT_HISTORY.NEW}</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-800">{LABELS.ENROLLMENT_HISTORY.TITLE}</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {`${LABELS.FIELD.MEMBER_NUMBER}: ${member.memberNumber} · ${memberType}`}
        </p>
      </div>
    </div>
  )
}

function HistoryRow({ row, expanded, onToggle }: { row: EnrollmentDTO; expanded: boolean; onToggle: () => void }) {
  const active = row.status === 'ACTIVE'
  return (
    <>
      <tr className="border-b border-slate-100 hover:bg-slate-50">
        <td className="px-4 py-3">
          <button
            onClick={onToggle}
            className="p-1 rounded hover:bg-slate-100 text-slate-400"
            aria-label={LABELS.ENROLLMENT_HISTORY.DETAIL}
          >
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        </td>
        <td className="px-4 py-3 text-slate-700">{row.academicYearName}</td>
        <td className="px-4 py-3 text-slate-600">{row.curriculumName ?? '-'}</td>
        <td className="px-4 py-3 text-slate-700">{row.className}</td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {statusLabel(row.status)}
          </span>
        </td>
        <td className="px-4 py-3 text-slate-600">{formatDate(row.enrolledAt)}</td>
        <td className="px-4 py-3 text-slate-600">{formatDate(row.leftAt)}</td>
        <td className="px-4 py-3 text-slate-600 max-w-[220px] truncate" title={row.note ?? undefined}>
          {row.note ?? '-'}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50 border-b border-slate-100">
          <td />
          <td colSpan={7} className="px-4 py-3">
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
              <DetailField label={LABELS.ENROLLMENT_HISTORY.DETAIL_CREATED_AT} value={formatDateTime(row.createdAt)} />
              <DetailField label={LABELS.ENROLLMENT_HISTORY.DETAIL_UPDATED_AT} value={formatDateTime(row.updatedAt)} />
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-slate-500 mb-0.5">{label}</p>
      <p className="text-slate-800 font-medium">{value}</p>
    </div>
  )
}
