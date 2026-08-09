import { LABELS } from '../../utils/labels'
import Card from './Card'

interface SummarySidebarProps {
  fullName: string
  memberNumber: string
  isEditMode: boolean
  memberType: string
  status: string
  joinDate: string
  phone: string
  email: string
  addressPreview: string
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-slate-500 w-24 flex-shrink-0 text-xs">{label}</span>
      <span className={`text-slate-800 text-xs leading-relaxed ${value === '-' ? 'text-slate-300' : ''}`}>{value}</span>
    </div>
  )
}

export default function SummarySidebar({
  fullName, memberNumber, isEditMode, memberType, status, joinDate, phone, email, addressPreview
}: SummarySidebarProps) {
  return (
    <Card title={LABELS.MEMBER_SECTION.SUMMARY}>
      <div className="space-y-2 text-sm">
        <SummaryRow label={LABELS.FIELD.FULL_NAME} value={fullName || '-'} />
        <SummaryRow label={LABELS.FIELD.MEMBER_NUMBER} value={isEditMode ? memberNumber : LABELS.PLACEHOLDER.MEMBER_NUMBER} />
        <SummaryRow
          label={LABELS.FIELD.MEMBER_TYPE}
          value={LABELS.MEMBER_TYPES.find((t) => t.value === memberType)?.label || '-'}
        />
        <SummaryRow
          label={LABELS.FIELD.MEMBERSHIP_STATUS}
          value={LABELS.MEMBER_STATUSES.find((s) => s.value === status)?.label || '-'}
        />
        <SummaryRow label={LABELS.FIELD.JOIN_DATE} value={joinDate} />
        <SummaryRow label={LABELS.FIELD.PHONE} value={phone || '-'} />
        <SummaryRow label={LABELS.FIELD.EMAIL} value={email || '-'} />
        <SummaryRow label={LABELS.FIELD.ADDRESS} value={addressPreview || '-'} />
      </div>
    </Card>
  )
}
