import { LABELS } from '../../utils/labels'
import Section from './Section'

interface MembershipSectionProps {
  memberNumber: string
  isEditMode: boolean
  memberType: string
  setMemberType: (v: string) => void
  status: string
  setStatus: (v: string) => void
  joinDate: string
  validUntil: string
  setValidUntil: (v: string) => void
  errors: Record<string, string>
  readonlyMemberType?: boolean
}

export default function MembershipSection({
  memberNumber,
  isEditMode,
  memberType, setMemberType,
  status, setStatus,
  joinDate,
  validUntil, setValidUntil,
  errors,
  readonlyMemberType
}: MembershipSectionProps) {
  return (
    <Section title={LABELS.MEMBER_SECTION.MEMBERSHIP}>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{LABELS.FIELD.MEMBER_NUMBER}</label>
        <input
          type="text"
          value={isEditMode ? memberNumber : LABELS.PLACEHOLDER.MEMBER_NUMBER}
          disabled
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-400 cursor-not-allowed"
        />
        {!isEditMode && <p className="text-xs text-slate-400 mt-1">{LABELS.MEMBER_NUMBER_INFO}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            {LABELS.FIELD.MEMBER_TYPE} <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            <select
              value={memberType}
              onChange={(e) => setMemberType(e.target.value)}
              disabled={readonlyMemberType}
              className={`flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.memberType ? 'border-red-400' : 'border-slate-300'} ${readonlyMemberType ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : ''}`}
            >
              <option value="">Pilih tipe anggota</option>
              {LABELS.MEMBER_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => alert('Fitur tambah tipe anggota belum tersedia.')}
              className="px-3 py-2 border border-slate-300 rounded-lg text-slate-500 hover:bg-slate-50 transition-colors"
              title="Tambah Tipe Anggota Baru"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>
          {errors.memberType && <p className="text-red-500 text-xs mt-1">{errors.memberType}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{LABELS.FIELD.MEMBERSHIP_STATUS}</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {LABELS.MEMBER_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{LABELS.FIELD.JOIN_DATE}</label>
          <input
            type="date"
            value={joinDate}
            disabled
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-400 cursor-not-allowed"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{LABELS.FIELD.VALID_UNTIL}</label>
          <input
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
    </Section>
  )
}
