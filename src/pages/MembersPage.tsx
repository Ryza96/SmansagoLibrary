import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'
import type { MemberDTO } from '../shared/dto/member'
import { LABELS } from '../utils/labels'
import { memberTypeLabel } from '../shared/config/member-type'
import { ROUTES, memberEditPath } from '../utils/navigation'

const api = window.electronAPI

export default function MembersPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<MemberDTO[]>([])
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  const [query, setQuery] = useState({ search: '', page: 1 })
  const limit = 10

  async function fetchMembers() {
    setLoading(true)
    try {
      const result = await api.members.findMany(query.search || undefined, query.page, limit)
      setData(result.data)
      setTotalPages(result.totalPages)
      setTotal(result.total)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMembers()
  }, [query.search, query.page])

  async function handleDelete(m: MemberDTO) {
    if (!window.confirm(`Hapus anggota ${m.fullName} (${m.memberNumber})?`)) return
    await api.members.delete(m.id)
    fetchMembers()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">{LABELS.MEMBER.TITLE}</h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200">
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={query.search}
                onChange={(e) => setQuery({ search: e.target.value, page: 1 })}
                placeholder="Cari nama atau nomor anggota..."
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={fetchMembers}
              className="p-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              title="Refresh"
            >
              <RefreshCw size={16} className="text-slate-500" />
            </button>
            <button
              onClick={() => navigate(ROUTES.MEMBERS_NEW)}
              className="flex items-center gap-1.5 ml-auto px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={16} />
              {LABELS.MEMBER.NEW}
            </button>
          </div>
        </div>

        <div className="p-4">
          {loading ? (
            <p className="text-slate-400 text-sm text-center py-8">{LABELS.PLACEHOLDER.LOADING}</p>
          ) : data.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">{LABELS.PLACEHOLDER.NO_DATA}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="pb-3 font-medium">Nomor Anggota</th>
                    <th className="pb-3 font-medium">Nama</th>
                    <th className="pb-3 font-medium">{LABELS.FIELD.MEMBERSHIP_STATUS}</th>
                    <th className="pb-3 font-medium">Kelas</th>
                    <th className="pb-3 font-medium">Jenis Anggota</th>
                    <th className="pb-3 font-medium w-24">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((m) => (
                    <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 text-slate-700">{m.memberNumber}</td>
                      <td className="py-3 text-slate-700">{m.fullName}</td>
                      <td className="py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          m.status === 'ACTIVE'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                          {m.status === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="py-3 text-slate-600">
                        {m.classInfo
                          ? `${m.classInfo.educationLevel} ${m.classInfo.parallel}`
                          : '-'}
                      </td>
                      <td className="py-3 text-slate-600">
                        {memberTypeLabel(m.memberType) ?? m.memberType ?? '-'}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => navigate(memberEditPath(m.id))}
                            className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                          >
                            {LABELS.ACTION.EDIT}
                          </button>
                          <button
                            onClick={() => handleDelete(m)}
                            className="text-red-600 hover:text-red-800 text-xs font-medium"
                          >
                            {LABELS.ACTION.DELETE}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-slate-200 mt-4">
              <p className="text-sm text-slate-500">
                Total {total} anggota
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setQuery((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                  disabled={query.page <= 1}
                  className="p-1.5 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={16} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - query.page) <= 2)
                  .map((p, idx, arr) => (
                    <span key={p} className="flex items-center">
                      {idx > 0 && arr[idx - 1] !== p - 1 && (
                        <span className="px-1 text-slate-400">...</span>
                      )}
                      <button
                        onClick={() => setQuery((prev) => ({ ...prev, page: p }))}
                        className={`px-2.5 py-1 text-sm rounded ${
                          p === query.page
                            ? 'bg-blue-600 text-white'
                            : 'hover:bg-slate-100 text-slate-600'
                        }`}
                      >
                        {p}
                      </button>
                    </span>
                  ))}
                <button
                  onClick={() => setQuery((prev) => ({ ...prev, page: Math.min(totalPages, prev.page + 1) }))}
                  disabled={query.page >= totalPages}
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
