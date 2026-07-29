import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import MemberForm from '../components/members/MemberForm'
import { LABELS } from '../constants/labels'

export default function MemberCreatePage() {
  const navigate = useNavigate()

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 rounded hover:bg-slate-200 transition-colors text-slate-500"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-slate-800">{LABELS.MEMBER.NEW}</h1>
      </div>

      <MemberForm mode="create" />
    </div>
  )
}
