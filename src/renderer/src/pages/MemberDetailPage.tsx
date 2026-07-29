import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Pencil, Printer, CheckCircle, BookOpen, BookX, Clock, User, type LucideIcon } from 'lucide-react'
import { LABELS } from '../constants/labels'
import { memberEditPath } from '../config/navigation'

const TAB_IDS = ['info', 'borrowing', 'fine', 'activity'] as const
type TabId = (typeof TAB_IDS)[number]

const TAB_OPTIONS: { id: TabId; label: string }[] = [
  { id: 'info', label: LABELS.MEMBER_TAB.INFO },
  { id: 'borrowing', label: LABELS.MEMBER_TAB.BORROWING },
  { id: 'fine', label: LABELS.MEMBER_TAB.FINE },
  { id: 'activity', label: LABELS.MEMBER_TAB.ACTIVITY },
]

const MOCK_MEMBER = {
  id: '1',
  number: 'AGT-000001',
  name: 'Andi Pratama',
  gender: 'Laki-laki',
  birthplace: 'Jakarta',
  birthDate: '15 Juni 2005',
  phone: '0812-3456-7890',
  email: 'andi.pratama@email.com',
  memberType: 'student' as const,
  memberTypeLabel: 'Siswa',
  status: 'active' as const,
  statusLabel: 'Aktif',
  joinDate: '15 Juli 2025',
  validUntil: '15 Juli 2026',
  address: 'Jl. Merpati No. 10',
  village: 'Pondok Labu',
  district: 'Cilandak',
  city: 'Jakarta Selatan',
  postalCode: '12430',
}

const RIGHTS = LABELS.MEMBER_RIGHTS[MOCK_MEMBER.memberType]

export default function MemberDetailPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabId>('info')
  const m = MOCK_MEMBER

  return (
    <div>
      <Header member={m} onEdit={() => navigate(memberEditPath(m.id))} onBack={() => navigate(-1)} />
      <ProfileSection member={m} />
      <div className="flex gap-6">
        <div className="flex-1 min-w-0">
          <TabBar tabs={TAB_OPTIONS} active={activeTab} onChange={(id) => setActiveTab(id)} />
          <div className="mt-6">
            {activeTab === 'info' && <InfoTab member={m} />}
            {activeTab === 'borrowing' && <EmptyState icon={BookOpen} title={LABELS.MEMBER.NO_BORROWING_HISTORY} description={LABELS.MEMBER.NO_BORROWING_HISTORY_DESC} />}
            {activeTab === 'fine' && <EmptyState icon={BookX} title={LABELS.MEMBER.NO_FINE_HISTORY} description={LABELS.MEMBER.NO_FINE_HISTORY_DESC} />}
            {activeTab === 'activity' && <ActivityTab />}
          </div>
        </div>
        <div className="w-80 flex-shrink-0 space-y-6">
          <StatusCard member={m} />
          <RightsCard />
          <StatisticsCard />
        </div>
      </div>
    </div>
  )
}

function Header({ member, onEdit, onBack }: { member: typeof MOCK_MEMBER; onEdit: () => void; onBack: () => void }) {
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

function ProfileSection({ member }: { member: typeof MOCK_MEMBER }) {
  const m = member
  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
      <div className="flex gap-6">
        <div className="w-24 h-24 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
          <User size={40} className="text-slate-400" />
        </div>
        <div className="flex-1 grid grid-cols-3 gap-x-8 gap-y-3">
          <SummaryField label={LABELS.FIELD.FULL_NAME} value={m.name} />
          <SummaryField label={LABELS.FIELD.MEMBER_NUMBER} value={m.number} />
          <SummaryField label={LABELS.FIELD.MEMBER_TYPE} value={m.memberTypeLabel} />
          <SummaryField
            label={LABELS.FIELD.STATUS}
            value={<StatusBadge status={m.statusLabel} active={m.status === 'active'} />}
          />
          <SummaryField label={LABELS.FIELD.JOIN_DATE} value={m.joinDate} />
          <SummaryField label={LABELS.FIELD.VALID_UNTIL} value={m.validUntil} />
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

function InfoTab({ member }: { member: typeof MOCK_MEMBER }) {
  const m = member
  return (
    <div className="space-y-5">
      <SectionCard title={LABELS.MEMBER_SECTION.PERSONAL} onEdit={() => alert('Fitur edit data pribadi belum tersedia.')}>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          <InfoField label={LABELS.FIELD.FULL_NAME} value={m.name} />
          <InfoField label={LABELS.FIELD.GENDER} value={m.gender} />
          <InfoField label={LABELS.FIELD.BIRTHPLACE} value={m.birthplace} />
          <InfoField label={LABELS.FIELD.BIRTH_DATE} value={m.birthDate} />
          <InfoField label={LABELS.FIELD.PHONE} value={m.phone} />
          <InfoField label={LABELS.FIELD.EMAIL} value={m.email} />
        </div>
      </SectionCard>
      <SectionCard title={LABELS.MEMBER_SECTION.ADDRESS} onEdit={() => alert('Fitur edit alamat belum tersedia.')}>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          <div className="col-span-2">
            <InfoField label={LABELS.FIELD.ADDRESS} value={m.address} />
          </div>
          <InfoField label={LABELS.FIELD.VILLAGE} value={m.village} />
          <InfoField label={LABELS.FIELD.DISTRICT} value={m.district} />
          <InfoField label={LABELS.FIELD.CITY} value={m.city} />
          <InfoField label={LABELS.FIELD.POSTAL_CODE} value={m.postalCode} />
        </div>
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

function ActivityTab() {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
      <h2 className="text-base font-semibold text-slate-800 mb-5">{LABELS.MEMBER_TAB.ACTIVITY}</h2>
      <div className="space-y-0">
        <TimelineItem
          icon={<CheckCircle size={14} className="text-blue-600" />}
          title={LABELS.MEMBER.CREATED}
          date="29 Juli 2026"
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

function StatusCard({ member }: { member: typeof MOCK_MEMBER }) {
  const m = member
  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
      <h2 className="text-sm font-semibold text-slate-800 mb-4">{LABELS.MEMBER.STATUS_MEMBERSHIP}</h2>
      <div className="space-y-3">
        <SidebarField label={LABELS.FIELD.STATUS} value={<StatusBadge status={m.statusLabel} active={m.status === 'active'} />} />
        <SidebarField label={LABELS.FIELD.JOIN_DATE} value={m.joinDate} />
        <SidebarField label={LABELS.FIELD.VALID_UNTIL} value={m.validUntil} />
      </div>
    </div>
  )
}

function RightsCard() {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
      <h2 className="text-sm font-semibold text-slate-800 mb-4">{LABELS.MEMBER_SECTION.RIGHTS}</h2>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">{LABELS.FIELD.MAX_BOOKS}</span>
          <span className="text-sm font-semibold text-slate-800">{`${RIGHTS.maxBooks} ${LABELS.FIELD.TIMES}`}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">{LABELS.FIELD.MAX_DAYS}</span>
          <span className="text-sm font-semibold text-slate-800">{`${RIGHTS.maxDays} ${LABELS.FIELD.DAYS}`}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">{LABELS.FIELD.EXTENSIONS}</span>
          <span className="text-sm font-semibold text-slate-800">{RIGHTS.extensions}</span>
        </div>
      </div>
    </div>
  )
}

function StatisticsCard() {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
      <h2 className="text-sm font-semibold text-slate-800 mb-4">{LABELS.MEMBER.STATISTICS}</h2>
      <div className="space-y-3">
        <StatRow icon={BookOpen} label={LABELS.MEMBER.CURRENTLY_BORROWED} value="0" />
        <StatRow icon={Clock} label={LABELS.MEMBER.TOTAL_BORROWED} value="0" />
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
