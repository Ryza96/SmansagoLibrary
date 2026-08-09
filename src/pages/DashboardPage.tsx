import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, PackageSearch, Users, BookMarked, Clock, AlertCircle, Activity, ArrowRightLeft, Undo2, FileSpreadsheet, BookUp, BookDown, TriangleAlert, Hourglass, RefreshCw } from 'lucide-react'
import type { DashboardOverviewDTO } from '../shared/dto/dashboard'
import { useNotification } from '../notification/NotificationContext'
import { LABELS } from '../utils/labels'
import { ROUTES } from '../utils/navigation'
import MemberImportDialog from '../components/members/MemberImportDialog'

function useRealtimeClock() {
  const [clock, setClock] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return clock
}

function formatDate(date: Date) {
  return date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatActivityTime(iso: string) {
  return new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

interface TodayCardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  color: string
}

function TodayCard({ icon, label, value, color }: TodayCardProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4">
      <div className={`p-3 rounded-lg shrink-0 ${color}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm text-slate-500">{label}</p>
        <p className="text-xl font-bold text-slate-800 mt-0.5">{value}</p>
      </div>
    </div>
  )
}

interface LaunchCardProps {
  icon: React.ReactNode
  title: string
  cta: string
  to: string
  colorClass: string
}

function LaunchCard({ icon, title, cta, to, colorClass }: LaunchCardProps) {
  const navigate = useNavigate()

  return (
    <button
      onClick={() => navigate(to)}
      className="flex items-center gap-5 p-5 rounded-xl border border-slate-200 bg-white hover:shadow-lg hover:-translate-y-0.5 hover:border-slate-300 transition-all duration-200 text-left w-full"
    >
      <div className={`p-3 rounded-xl shrink-0 ${colorClass}`}>
        {icon}
      </div>
      <p className="flex-1 text-sm font-semibold text-slate-800 min-w-0">{title}</p>
      <span className="text-xs font-medium text-slate-400 shrink-0">
        {cta} →
      </span>
    </button>
  )
}

interface SummaryCardProps {
  icon: React.ReactNode
  label: string
  value: string | number
}

function SummaryCard({ icon, label, value }: SummaryCardProps) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 px-4 py-3 flex items-center gap-3">
      <div className="text-slate-400 shrink-0">{icon}</div>
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="text-lg font-bold text-slate-800">{value}</span>
        <span className="text-xs text-slate-500 truncate">{label}</span>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { notify } = useNotification()
  const clock = useRealtimeClock()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [overview, setOverview] = useState<DashboardOverviewDTO | null>(null)
  const [importMemberOpen, setImportMemberOpen] = useState(false)

  async function load() {
    setLoading(true)
    setError(false)
    try {
      const data = await window.electronAPI.dashboard.overview()
      setOverview(data)
    } catch (err: unknown) {
      setError(true)
      notify.error(err instanceof Error ? err.message : LABELS.DASHBOARD.LOAD_ERROR)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div className="space-y-6">

      {/* ── SECTION 0: ERROR STATE ── */}
      {error && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <AlertCircle size={20} className="text-rose-500 shrink-0" />
            <p className="text-sm text-rose-700">{LABELS.DASHBOARD.LOAD_ERROR}</p>
          </div>
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-medium hover:bg-rose-700 transition-colors shrink-0"
          >
            <RefreshCw size={14} />
            {LABELS.DASHBOARD.RETRY}
          </button>
        </div>
      )}

      {/* ── SECTION 1: HEADER ── */}
      <div className="bg-slate-900 rounded-xl p-6 text-white">
        <p className="text-xs text-slate-400 uppercase tracking-widest font-medium">Dashboard Perpustakaan</p>
        <h1 className="text-xl font-bold mt-1">Selamat datang, Administrator</h1>
        <div className="flex items-center gap-3 mt-3 text-sm text-slate-400">
          <span>{formatDate(clock)}</span>
          <span className="w-px h-3 bg-slate-600" />
          <span className="font-mono text-slate-300">{formatTime(clock)}</span>
        </div>
      </div>

      {/* ── SECTION 2: AKTIVITAS HARI INI ── */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">Aktivitas Hari Ini</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <TodayCard
            icon={<BookDown size={20} />}
            label="Dipinjam Hari Ini"
            value={overview ? overview.today.borrowed : '—'}
            color="text-blue-600 bg-blue-50"
          />
          <TodayCard
            icon={<BookUp size={20} />}
            label="Dikembalikan Hari Ini"
            value={overview ? overview.today.returned : '—'}
            color="text-emerald-600 bg-emerald-50"
          />
          <TodayCard
            icon={<TriangleAlert size={20} />}
            label="Terlambat"
            value={overview ? overview.today.overdue : '—'}
            color="text-rose-600 bg-rose-50"
          />
          <TodayCard
            icon={<Hourglass size={20} />}
            label="Jatuh Tempo Hari Ini"
            value={overview ? overview.today.dueToday : '—'}
            color="text-amber-600 bg-amber-50"
          />
        </div>
      </div>

      {/* ── SECTION 3: HERO ACTION ── */}
      <div>
        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-6 p-8 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 text-white hover:shadow-2xl hover:-translate-y-0.5 transition-all duration-200">
          <div className="p-4 rounded-2xl bg-white/15">
            <ArrowRightLeft size={56} />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold">Peminjaman Baru</h2>
            <p className="text-blue-100 mt-1 text-sm leading-relaxed max-w-xl">
              Mulai transaksi peminjaman buku untuk anggota perpustakaan. Proses cepat dengan scan barcode.
            </p>
          </div>
          <button
            onClick={() => navigate('/borrowings')}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-white text-blue-700 font-semibold text-sm hover:bg-blue-50 transition-colors shrink-0 shadow-md"
          >
            Mulai Sekarang
          </button>
        </div>
      </div>

      {/* ── SECTION 4: ACTION LAUNCHER ── */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">Action Launcher</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <LaunchCard
            icon={<Undo2 size={24} />}
            title="Pengembalian"
            cta="Buka"
            to="/returns"
            colorClass="text-emerald-600 bg-emerald-50"
          />
          <LaunchCard
            icon={<Users size={24} />}
            title="Tambah Anggota"
            cta="Buka"
            to="/members/new"
            colorClass="text-cyan-600 bg-cyan-50"
          />
          <LaunchCard
            icon={<BookOpen size={24} />}
            title="Tambah Buku"
            cta="Buka"
            to="/books/new"
            colorClass="text-violet-600 bg-violet-50"
          />
          <LaunchCard
            icon={<PackageSearch size={24} />}
            title="Inventaris"
            cta="Kelola"
            to="/inventory"
            colorClass="text-amber-600 bg-amber-50"
          />
        </div>
      </div>

      {/* ── SECTION 5: IMPORT DATA ── */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">{LABELS.DASHBOARD.IMPORT_TITLE}</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <button
            onClick={() => navigate(ROUTES.BOOK_IMPORT)}
            className="flex items-center gap-5 p-5 rounded-xl border border-slate-200 bg-white hover:shadow-lg hover:-translate-y-0.5 hover:border-slate-300 transition-all duration-200 text-left w-full"
          >
            <div className="p-3 rounded-xl shrink-0 text-blue-600 bg-blue-50">
              <FileSpreadsheet size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800">{LABELS.DASHBOARD.IMPORT_BOOKS}</p>
              <p className="text-xs text-slate-500 mt-1">{LABELS.DASHBOARD.IMPORT_BOOKS_DESC}</p>
            </div>
            <span className="text-xs font-medium text-slate-400 shrink-0">
              {LABELS.DASHBOARD.IMPORT_BOOKS_CTA} →
            </span>
          </button>

          <button
            onClick={() => setImportMemberOpen(true)}
            className="flex items-center gap-5 p-5 rounded-xl border border-slate-200 bg-white hover:shadow-lg hover:-translate-y-0.5 hover:border-slate-300 transition-all duration-200 text-left w-full"
          >
            <div className="p-3 rounded-xl shrink-0 text-emerald-600 bg-emerald-50">
              <Users size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800">{LABELS.DASHBOARD.IMPORT_MEMBERS}</p>
              <p className="text-xs text-slate-500 mt-1">{LABELS.DASHBOARD.IMPORT_MEMBERS_DESC}</p>
            </div>
            <span className="text-xs font-medium text-slate-400 shrink-0">
              {LABELS.DASHBOARD.IMPORT_MEMBERS_CTA} →
            </span>
          </button>
        </div>
      </div>

      {/* ── SECTION 6 + 7: TWO COLUMN ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* SECTION 6: AKTIVITAS TERBARU */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-4">
            <Activity size={16} className="text-blue-500" />
            Aktivitas Terbaru
          </h2>
          {overview && overview.recentActivity.length > 0 ? (
            <ul className="space-y-3">
              {overview.recentActivity.map((item) => (
                <li key={item.id} className="flex items-start gap-3">
                  <span className={`mt-0.5 shrink-0 ${item.type === 'BORROW' ? 'text-blue-500' : 'text-emerald-500'}`}>
                    {item.type === 'BORROW' ? <BookDown size={16} /> : <BookUp size={16} />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-slate-700">{item.message}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{formatActivityTime(item.occurredAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400">
              <Activity size={32} className="text-slate-300 mb-3" />
              <p className="text-sm">{LABELS.DASHBOARD.ACTIVITY_EMPTY}</p>
              <p className="text-xs text-slate-300 mt-1">Aktivitas akan muncul setelah transaksi dilakukan.</p>
            </div>
          )}
        </div>

        {/* SECTION 7: PERLU PERHATIAN */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-4">
            <AlertCircle size={16} className="text-amber-500" />
            Perlu Perhatian
          </h2>
          {overview && overview.alerts.length > 0 ? (
            <ul className="space-y-2">
              {overview.alerts.map((alert) => (
                <li
                  key={alert.id}
                  className={`flex items-start gap-2.5 rounded-lg border p-3 ${
                    alert.severity === 'danger'
                      ? 'border-rose-200 bg-rose-50 text-rose-700'
                      : 'border-amber-200 bg-amber-50 text-amber-700'
                  }`}
                >
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <p className="text-xs leading-relaxed">{alert.message}</p>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400">
              <svg xmlns="http://www.w3.org/2000/svg" width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400 mb-3">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <p className="text-sm">Tidak ada pekerjaan yang memerlukan perhatian.</p>
            </div>
          )}
        </div>

      </div>

      {/* ── SECTION 8: RINGKASAN PERPUSTAKAAN ── */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">Ringkasan Perpustakaan</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard icon={<BookOpen size={18} />} label="Total Buku" value={loading ? '...' : overview?.summary.totalBooks ?? '—'} />
          <SummaryCard icon={<PackageSearch size={18} />} label="Total Inventaris" value={loading ? '...' : overview?.summary.totalInventories ?? '—'} />
          <SummaryCard icon={<Users size={18} />} label="Total Anggota" value={loading ? '...' : overview?.summary.totalMembers ?? '—'} />
          <SummaryCard icon={<BookMarked size={18} />} label="Sedang Dipinjam" value={loading ? '...' : overview?.summary.activeBorrowings ?? '—'} />
        </div>
      </div>

      {importMemberOpen && (
        <MemberImportDialog
          onClose={() => {
            setImportMemberOpen(false)
            load()
          }}
        />
      )}

    </div>
  )
}
