import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, BookmarkCheck } from 'lucide-react'
import SearchableSelect from '../components/ui/SearchableSelect'
import { useNotification } from '../notification/NotificationContext'
import { getMemberType } from '../shared/config/member-type'
import type { CreateBorrowingInput } from '../types/dtos/borrowing'
import type { MemberDTO } from '../types/dtos/member'
import { receiptPreviewPath } from '../utils/navigation'
import { LABELS } from '../utils/labels'

interface BookEntry {
  bookCopyId: string
  barcode: string
  inventoryNumber: string
  title: string
}

function useDebounce<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const fnRef = useRef(fn)
  fnRef.current = fn

  return useCallback((...args: any[]) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => fnRef.current(...args), delay)
  }, [delay]) as T
}

export default function BorrowingPage() {
  const navigate = useNavigate()
  const { notify } = useNotification()
  const barcodeRef = useRef<HTMLInputElement>(null)
  const [barcode, setBarcode] = useState('')
  const [books, setBooks] = useState<BookEntry[]>([])
  const [memberOptions, setMemberOptions] = useState<{ id: string; name: string }[]>([])
  const [selectedMember, setSelectedMember] = useState<MemberDTO | null>(null)
  const [memberEligibility, setMemberEligibility] = useState<boolean | null>(null)
  const [memberStats, setMemberStats] = useState<{ activeBookCount: number; nearestDueDate: string | null } | null>(null)
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)

  const canSave = selectedMember !== null && books.length > 0 && dueDate !== '' && !saving

  useEffect(() => {
    barcodeRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!selectedMember) return
    window.electronAPI.borrowings.getMemberBorrowingStats(selectedMember.id).then(setMemberStats)
  }, [selectedMember])

  useEffect(() => {
    if (!selectedMember) {
      setMemberEligibility(null)
      return
    }
    const memberType = getMemberType(selectedMember.memberType)
    const hasAcademicRecord = memberType?.hasAcademicRecord === true
    if (!hasAcademicRecord) {
      setMemberEligibility(selectedMember.status === 'ACTIVE')
      return
    }
    window.electronAPI.enrollments
      .findActiveByMember(selectedMember.id)
      .then((enrollment) => setMemberEligibility(enrollment !== null))
  }, [selectedMember])

  const fetchMembers = useDebounce(async (query: string) => {
    if (!query.trim()) {
      setMemberOptions([])
      return
    }
    const result = await window.electronAPI.members.findMany(query, 1, 20)
    setMemberOptions(result.data.map((m: MemberDTO) => ({ id: m.id, name: m.fullName })))
  }, 300)

  function handleMemberSelect(id: string | string[]) {
    const memberId = id as string
    if (!memberId) {
      setSelectedMember(null)
      setMemberStats(null)
      return
    }
    window.electronAPI.members.findById(memberId).then(setSelectedMember)
  }

  function handleMemberClear() {
    setSelectedMember(null)
    setMemberStats(null)
    setMemberOptions([])
  }

  async function handleBarcodeKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Enter' || !barcode.trim()) return
    e.preventDefault()

    const existing = books.find((b) => b.barcode === barcode.trim())
    if (existing) {
      alert('Buku sudah dipilih.')
      setBarcode('')
      barcodeRef.current?.focus()
      return
    }

    const copy = await window.electronAPI.bookCopies.findByBarcode(barcode.trim())
    if (!copy) {
      alert('Barcode tidak ditemukan.')
      setBarcode('')
      barcodeRef.current?.focus()
      return
    }

    if (copy.status !== 'AVAILABLE') {
      alert('Buku tidak tersedia.')
      setBarcode('')
      barcodeRef.current?.focus()
      return
    }

    setBooks((prev) => [
      ...prev,
      {
        bookCopyId: copy.id,
        barcode: copy.barcode ?? '',
        inventoryNumber: copy.inventoryNumber,
        title: copy.book?.title ?? ''
      }
    ])
    setBarcode('')
    barcodeRef.current?.focus()
  }

  function removeBook(bookCopyId: string) {
    setBooks((prev) => prev.filter((b) => b.bookCopyId !== bookCopyId))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const input: CreateBorrowingInput = {
        memberId: selectedMember!.id,
        dueDate,
        bookCopyIds: books.map((b) => b.bookCopyId)
      }
      const result = await window.electronAPI.borrowings.create(input)
      notify.success('Transaksi berhasil disimpan.')
      navigate(receiptPreviewPath(result.id))
      setBooks([])
      setSelectedMember(null)
      setMemberStats(null)
      setMemberOptions([])
      setDueDate('')
      setBarcode('')
      barcodeRef.current?.focus()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan saat menyimpan transaksi.'
      alert(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Peminjaman</h1>

      <div className="flex gap-6">
        <div className="flex-1 min-w-0 space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Scan Barcode
            </label>
            <input
              ref={barcodeRef}
              type="text"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onKeyDown={handleBarcodeKeyDown}
              placeholder="Input Barcode"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-slate-200">
            <div className="px-4 py-3 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-700">Daftar Buku</h2>
            </div>
            {books.length === 0 ? (
              <div className="p-4 text-sm text-slate-400 text-center py-8">
                Belum ada buku dipilih.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-500 text-xs uppercase">
                      <th className="text-left px-4 py-3 font-medium">Barcode</th>
                      <th className="text-left px-4 py-3 font-medium">Inventaris</th>
                      <th className="text-left px-4 py-3 font-medium">Judul Buku</th>
                      <th className="text-center px-4 py-3 font-medium w-20">Hapus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {books.map((book) => (
                      <tr key={book.bookCopyId} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="px-4 py-2.5 text-slate-700">{book.barcode}</td>
                        <td className="px-4 py-2.5 text-slate-700">{book.inventoryNumber}</td>
                        <td className="px-4 py-2.5 text-slate-700">{book.title}</td>
                        <td className="px-4 py-2.5 text-center">
                          <button
                            onClick={() => removeBook(book.bookCopyId)}
                            className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Hapus"
                          >
                            <X size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="w-80 shrink-0 space-y-4">
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
            <SearchableSelect
              options={memberOptions}
              value={selectedMember?.id ?? ''}
              onChange={handleMemberSelect}
              onSearch={fetchMembers}
              placeholder="Cari nama / nomor anggota..."
              label="Cari Anggota"
              selectedOption={selectedMember ? { id: selectedMember.id, name: selectedMember.fullName } : undefined}
            />
            {selectedMember && (
              <button
                onClick={handleMemberClear}
                className="mt-2 text-xs text-red-500 hover:text-red-700 transition-colors"
              >
                Hapus pilihan
              </button>
            )}
          </div>

          {selectedMember && (
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 space-y-2">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Informasi Anggota
              </h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Nama</span>
                  <span className="text-slate-800 font-medium text-right">{selectedMember.fullName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Nomor Anggota</span>
                  <span className="text-slate-800">{selectedMember.memberNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">
                    {getMemberType(selectedMember.memberType)?.hasAcademicRecord
                      ? LABELS.FIELD.BORROW_ELIGIBILITY
                      : LABELS.FIELD.MEMBERSHIP_STATUS}
                  </span>
                  <span className={`font-medium ${memberEligibility ? 'text-green-600' : 'text-slate-400'}`}>
                    {getMemberType(selectedMember.memberType)?.hasAcademicRecord
                      ? memberEligibility
                        ? LABELS.MEMBER.ELIGIBLE
                        : LABELS.MEMBER.NOT_ELIGIBLE
                      : memberEligibility
                        ? LABELS.FIELD.ACTIVE
                        : LABELS.FIELD.INACTIVE}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Jumlah Buku Aktif</span>
                  <span className="text-slate-800">{memberStats?.activeBookCount ?? '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Due Date Terdekat</span>
                  <span className="text-slate-800">
                    {memberStats?.nearestDueDate
                      ? new Date(memberStats.nearestDueDate).toLocaleDateString('id-ID')
                      : '-'}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Due Date
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 space-y-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Ringkasan
            </h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Jumlah Buku</span>
                <span className="text-slate-800 font-medium">{books.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Nama Anggota</span>
                <span className="text-slate-800 text-right">{selectedMember?.fullName ?? '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Due Date</span>
                <span className="text-slate-800">
                  {dueDate ? new Date(dueDate).toLocaleDateString('id-ID') : '-'}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={!canSave}
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <BookmarkCheck size={18} />
            {saving ? 'Menyimpan...' : 'SIMPAN TRANSAKSI'}
          </button>
        </div>
      </div>
    </div>
  )
}
