import { LABELS } from '../../utils/labels'
import Section from './Section'

interface PersonalSectionProps {
  fullName: string
  setFullName: (v: string) => void
  gender: string
  setGender: (v: string) => void
  birthplace: string
  setBirthplace: (v: string) => void
  birthDate: string
  setBirthDate: (v: string) => void
  phone: string
  setPhone: (v: string) => void
  email: string
  setEmail: (v: string) => void
  errors: Record<string, string>
  nip?: string
  setNip?: (v: string) => void
  showNip?: boolean
}

export default function PersonalSection({
  fullName, setFullName,
  gender, setGender,
  birthplace, setBirthplace,
  birthDate, setBirthDate,
  phone, setPhone,
  email, setEmail,
  errors,
  nip,
  setNip,
  showNip = false
}: PersonalSectionProps) {
  return (
    <Section title={LABELS.MEMBER_SECTION.PERSONAL}>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          {LABELS.FIELD.FULL_NAME} <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Masukkan nama lengkap"
          className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.fullName ? 'border-red-400' : 'border-slate-300'}`}
        />
        {errors.fullName && <p className="text-red-500 text-xs mt-1">{errors.fullName}</p>}
      </div>

      {showNip && setNip && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            NIP <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={nip ?? ''}
            onChange={(e) => setNip(e.target.value)}
            placeholder="Masukkan NIP"
            className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.nip ? 'border-red-400' : 'border-slate-300'}`}
          />
          {errors.nip && <p className="text-red-500 text-xs mt-1">{errors.nip}</p>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            {LABELS.FIELD.GENDER} <span className="text-red-500">*</span>
          </label>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.gender ? 'border-red-400' : 'border-slate-300'}`}
          >
            <option value="">Pilih jenis kelamin</option>
            {LABELS.GENDERS.map((g) => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </select>
          {errors.gender && <p className="text-red-500 text-xs mt-1">{errors.gender}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{LABELS.FIELD.BIRTHPLACE}</label>
          <input
            type="text"
            value={birthplace}
            onChange={(e) => setBirthplace(e.target.value)}
            placeholder={LABELS.PLACEHOLDER.BIRTHPLACE}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{LABELS.FIELD.BIRTH_DATE}</label>
          <input
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{LABELS.FIELD.PHONE}</label>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Contoh: 0812-3456-7890"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{LABELS.FIELD.EMAIL}</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Contoh: nama@email.com"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </Section>
  )
}
