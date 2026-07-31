import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, RefreshCw, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react'

interface BookCopyItem {
  id: string
  inventoryNumber: string
  barcode: string | null
  shelfLocation: string | null
  condition: string
  status: string
  createdAt: string
  book: { title: string } | null
}

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

function useDebounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const fnRef = useRef(fn)
  fnRef.current = fn
  return useCallback((...args: unknown[]) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => fnRef.current(...args), delay)
  }, [delay]) as unknown as T
}

export default function InventoryPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<BookCopyItem[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [statusFilter, setStatusFilter] = useState('')
  const [conditionFilter, setConditionFilter] = useState('')
  const [sortBy, setSortBy] = useState('inventoryNumber')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const api = window.electronAPI

  async function fetchData() {
    setLoading(true)
    setError(null)
    try {
      const result = await api.inventory.findMany({
        page,
        pageSize,
        search: search || undefined,
        status: statusFilter || undefined,
        condition: conditionFilter || undefined,
        sortBy,
        sortDirection
      })
      setItems(result.items as unknown as BookCopyItem[])
      setTotal(result.total)
      setTotalPages(result.totalPages)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan saat memuat data.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const debouncedSearch = useDebounce(() => {
    setPage(1)
    fetchData()
  }, 300)

  useEffect(() => {
    debouncedSearch()
  }, [search])

  useEffect(() => {
    fetchData()
  }, [page, statusFilter, conditionFilter, sortBy, sortDirection])

  function toggleSort(field: string) {
    if (sortBy === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(field)
      setSortDirection('asc')
    }
    setPage(1)
  }

  function SortHeader({ field, children }: { field: string; children: React.ReactNode }) {
    const isActive = sortBy === field
    return (
      <th
        className="pb-3 font-medium cursor-pointer hover:text-slate-700 select-none"
        onClick={() => toggleSort(field)}
      >
        <span className="inline-flex items-center gap-1">
          {children}
          <ArrowUpDown size={14} className={`${isActive ? 'text-blue-600' : 'text-slate-300'}`} />
        </span>
      </th>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Inventaris</h1>
        <button
          onClick={fetchData}
          className="p-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={16} className="text-slate-500" />
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200">
        <div className="p-4 border-b border-slate-200 space-y-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nomor inventaris atau barcode..."
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Semua Status</option>
              <option value="AVAILABLE">Tersedia</option>
              <option value="BORROWED">Dipinjam</option>
              <option value="LOST">Hilang</option>
              <option value="REMOVED">Dihapus</option>
            </select>
            <select
              value={conditionFilter}
              onChange={(e) => { setConditionFilter(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Semua Kondisi</option>
              <option value="GOOD">Baik</option>
              <option value="LIGHT_DAMAGE">Rusak Ringan</option>
              <option value="HEAVY_DAMAGE">Rusak Berat</option>
            </select>
          </div>
        </div>

        <div className="p-4">
          {loading ? (
            <p className="text-slate-400 text-sm text-center py-8">Memuat...</p>
          ) : error ? (
            <div className="text-sm text-center py-8">
              <p className="text-red-500 mb-2">{error}</p>
              <button
                onClick={fetchData}
                className="text-blue-600 hover:text-blue-800 text-xs font-medium"
              >
                Coba lagi
              </button>
            </div>
          ) : items.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">Tidak ada data.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <SortHeader field="inventoryNumber">No. Inventaris</SortHeader>
                    <th className="pb-3 font-medium">Barcode</th>
                    <th className="pb-3 font-medium">Judul Buku</th>
                    <th className="pb-3 font-medium">Kondisi</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Lokasi</th>
                    <SortHeader field="createdAt">Tgl. Dibuat</SortHeader>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => navigate(`/inventory/${item.id}`)}
                      className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                    >
                      <td className="py-3 text-slate-700 font-mono text-xs">{item.inventoryNumber}</td>
                      <td className="py-3 text-slate-700 font-mono text-xs">{item.barcode ?? '-'}</td>
                      <td className="py-3 text-slate-700">{item.book?.title ?? '-'}</td>
                      <td className="py-3 text-slate-600">{CONDITION_LABEL[item.condition] ?? item.condition}</td>
                      <td className="py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[item.status] ?? 'bg-slate-100 text-slate-500'}`}>
                          {STATUS_LABEL[item.status] ?? item.status}
                        </span>
                      </td>
                      <td className="py-3 text-slate-600">{item.shelfLocation ?? '-'}</td>
                      <td className="py-3 text-slate-500 text-xs">
                        {new Date(item.createdAt).toLocaleDateString('id-ID')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && !error && totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-slate-200 mt-4">
              <p className="text-sm text-slate-500">
                Total {total} eksemplar
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page <= 1}
                  className="p-1.5 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={16} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                  .map((p, idx, arr) => (
                    <span key={p} className="flex items-center">
                      {idx > 0 && arr[idx - 1] !== p - 1 && (
                        <span className="px-1 text-slate-400">...</span>
                      )}
                      <button
                        onClick={() => setPage(p)}
                        className={`px-2.5 py-1 text-sm rounded ${
                          p === page
                            ? 'bg-blue-600 text-white'
                            : 'hover:bg-slate-100 text-slate-600'
                        }`}
                      >
                        {p}
                      </button>
                    </span>
                  ))}
                <button
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={page >= totalPages}
                  className="p-1.5 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
