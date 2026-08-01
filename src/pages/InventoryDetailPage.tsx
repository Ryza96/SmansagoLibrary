import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Package, CircleDot, User, Clock } from 'lucide-react'

const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: 'Tersedia',
  BORROWED: 'Dipinjam',
  LOST: 'Hilang',
  REMOVED: 'Dihapus'
}

const STATUS_COLOR: Record<string, string> = {
  AVAILABLE: 'bg-green-100 text-green-700',
  BORROWED: 'bg-blue-100 text-blue-700',
  LOST: 'bg-red-100 text-red-700',
  REMOVED: 'bg-slate-100 text-slate-500'
}

const CONDITION_LABEL: Record<string, string> = {
  GOOD: 'Baik',
  LIGHT_DAMAGE: 'Rusak Ringan',
  HEAVY_DAMAGE: 'Rusak Berat'
}

const ACQUISITION_SOURCE_LABEL: Record<string, string> = {
  PEMBELIAN: 'Pembelian',
  DONASI: 'Donasi',
  HIBAH: 'Hibah',
  BANTUAN_PEMERINTAH: 'Bantuan Pemerintah',
  LAINNYA: 'Lainnya'
}

function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-'
  return 'Rp ' + value.toLocaleString('id-ID')
}

const EVENT_LABEL: Record<string, string> = {
  COPY_CREATED: 'Eksemplar dibuat',
  CONDITION_CHANGED: 'Kondisi diubah'
}

const EVENT_ICON: Record<string, string> = {
  COPY_CREATED: 'package',
  CONDITION_CHANGED: 'circle-dot'
}

const ACTOR_LABEL: Record<string, string> = {
  SYSTEM: 'Sistem',
  USER: 'Pengguna'
}

const api = window.electronAPI

export default function InventoryDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [copy, setCopy] = useState<Record<string, unknown> | null>(null)
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    Promise.all([
      api.bookCopies.findById(id),
      api.assetEvents.findByBookCopyId(id)
    ]).then(([copyData, eventsData]) => {
      setCopy(copyData as Record<string, unknown> | null)
      setEvents(eventsData as Array<Record<string, unknown>>)
    }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan.'
      setError(message)
    }).finally(() => {
      setLoading(false)
    })
  }, [id])

  if (loading) {
    return <p className="text-slate-400 text-sm text-center py-8">Memuat...</p>
  }

  if (error) {
    return (
      <div className="text-sm text-center py-8">
        <p className="text-red-500 mb-2">{error}</p>
        <button onClick={() => navigate('/inventory')} className="text-blue-600 hover:text-blue-800 text-xs font-medium">
          Kembali ke Inventaris
        </button>
      </div>
    )
  }

  if (!copy) {
    return (
      <div className="text-sm text-center py-8">
        <p className="text-slate-400 mb-2">Eksemplar tidak ditemukan.</p>
        <button onClick={() => navigate('/inventory')} className="text-blue-600 hover:text-blue-800 text-xs font-medium">
          Kembali ke Inventaris
        </button>
      </div>
    )
  }

  const book = copy.book as Record<string, unknown> | null
  const source = copy.acquisitionSource as string | null
  const sourceDetail = copy.acquisitionSourceDetail as string | null

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/inventory')} className="p-1.5 rounded hover:bg-slate-200 transition-colors text-slate-500">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-slate-800">Detail Eksemplar</h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
        <h2 className="text-base font-semibold text-slate-800 mb-4">Informasi Eksemplar</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          <Field label="No. Inventaris" value={copy.inventoryNumber as string} />
          <Field label="Barcode" value={(copy.barcode as string | null) ?? '-'} />
          <div className="col-span-2">
            <Field label="Judul Buku" value={(book?.title as string) ?? '-'} />
          </div>
          <Field label="ISBN" value={(book?.isbn as string | null) ?? '-'} />
          <Field label="Penulis" value={((book?.author as Record<string, unknown> | null)?.name as string) ?? '-'} />
          <Field label="Penerbit" value={((book?.publisher as Record<string, unknown> | null)?.name as string) ?? '-'} />
          <Field label="Kategori" value={((book?.category as Record<string, unknown> | null)?.name as string) ?? '-'} />
          <Field label="Status" value={<StatusBadge status={copy.status as string} />} />
          <Field label="Kondisi" value={CONDITION_LABEL[copy.condition as string] ?? (copy.condition as string)} />
          <Field label="Lokasi Rak" value={(copy.shelfLocation as string | null) ?? '-'} />
          <Field label="Tgl. Perolehan" value={(copy.acquisitionDate as string | null) ? new Date(copy.acquisitionDate as string).toLocaleDateString('id-ID') : '-'} />
          <Field label="Sumber Perolehan" value={source ? (ACQUISITION_SOURCE_LABEL[source] ?? source) : '-'} />
          <Field label="Harga Perolehan" value={formatPrice(copy.acquisitionCost as number | null | undefined)} />
          <Field label="Tgl. Dibuat" value={new Date(copy.createdAt as string).toLocaleDateString('id-ID')} />
          {(source === 'LAINNYA' || sourceDetail) && (
            <div className="col-span-2">
              <Field label="Detail" value={sourceDetail ?? '-'} />
            </div>
          )}
          <div className="col-span-2">
            <Field label="Catatan Pengadaan" value={(copy.acquisitionNotes as string | null) ?? '-'} />
          </div>
          <div className="col-span-2">
            <Field label="Catatan" value={(copy.notes as string | null) ?? '-'} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <h2 className="text-base font-semibold text-slate-800 mb-5">Riwayat Eksemplar</h2>
        {events.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-8">Belum ada riwayat.</p>
        ) : (
          <div className="space-y-0">
            {events.map((event, idx) => (
              <TimelineItem
                key={event.id as string}
                icon={getEventIcon(event.eventType as string)}
                title={EVENT_LABEL[event.eventType as string] ?? (event.eventType as string)}
                date={new Date(event.occurredAt as string).toLocaleDateString('id-ID', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
                actor={ACTOR_LABEL[event.actorType as string] ?? (event.actorType as string)}
                notes={event.notes as string | null}
                isLast={idx === events.length - 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      <div className="text-sm text-slate-800">{value}</div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[status] ?? 'bg-slate-100 text-slate-500'}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

function TimelineItem({ icon, title, date, actor, notes, isLast }: {
  icon: React.ReactNode
  title: string
  date: string
  actor: string
  notes: string | null
  isLast: boolean
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        {!isLast && <div className="w-px flex-1 bg-slate-200 min-h-[24px]" />}
      </div>
      <div className={`pb-1 ${isLast ? '' : 'pb-6'}`}>
        <p className="text-sm font-medium text-slate-800">{title}</p>
        <p className="text-xs text-slate-400 mt-0.5">{date}</p>
        <div className="flex items-center gap-3 mt-1">
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <User size={11} />
            {actor}
          </span>
        </div>
        {notes && <p className="text-xs text-slate-500 mt-1">{notes}</p>}
      </div>
    </div>
  )
}

function getEventIcon(eventType: string): React.ReactNode {
  switch (eventType) {
    case 'COPY_CREATED':
      return <Package size={14} />
    case 'CONDITION_CHANGED':
      return <CircleDot size={14} />
    default:
      return <Clock size={14} />
  }
}
