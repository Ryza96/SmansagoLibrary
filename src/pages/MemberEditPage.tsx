import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import MemberForm from '../components/members/MemberForm'
import { LABELS } from '../utils/labels'
import type { EnrollmentDTO } from '../shared/dto/enrollment'

const api = window.electronAPI

type ActiveEnrollmentInfo = Pick<EnrollmentDTO, 'id' | 'academicYearId' | 'classId'>

export default function MemberEditPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [initialData, setInitialData] = useState<any>(null)
  const [activeEnrollment, setActiveEnrollment] = useState<ActiveEnrollmentInfo | null>(null)
  const [memberNumber, setMemberNumber] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (!id) return
      const [member, active] = await Promise.all([
        api.members.findById(id),
        api.enrollments.findActiveByMember(id)
      ])
      setInitialData({
        memberNumber: member.memberNumber,
        fullName: member.fullName,
        gender: member.gender ?? '',
        birthplace: member.birthPlace ?? '',
        birthDate: member.birthDate ?? '',
        phone: member.phone ?? '',
        email: member.email ?? '',
        nip: member.nip ?? '',
        memberType: member.memberType ?? '',
        status: member.status.toLowerCase(),
        address: member.address ?? '',
        academicYearId: active?.academicYearId ?? '',
        classId: active?.classId ?? ''
      })
      setActiveEnrollment(active)
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

      <MemberForm mode="edit" initialData={initialData} memberId={id!} activeEnrollment={activeEnrollment} />
    </div>
  )
}
