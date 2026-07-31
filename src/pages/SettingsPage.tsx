import { useState, useEffect } from 'react'
import { Save, Loader2 } from 'lucide-react'

interface SettingsData {
  id: string
  libraryName: string
  schoolName: string
  address: string
  phone: string
  email: string
  website: string
  logoPath: string
  principalName: string
  principalNip: string
  librarianName: string
  librarianNip: string
  defaultBorrowDays: number
  maxBorrowBooks: number
  lateFee: number
  allowRenewal: boolean
  inventoryPrefix: string
  defaultShelfLocation: string
  barcodeFormat: string
  reportPaperSize: string
  reportDateFormat: string
  reportSigner: string
  createdAt: string
  updatedAt: string
}

const PAPER_SIZES = ['A4', 'A3', 'A5', 'Letter', 'Legal']
const DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD Month YYYY']

const api = window.electronAPI

export default function SettingsPage() {
  const [form, setForm] = useState<SettingsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    setLoading(true)
    api.settings.get()
      .then((data) => setForm(data as SettingsData))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Gagal memuat pengaturan.'))
      .finally(() => setLoading(false))
  }, [])

  function set<K extends keyof SettingsData>(key: K, value: SettingsData[K]) {
    if (!form) return
    setForm({ ...form, [key]: value })
  }

  function validate(): string | null {
    if (!form) return 'Data tidak tersedia.'
    if (!form.libraryName.trim()) return 'Nama Perpustakaan wajib diisi.'
    if (form.defaultBorrowDays <= 0) return 'Lama Pinjam Default harus lebih dari 0.'
    if (form.maxBorrowBooks <= 0) return 'Maksimal Buku harus lebih dari 0.'
    if (form.lateFee < 0) return 'Denda tidak boleh negatif.'
    return null
  }

  async function handleSave() {
    if (!form) return
    const validationError = validate()
    if (validationError) {
      alert(validationError)
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const result = await api.settings.update(form as unknown as Record<string, unknown>)
      setForm(result as SettingsData)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="text-slate-400 text-sm text-center py-8">Memuat...</p>
  }

  if (error && !form) {
    return (
      <div className="text-sm text-center py-8">
        <p className="text-red-500 mb-2">{error}</p>
        <button onClick={() => window.location.reload()} className="text-blue-600 hover:text-blue-800 text-xs font-medium">
          Coba lagi
        </button>
      </div>
    )
  }

  if (!form) return null

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Pengaturan</h1>
      </div>

      <div className="space-y-6">
        <Section title="Identitas Perpustakaan">
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <Field label="Nama Perpustakaan" required>
              <input type="text" value={form.libraryName} onChange={(e) => set('libraryName', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </Field>
            <Field label="Nama Sekolah">
              <input type="text" value={form.schoolName} onChange={(e) => set('schoolName', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </Field>
            <div className="col-span-2">
              <Field label="Alamat">
                <textarea value={form.address} onChange={(e) => set('address', e.target.value)} rows={2} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </Field>
            </div>
            <Field label="Telepon">
              <input type="text" value={form.phone} onChange={(e) => set('phone', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </Field>
            <Field label="Email">
              <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </Field>
            <Field label="Website">
              <input type="text" value={form.website} onChange={(e) => set('website', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </Field>
          </div>
        </Section>

        <Section title="Penanggung Jawab">
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <Field label="Kepala Sekolah">
              <input type="text" value={form.principalName} onChange={(e) => set('principalName', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </Field>
            <Field label="NIP Kepala Sekolah">
              <input type="text" value={form.principalNip} onChange={(e) => set('principalNip', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </Field>
            <Field label="Kepala Perpustakaan">
              <input type="text" value={form.librarianName} onChange={(e) => set('librarianName', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </Field>
            <Field label="NIP Kepala Perpustakaan">
              <input type="text" value={form.librarianNip} onChange={(e) => set('librarianNip', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </Field>
          </div>
        </Section>

        <Section title="Peminjaman">
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <Field label="Lama Pinjam Default (hari)" required>
              <input type="number" min={1} value={form.defaultBorrowDays} onChange={(e) => set('defaultBorrowDays', Math.max(1, parseInt(e.target.value) || 1))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </Field>
            <Field label="Maksimal Buku" required>
              <input type="number" min={1} value={form.maxBorrowBooks} onChange={(e) => set('maxBorrowBooks', Math.max(1, parseInt(e.target.value) || 1))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </Field>
            <Field label="Denda per Hari" required>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">Rp</span>
                <input type="number" min={0} value={form.lateFee} onChange={(e) => set('lateFee', Math.max(0, parseInt(e.target.value) || 0))} className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </Field>
            <Field label="Izinkan Perpanjangan">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.allowRenewal} onChange={(e) => set('allowRenewal', e.target.checked)} className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500" />
                <span className="text-sm text-slate-600">{form.allowRenewal ? 'Ya' : 'Tidak'}</span>
              </label>
            </Field>
          </div>
        </Section>

        <Section title="Inventaris">
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <Field label="Prefix Inventaris">
              <input type="text" value={form.inventoryPrefix} onChange={(e) => set('inventoryPrefix', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </Field>
            <Field label="Default Lokasi Rak">
              <input type="text" value={form.defaultShelfLocation} onChange={(e) => set('defaultShelfLocation', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </Field>
            <Field label="Format Barcode">
              <input type="text" value={form.barcodeFormat} onChange={(e) => set('barcodeFormat', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </Field>
          </div>
        </Section>

        <Section title="Laporan">
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <Field label="Ukuran Kertas">
              <select value={form.reportPaperSize} onChange={(e) => set('reportPaperSize', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                {PAPER_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Format Tanggal">
              <select value={form.reportDateFormat} onChange={(e) => set('reportDateFormat', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                {DATE_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </Field>
            <Field label="Penandatangan">
              <input type="text" value={form.reportSigner} onChange={(e) => set('reportSigner', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </Field>
          </div>
        </Section>

        <Section title="Logo">
          <Field label="Path Logo" helper="Fitur upload logo belum tersedia.">
            <input type="text" value={form.logoPath} readOnly className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-500 cursor-not-allowed" />
          </Field>
        </Section>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
          </button>
          {success && (
            <span className="text-sm text-green-600 font-medium">Pengaturan berhasil disimpan.</span>
          )}
          {error && (
            <span className="text-sm text-red-500">{error}</span>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
      <h2 className="text-base font-semibold text-slate-800 mb-4">{title}</h2>
      {children}
    </div>
  )
}

function Field({ label, required, helper, children }: { label: string; required?: boolean; helper?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {helper && <p className="text-xs text-slate-400 mt-1">{helper}</p>}
    </div>
  )
}
