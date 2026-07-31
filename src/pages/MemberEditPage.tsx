import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import MemberForm from '../components/members/MemberForm'
import { LABELS } from '../utils/labels'

const api = window.electronAPI

export default function MemberEditPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [initialData, setInitialData] = useState<any>(null)
  const [memberNumber, setMemberNumber] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (!id) return
      const member = await api.members.findById(id)
      setInitialData({
        memberNumber: member.memberNumber,
        fullName: member.fullName,
        gender: member.gender ?? '',
        birthplace: member.birthPlace ?? '',
        birthDate: member.birthDate ?? '',
        phone: member.phone ?? '',
        email: member.email ?? '',
        memberType: member.memberType ?? '',
        status: member.status.toLowerCase(),
        address: member.address ?? ''
      })
      setMemberNumber(member.memberNumber)
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) {
    return <p className="text-slate-400 text-sm">{LABELS.PLACEHOLDER.LOADING}</p>
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 rounded hover:bg-slate-200 transition-colors text-slate-500"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{LABELS.MEMBER.EDIT}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{`Nomor Anggota: ${memberNumber}`}</p>
        </div>
      </div>

      <MemberForm mode="edit" initialData={initialData} memberId={id!} />
    </div>
  )
}
