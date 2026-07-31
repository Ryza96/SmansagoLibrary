import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CreateMemberDTO, UpdateMemberDTO } from '../../shared/dto/member'
import { LABELS } from '../../utils/labels'
import PersonalSection from './PersonalSection'
import MembershipSection from './MembershipSection'
import AddressSection from './AddressSection'
import NotesSection from './NotesSection'
import SummarySidebar from './SummarySidebar'
import RightsSidebar from './RightsSidebar'
import FormFooter from './FormFooter'
import Card from './Card'

const api = window.electronAPI

function todayISO() {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

const MEMBER_TYPES = ['student', 'teacher', 'general'] as const
type MemberType = (typeof MEMBER_TYPES)[number]

interface FormData {
  memberNumber?: string
  fullName?: string
  gender?: string
  birthplace?: string
  birthDate?: string
  phone?: string
  email?: string
  memberType?: string
  joinDate?: string
  validUntil?: string
  status?: string
  address?: string
  district?: string
  village?: string
  city?: string
  postalCode?: string
  notes?: string
}

interface MemberFormProps {
  mode?: 'create' | 'edit'
  initialData?: FormData
  memberId?: string
  defaultMemberType?: string
}

export default function MemberForm({ mode = 'create', initialData, memberId, defaultMemberType }: MemberFormProps) {
  const navigate = useNavigate()
  const editInitial = mode === 'edit' ? (initialData ?? {}) : {}

  const [fullName, setFullName] = useState(editInitial.fullName ?? '')
  const [gender, setGender] = useState(editInitial.gender ?? '')
  const [birthplace, setBirthplace] = useState(editInitial.birthplace ?? '')
  const [birthDate, setBirthDate] = useState(editInitial.birthDate ?? '')
  const [phone, setPhone] = useState(editInitial.phone ?? '')
  const [email, setEmail] = useState(editInitial.email ?? '')

  const readonlyMemberType = mode === 'create' && !!defaultMemberType
  const [memberType, setMemberType] = useState(
    mode === 'create' && defaultMemberType
      ? defaultMemberType.toLowerCase()
      : (editInitial.memberType ?? '')
  )
  const [joinDate] = useState(editInitial.joinDate ?? todayISO())
  const [validUntil, setValidUntil] = useState(editInitial.validUntil ?? '')
  const [status, setStatus] = useState(editInitial.status ?? 'active')

  const [address, setAddress] = useState(editInitial.address ?? '')
  const [district, setDistrict] = useState(editInitial.district ?? '')
  const [village, setVillage] = useState(editInitial.village ?? '')
  const [city, setCity] = useState(editInitial.city ?? '')
  const [postalCode, setPostalCode] = useState(editInitial.postalCode ?? '')

  const [notes, setNotes] = useState(editInitial.notes ?? '')

  const memberNumber = mode === 'edit' ? (editInitial.memberNumber ?? '-') : ''

  const [errors, setErrors] = useState<Record<string, string>>({})

  const isEditMode = mode === 'edit'

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!fullName.trim()) e.fullName = 'Nama lengkap wajib diisi.'
    if (!gender) e.gender = 'Jenis kelamin wajib dipilih.'
    if (!memberType) e.memberType = 'Tipe anggota wajib dipilih.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    if (isEditMode) {
      const payload: UpdateMemberDTO = {
        fullName,
        memberType: memberType || undefined,
        gender: gender || undefined,
        birthPlace: birthplace || undefined,
        birthDate: birthDate || undefined,
        address: address || undefined,
        phone: phone || undefined,
        email: email || undefined,
        status: status ? status.toUpperCase() : undefined
      }
      await api.members.update(memberId!, payload)
    } else {
      const payload: CreateMemberDTO = {
        fullName,
        memberType: memberType || undefined,
        gender: gender || undefined,
        birthPlace: birthplace || undefined,
        birthDate: birthDate || undefined,
        address: address || undefined,
        phone: phone || undefined,
        email: email || undefined
      }
      await api.members.create(payload)
    }
    navigate(-1)
  }

  const rights = MEMBER_TYPES.includes(memberType as MemberType)
    ? LABELS.MEMBER_RIGHTS[memberType as MemberType]
    : null

  const addressPreview = [address, village, district, city, postalCode].filter(Boolean).join(', ')

  return (
    <>
      <form onSubmit={handleSubmit}>
        <div className="flex gap-6">
          <div className="flex-1 min-w-0 space-y-6">
            <PersonalSection
              fullName={fullName} setFullName={setFullName}
              gender={gender} setGender={setGender}
              birthplace={birthplace} setBirthplace={setBirthplace}
              birthDate={birthDate} setBirthDate={setBirthDate}
              phone={phone} setPhone={setPhone}
              email={email} setEmail={setEmail}
              errors={errors}
            />
            <MembershipSection
              memberNumber={memberNumber}
              isEditMode={isEditMode}
              memberType={memberType} setMemberType={setMemberType}
              status={status} setStatus={setStatus}
              joinDate={joinDate}
              validUntil={validUntil} setValidUntil={setValidUntil}
              errors={errors}
              readonlyMemberType={readonlyMemberType}
            />
            <AddressSection
              address={address} setAddress={setAddress}
              district={district} setDistrict={setDistrict}
              village={village} setVillage={setVillage}
              city={city} setCity={setCity}
              postalCode={postalCode} setPostalCode={setPostalCode}
            />
            <NotesSection
              notes={notes} setNotes={setNotes}
            />
          </div>

          <div className="w-80 flex-shrink-0 space-y-6">
            <Card title={LABELS.MEMBER_SECTION.PHOTO}>
              <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center hover:border-blue-300 transition-colors cursor-pointer">
                <div className="mx-auto mb-3 w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </div>
                <p className="text-sm font-medium text-slate-600">{LABELS.MEMBER_COVER.UPLOAD}</p>
                <p className="text-xs text-slate-400 mt-1">{LABELS.MEMBER_COVER.FORMAT}</p>
                <p className="text-xs text-slate-400">{LABELS.MEMBER_COVER.SIZE}</p>
              </div>
            </Card>

            <SummarySidebar
              fullName={fullName}
              memberNumber={memberNumber}
              isEditMode={isEditMode}
              memberType={memberType}
              status={status}
              joinDate={joinDate}
              phone={phone}
              email={email}
              addressPreview={addressPreview}
            />

            <RightsSidebar rights={rights} />
          </div>
        </div>

        <FormFooter
          isEditMode={isEditMode}
          onCancel={() => window.history.back()}
          onSaveDraft={() => alert('Fitur Simpan Draft belum tersedia.')}
        />
      </form>
    </>
  )
}
