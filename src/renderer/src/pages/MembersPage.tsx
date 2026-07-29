import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { LABELS } from '../constants/labels'
import { ROUTES } from '../config/navigation'

export default function MembersPage() {
  const navigate = useNavigate()

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">{LABELS.MEMBER.TITLE}</h1>
        <button
          onClick={() => navigate(ROUTES.MEMBERS_NEW)}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          {LABELS.MEMBER.NEW}
        </button>
      </div>
      <p className="text-slate-500">Modul Anggota sedang dalam pengembangan.</p>
    </div>
  )
}
