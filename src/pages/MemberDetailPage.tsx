import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Pencil, Printer, CheckCircle, BookOpen, BookX, Clock, User, GraduationCap, type LucideIcon } from 'lucide-react'
import { LABELS } from '../utils/labels'
import { memberEditPath, enrollmentHistoryPath } from '../utils/navigation'
import type { MemberDTO } from '../shared/dto/member'
import { memberTypeLabel, memberBorrowRights, type MemberBorrowRights } from '../shared/config/member-type'

const api = window.electronAPI

const TAB_IDS = ['info', 'borrowing', 'fine', 'activity'] as const
type TabId = (typeof TAB_IDS)[number]

const TAB_OPTIONS: { id: TabId; label: string }[] = [
  { id: 'info', label: LABELS.MEMBER_TAB.INFO },
  { id: 'borrowing', label: LABELS.MEMBER_TAB.BORROWING },
  { id: 'fine', label: LABELS.MEMBER_TAB.FINE },
  { id: 'activity', label: LABELS.MEMBER_TAB.ACTIVITY },
]

const GENDER_LABEL: Record<string, string> = {
  male: 'Laki-laki',
  female: 'Perempuan'
}

interface MemberView {
  id: string
  name: string
  number: string
  memberType: string
  memberTypeLabel: string
  genderLabel: string
  birthplace: string
  birthDate: string
  phone: string
  email: string
  statusLabel: string
  statusActive: boolean
  joinDate: string
  classLabel: string
  address: string
}

interface BorrowingRow {
  id: string
  borrowingNumber: string
  borrowDate: string
  dueDate: string
  status: 'ACTIVE' | 'COMPLETED'
  totalItems: number
}

function formatDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleDateString('id-ID') : '-'
}

function toView(member: MemberDTO): MemberView {
  const statusActive = member.status.toLowerCase() === 'active'
  return {
    id: member.id,
    name: member.fullName,
    number: member.memberNumber,
    memberType: member.memberType ?? '',
    memberTypeLabel: memberTypeLabel(member.memberType) ?? member.memberType ?? '-',
    genderLabel: GENDER_LABEL[member.gender ?? ''] ?? member.gender ?? '-',
    birthplace: member.birthPlace ?? '-',
    birthDate: formatDate(member.birthDate),
    phone: member.phone ?? '-',
    email: member.email ?? '-',
    statusLabel: statusActive ? LABELS.FIELD.ACTIVE : LABELS.FIELD.INACTIVE,
    statusActive,
    joinDate: formatDate(member.createdAt),
    classLabel: member.classInfo ? `${member.classInfo.educationLevel} ${member.classInfo.parallel}` : '-',
    address: member.address ?? '-'
  }
}

export default function MemberDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabId>('info')
  const [member, setMember] = useState<MemberView | null>(null)
  const [borrowings, setBorrowings] = useState<BorrowingRow[]>([])
  const [totalBorrowed, setTotalBorrowed] = useState(0)
  const [activeBookCount, setActiveBookCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [photoUri, setPhotoUri] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!id) return
      setLoading(true)
      setNotFound(false)
      try {
        const m = await api.members.findById(id)
        if (cancelled) return
        setMember(toView(m))
        if (m.photoPath) {
          api.members.getPhotoDataUri(m.id).then((uri) => {
            if (!cancelled) setPhotoUri(uri)
          })
        }
        const [borrowResult, stats] = await Promise.all([
          api.borrowings.findMany(m.memberNumber, 1, 50),
          api.borrowings.getMemberBorrowingStats(m.id).catch(() => null)
        ])
        if (cancelled) return
        const rows = borrowResult.data.filter((b) => b.memberNumber === m.memberNumber)
        setBorrowings(rows)
        setTotalBorrowed(rows.length)
        setActiveBookCount(stats?.activeBookCount ?? 0)
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
    return <NotFoundState onBack={() => navigate(-1)} />
  }

  const rights: MemberBorrowRights | null = memberBorrowRights(member.memberType)

  return (
    <div>
      <Header member={member} onEdit={() => navigate(memberEditPath(member.id))} onBack={() => navigate(-1)} onHistory={() => navigate(enrollmentHistoryPath(member.id))} />
      <ProfileSection member={member} photoUri={photoUri} />
      <div className="flex gap-6">
        <div className="flex-1 min-w-0">
          <TabBar tabs={TAB_OPTIONS} active={activeTab} onChange={(id) => setActiveTab(id)} />
          <div className="mt-6">
            {activeTab === 'info' && <InfoTab member={member} />}
            {activeTab === 'borrowing' &&
              (borrowings.length === 0 ? (
                <EmptyState icon={BookOpen} title={LABELS.MEMBER.NO_BORROWING_HISTORY} description={LABELS.MEMBER.NO_BORROWING_HISTORY_DESC} />
              ) : (
                <BorrowingTab rows={borrowings} />
              ))}
            {activeTab === 'fine' && <EmptyState icon={BookX} title={LABELS.MEMBER.NO_FINE_HISTORY} description={LABELS.MEMBER.NO_FINE_HISTORY_DESC} />}
            {activeTab === 'activity' && <ActivityTab member={member} />}
          </div>
        </div>
        <div className="w-80 flex-shrink-0 space-y-6">
          <StatusCard member={member} />
          <RightsCard rights={rights} />
          <StatisticsCard activeBookCount={activeBookCount} totalBorrowed={totalBorrowed} />
        </div>
      </div>
    </div>
  )
}

function NotFoundState({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-sm font-medium text-slate-600 mb-4">Anggota tidak ditemukan.</p>
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
      >
        <ArrowLeft size={16} />
        Kembali
      </button>
    </div>
  )
}

function Header({ member, onEdit, onBack, onHistory }: { member: MemberView; onEdit: () => void; onBack: () => void; onHistory: () => void }) {
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
          <span className="text-slate-800 font-medium">{member.name}</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-800">{member.name}</h1>
        <p className="text-sm text-slate-500 mt-0.5">{`${LABELS.FIELD.MEMBER_NUMBER}: ${member.number}`}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={onHistory}
          className="flex items-center gap-1.5 px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
        >
          <GraduationCap size={16} />
          {LABELS.ENROLLMENT_HISTORY.NEW}
        </button>
        <button
          type="button"
          onClick={() => alert('Fitur Cetak Kartu belum tersedia.')}
          className="flex items-center gap-1.5 px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
        >
          <Printer size={16} />
          {LABELS.MEMBER.PRINT_CARD}
        </button>
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Pencil size={16} />
          {LABELS.MEMBER.EDIT}
        </button>
      </div>
    </div>
  )
}

function ProfileSection({ member, photoUri }: { member: MemberView; photoUri: string | null }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
      <div className="flex gap-6">
        <div className="w-24 h-24 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {photoUri ? (
            <img src={photoUri} alt="Foto Anggota" className="w-full h-full object-cover" />
          ) : (
            <User size={40} className="text-slate-400" />
          )}
        </div>
        <div className="flex-1 grid grid-cols-3 gap-x-8 gap-y-3">
          <SummaryField label={LABELS.FIELD.FULL_NAME} value={member.name} />
          <SummaryField label={LABELS.FIELD.MEMBER_NUMBER} value={member.number} />
          <SummaryField label={LABELS.FIELD.MEMBER_TYPE} value={member.memberTypeLabel} />
          <SummaryField
            label={LABELS.FIELD.MEMBERSHIP_STATUS}
            value={<StatusBadge status={member.statusLabel} active={member.statusActive} />}
          />
          <SummaryField label={LABELS.FIELD.JOIN_DATE} value={member.joinDate} />
          <SummaryField label="Kelas" value={member.classLabel} />
        </div>
      </div>
    </div>
  )
}

function SummaryField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      <div className="text-sm font-medium text-slate-800">{value}</div>
    </div>
  )
}

function StatusBadge({ status, active }: { status: string; active: boolean }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
      }`}
    >
      {status}
    </span>
  )
}

function TabBar({ tabs, active, onChange }: { tabs: { id: TabId; label: string }[]; active: TabId; onChange: (id: TabId) => void }) {
  return (
    <div className="border-b border-slate-200">
      <div className="flex gap-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              active === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function SectionCard({ title, onEdit, children }: { title: string; onEdit?: () => void; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-slate-800">{title}</h2>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            <Pencil size={12} />
            {LABELS.ACTION.EDIT}
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

function InfoTab({ member }: { member: MemberView }) {
  return (
    <div className="space-y-5">
      <SectionCard title={LABELS.MEMBER_SECTION.PERSONAL} onEdit={() => alert('Fitur edit data pribadi belum tersedia.')}>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          <InfoField label={LABELS.FIELD.FULL_NAME} value={member.name} />
          <InfoField label={LABELS.FIELD.GENDER} value={member.genderLabel} />
          <InfoField label={LABELS.FIELD.BIRTHPLACE} value={member.birthplace} />
          <InfoField label={LABELS.FIELD.BIRTH_DATE} value={member.birthDate} />
          <InfoField label={LABELS.FIELD.PHONE} value={member.phone} />
          <InfoField label={LABELS.FIELD.EMAIL} value={member.email} />
        </div>
      </SectionCard>
      <SectionCard title={LABELS.MEMBER_SECTION.ADDRESS} onEdit={() => alert('Fitur edit alamat belum tersedia.')}>
        <InfoField label={LABELS.FIELD.ADDRESS} value={member.address} />
      </SectionCard>
    </div>
  )
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      <p className="text-sm text-slate-800">{value}</p>
    </div>
  )
}

function BorrowingTab({ rows }: { rows: BorrowingRow[] }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="px-4 py-3 font-medium">Nomor</th>
            <th className="px-4 py-3 font-medium">Tgl Pinjam</th>
            <th className="px-4 py-3 font-medium">Jatuh Tempo</th>
            <th className="px-4 py-3 font-medium">Jumlah</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-50">
              <td className="px-4 py-3 text-slate-700">{b.borrowingNumber}</td>
              <td className="px-4 py-3 text-slate-600">{formatDate(b.borrowDate)}</td>
              <td className="px-4 py-3 text-slate-600">{formatDate(b.dueDate)}</td>
              <td className="px-4 py-3 text-slate-700">{b.totalItems}</td>
              <td className="px-4 py-3">
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                  b.status === 'ACTIVE' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                }`}>
                  {b.status === 'ACTIVE' ? 'Berjalan' : 'Selesai'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EmptyState({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center mb-4">
        <Icon size={28} className="text-slate-300" />
      </div>
      <p className="text-sm font-medium text-slate-600 mb-1">{title}</p>
      <p className="text-xs text-slate-400 max-w-xs">{description}</p>
    </div>
  )
}

function ActivityTab({ member }: { member: MemberView }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
      <h2 className="text-base font-semibold text-slate-800 mb-5">{LABELS.MEMBER_TAB.ACTIVITY}</h2>
      <div className="space-y-0">
        <TimelineItem
          icon={<CheckCircle size={14} className="text-blue-600" />}
          title={LABELS.MEMBER.CREATED}
          date={member.joinDate}
        />
      </div>
    </div>
  )
}

function TimelineItem({ icon, title, date }: { icon: React.ReactNode; title: string; date: string }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <div className="w-px flex-1 bg-slate-200 min-h-[24px]" />
      </div>
      <div className="pb-1">
        <p className="text-sm font-medium text-slate-800">{title}</p>
        <p className="text-xs text-slate-400 mt-0.5">{date}</p>
      </div>
    </div>
  )
}

function StatusCard({ member }: { member: MemberView }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
      <h2 className="text-sm font-semibold text-slate-800 mb-4">{LABELS.MEMBER.STATUS_MEMBERSHIP}</h2>
      <div className="space-y-3">
        <SidebarField label={LABELS.FIELD.MEMBERSHIP_STATUS} value={<StatusBadge status={member.statusLabel} active={member.statusActive} />} />
        <SidebarField label={LABELS.FIELD.JOIN_DATE} value={member.joinDate} />
      </div>
    </div>
  )
}

function RightsCard({ rights }: { rights: MemberBorrowRights | null }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
      <h2 className="text-sm font-semibold text-slate-800 mb-4">{LABELS.MEMBER_SECTION.RIGHTS}</h2>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">{LABELS.FIELD.MAX_BOOKS}</span>
          <span className="text-sm font-semibold text-slate-800">{rights ? `${rights.maxBooks} ${LABELS.FIELD.TIMES}` : '-'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">{LABELS.FIELD.MAX_DAYS}</span>
          <span className="text-sm font-semibold text-slate-800">{rights ? `${rights.maxDays} ${LABELS.FIELD.DAYS}` : '-'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">{LABELS.FIELD.EXTENSIONS}</span>
          <span className="text-sm font-semibold text-slate-800">{rights ? rights.extensions : '-'}</span>
        </div>
      </div>
    </div>
  )
}

function StatisticsCard({ activeBookCount, totalBorrowed }: { activeBookCount: number; totalBorrowed: number }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
      <h2 className="text-sm font-semibold text-slate-800 mb-4">{LABELS.MEMBER.STATISTICS}</h2>
      <div className="space-y-3">
        <StatRow icon={BookOpen} label={LABELS.MEMBER.CURRENTLY_BORROWED} value={String(activeBookCount)} />
        <StatRow icon={Clock} label={LABELS.MEMBER.TOTAL_BORROWED} value={String(totalBorrowed)} />
        <StatRow icon={BookX} label={LABELS.MEMBER.LATE_RETURNS} value="0" />
      </div>
    </div>
  )
}

function StatRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center flex-shrink-0">
        <Icon size={16} className="text-slate-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
      </div>
      <span className="text-sm font-semibold text-slate-800">{value}</span>
    </div>
  )
}

function SidebarField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      <div className="text-sm text-slate-800">{value}</div>
    </div>
  )
}
