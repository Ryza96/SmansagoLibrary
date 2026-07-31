import { LABELS } from '../../utils/labels'
import Card from './Card'

interface RightsData {
  maxBooks: number
  maxDays: number
  extensions: string
}

interface RightsSidebarProps {
  rights: RightsData | null
}

function RightRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-slate-800">{value}</span>
    </div>
  )
}

export default function RightsSidebar({ rights }: RightsSidebarProps) {
  return (
    <Card title={LABELS.MEMBER_SECTION.RIGHTS}>
      {rights ? (
        <div className="space-y-3">
          <RightRow label={LABELS.FIELD.MAX_BOOKS} value={`${rights.maxBooks} ${LABELS.FIELD.TIMES}`} />
          <RightRow label={LABELS.FIELD.MAX_DAYS} value={`${rights.maxDays} ${LABELS.FIELD.DAYS}`} />
          <RightRow label={LABELS.FIELD.EXTENSIONS} value={rights.extensions} />
        </div>
      ) : (
        <p className="text-xs text-slate-400">Pilih tipe anggota untuk melihat hak peminjaman.</p>
      )}
    </Card>
  )
}
