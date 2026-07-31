import { LABELS } from '../../utils/labels'
import Section from './Section'

interface AddressSectionProps {
  address: string
  setAddress: (v: string) => void
  district: string
  setDistrict: (v: string) => void
  village: string
  setVillage: (v: string) => void
  city: string
  setCity: (v: string) => void
  postalCode: string
  setPostalCode: (v: string) => void
}

export default function AddressSection({
  address, setAddress,
  district, setDistrict,
  village, setVillage,
  city, setCity,
  postalCode, setPostalCode
}: AddressSectionProps) {
  return (
    <Section title={LABELS.MEMBER_SECTION.ADDRESS}>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{LABELS.FIELD.ADDRESS}</label>
        <textarea
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          rows={3}
          placeholder={LABELS.PLACEHOLDER.ADDRESS}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{LABELS.FIELD.DISTRICT}</label>
          <input
            type="text"
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            placeholder="Contoh: Cilandak"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{LABELS.FIELD.VILLAGE}</label>
          <input
            type="text"
            value={village}
            onChange={(e) => setVillage(e.target.value)}
            placeholder="Contoh: Pondok Labu"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{LABELS.FIELD.CITY}</label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Contoh: Jakarta Selatan"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{LABELS.FIELD.POSTAL_CODE}</label>
          <input
            type="text"
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
            placeholder="Contoh: 12430"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
    </Section>
  )
}
