import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Undo2, Search, BookOpen, User, ChevronRight, CheckCircle, Printer } from 'lucide-react'
import { useNotification } from '../notification/NotificationContext'
import { receiptPreviewPath, returnReceiptPreviewPath } from '../utils/navigation'
import type { BorrowingDTO, ReturnCondition } from '../types/dtos/borrowing'

const CONDITIONS = ['BAIK', 'RUSAK', 'HILANG'] as const
type EntryMode = 'barcode' | 'borrowNumber'

interface ReturnResult {
  returnedCount: number
  stillBorrowedCount: number
  borrowingId: string
  borrowingNumber: string
  memberName: string
  returnedBookIds: string[]
  returnedBooks: { bookTitle: string; inventoryNumber: string; condition: string }[]
}

function formatLocalDate(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
}

function isOverdue(dueDate: string): boolean {
  return new Date(dueDate) < new Date()
}

export default function ReturnsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { notify } = useNotification()

  const barcodeInputRef = useRef<HTMLInputElement>(null)
  const borrowNumberInputRef = useRef<HTMLInputElement>(null)

  const [entryMode, setEntryMode] = useState<EntryMode>('barcode')
  const [barcodeInput, setBarcodeInput] = useState('')
  const [borrowNumberInput, setBorrowNumberInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [returning, setReturning] = useState(false)

  // Transaction state
  const [transaction, setTransaction] = useState<BorrowingDTO | null>(null)
  const [selectedDetailIds, setSelectedDetailIds] = useState<Set<string>>(new Set())
  const [conditions, setConditions] = useState<Map<string, ReturnCondition>>(new Map())
  const [returnResult, setReturnResult] = useState<ReturnResult | null>(null)

  const focusEntryInput = useCallback(() => {
    if (entryMode === 'barcode') {
      barcodeInputRef.current?.focus()
    } else {
      borrowNumberInputRef.current?.focus()
    }
  }, [entryMode])

  const resetTransaction = useCallback(() => {
    setTransaction(null)
    setSelectedDetailIds(new Set())
    setConditions(new Map())
  }, [])

  const resetAll = useCallback(() => {
    resetTransaction()
    setReturnResult(null)
    setBarcodeInput('')
    setBorrowNumberInput('')
    setEntryMode('barcode')
    setTimeout(() => barcodeInputRef.current?.focus(), 0)
  }, [resetTransaction])

  // Restore returnResult from route state (after navigate back from preview)
  useEffect(() => {
    const routeState = location.state as { returnResult?: ReturnResult } | null
    if (routeState?.returnResult) {
      setReturnResult(routeState.returnResult)
      // Clear the route state so it doesn't re-restore on next render
      window.history.replaceState({}, '')
    }
  }, [location.state])

  const handleEntryModeChange = useCallback(
    (mode: EntryMode) => {
      setEntryMode(mode)
      resetTransaction()
      setBarcodeInput('')
      setBorrowNumberInput('')
      setTimeout(() => {
        if (mode === 'barcode') barcodeInputRef.current?.focus()
        else borrowNumberInputRef.current?.focus()
      }, 0)
    },
    [resetTransaction]
  )

  // --- Lookup by barcode ---
  const handleBarcodeLookup = useCallback(async () => {
    const trimmed = barcodeInput.trim()
    if (!trimmed) return
    setLoading(true)
    try {
      // Step 1: find which borrowing has this barcode
      const barcodeResult = await window.electronAPI.returns.findByBarcode(trimmed)
      // Step 2: fetch full transaction
      const fullTransaction = await window.electronAPI.borrowings.findById(barcodeResult.borrowingId)
      setTransaction(fullTransaction)
      setSelectedDetailIds(new Set())
      setConditions(new Map())
      setBarcodeInput('')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Buku tidak ditemukan.'
      notify.error(message)
      setTimeout(() => barcodeInputRef.current?.focus(), 0)
    } finally {
      setLoading(false)
    }
  }, [barcodeInput, notify])

  // --- Lookup by borrow number ---
  const handleBorrowNumberLookup = useCallback(async () => {
    const trimmed = borrowNumberInput.trim()
    if (!trimmed) return
    setLoading(true)
    try {
      const fullTransaction = await window.electronAPI.returns.findByBorrowNumber(trimmed)
      setTransaction(fullTransaction)
      setSelectedDetailIds(new Set())
      setConditions(new Map())
      setBorrowNumberInput('')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Transaksi tidak ditemukan.'
      notify.error(message)
      setTimeout(() => borrowNumberInputRef.current?.focus(), 0)
    } finally {
      setLoading(false)
    }
  }, [borrowNumberInput, notify])

  // --- Toggle book selection ---
  const toggleDetail = useCallback(
    (detailId: string) => {
      setSelectedDetailIds((prev) => {
        const next = new Set(prev)
        if (next.has(detailId)) {
          next.delete(detailId)
          setConditions((prevCond) => {
            const nextCond = new Map(prevCond)
            nextCond.delete(detailId)
            return nextCond
          })
        } else {
          next.add(detailId)
          setConditions((prevCond) => {
            if (prevCond.has(detailId)) return prevCond
            const nextCond = new Map(prevCond)
            nextCond.set(detailId, 'BAIK')
            return nextCond
          })
        }
        return next
      })
    },
    []
  )

  // --- Change condition for a book ---
  const setCondition = useCallback((detailId: string, cond: ReturnCondition) => {
    setConditions((prev) => {
      const next = new Map(prev)
      next.set(detailId, cond)
      return next
    })
  }, [])

  // --- Batch return ---
  const handleBatchReturn = useCallback(async () => {
    if (!transaction || selectedDetailIds.size === 0) return

    // Validate all selected books have conditions set
    for (const id of selectedDetailIds) {
      if (!conditions.has(id)) {
        notify.error('Semua buku yang dipilih harus memiliki kondisi.')
        return
      }
    }

    setReturning(true)
    try {
      const books = Array.from(selectedDetailIds).map((id) => ({
        borrowDetailId: id,
        condition: conditions.get(id)!
      }))

      const result = await window.electronAPI.returns.batchReturn({
        borrowingId: transaction.id,
        books
      })

      const returnedBookIds = result.returnedBooks.map((b) => b.borrowDetailId)
      setReturnResult({
        returnedCount: result.returnedCount,
        stillBorrowedCount: result.stillBorrowedCount,
        borrowingId: transaction.id,
        borrowingNumber: transaction.borrowingNumber,
        memberName: transaction.memberName,
        returnedBookIds,
        returnedBooks: result.returnedBooks.map((b) => ({
          bookTitle: b.bookTitle,
          inventoryNumber: b.inventoryNumber,
          condition: b.condition
        }))
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal mengembalikan buku.'
      notify.error(message)
    } finally {
      setReturning(false)
    }
  }, [transaction, selectedDetailIds, conditions, notify])

  // --- Keyboard handler for inputs ---
  const handleBarcodeKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleBarcodeLookup()
      }
    },
    [handleBarcodeLookup]
  )

  const handleBorrowNumberKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleBorrowNumberLookup()
      }
    },
    [handleBorrowNumberLookup]
  )

  // Derived counts
  const activeItems = transaction?.items.filter((item) => item.status !== 'RETURNED') ?? []
  const returnedItems = transaction?.items.filter((item) => item.status === 'RETURNED') ?? []
  const selectedCount = Array.from(selectedDetailIds).filter(
    (id) => transaction?.items.find((item) => item.id === id)?.status !== 'RETURNED'
  ).length

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Pengembalian Buku</h1>

      {/* Entry Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200">
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => handleEntryModeChange('barcode')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              entryMode === 'barcode'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <BookOpen size={16} />
            Scan Barcode
          </button>
          <button
            onClick={() => handleEntryModeChange('borrowNumber')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              entryMode === 'borrowNumber'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Search size={16} />
            Nomor Transaksi
          </button>
        </div>

        <div className="p-4">
          {entryMode === 'barcode' ? (
            <div className="flex gap-3">
              <input
                ref={barcodeInputRef}
                type="text"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={handleBarcodeKeyDown}
                placeholder="Scan atau masukkan barcode buku..."
                disabled={loading || returning}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
              />
              <button
                onClick={handleBarcodeLookup}
                disabled={loading || returning || !barcodeInput.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <Search size={16} />
                )}
                Cari
              </button>
            </div>
          ) : (
            <div className="flex gap-3">
              <input
                ref={borrowNumberInputRef}
                type="text"
                value={borrowNumberInput}
                onChange={(e) => setBorrowNumberInput(e.target.value)}
                onKeyDown={handleBorrowNumberKeyDown}
                placeholder="Masukkan nomor transaksi (contoh: PJ2026080001)..."
                disabled={loading || returning}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
              />
              <button
                onClick={handleBorrowNumberLookup}
                disabled={loading || returning || !borrowNumberInput.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <Search size={16} />
                )}
                Cari
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Transaction Details */}
      {transaction && !returnResult && (
        <div className="space-y-6">
          {/* Transaction Info */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-3">
              <User size={14} />
              Informasi Transaksi
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-slate-500 block">Nomor Transaksi</span>
                <span className="text-slate-800 font-medium">{transaction.borrowingNumber}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Anggota</span>
                <span className="text-slate-800 font-medium">{transaction.memberName}</span>
                <span className="text-slate-400 text-xs block">{transaction.memberNumber}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Tanggal Pinjam</span>
                <span className="text-slate-800">{formatLocalDate(transaction.borrowDate)}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Jatuh Tempo</span>
                <span className={`font-medium ${isOverdue(transaction.dueDate) ? 'text-red-600' : 'text-slate-800'}`}>
                  {formatLocalDate(transaction.dueDate)}
                </span>
              </div>
            </div>
          </div>

          {/* Book List */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <BookOpen size={14} />
                Daftar Buku
              </h3>
              <div className="flex gap-4 text-xs text-slate-500">
                <span>Dipilih: <span className="font-medium text-slate-700">{selectedCount}</span></span>
                <span>Total: <span className="font-medium text-slate-700">{transaction.items.length}</span></span>
              </div>
            </div>

            <div className="space-y-2">
              {transaction.items.map((item, index) => {
                const isReturned = item.status === 'RETURNED'
                const isSelected = selectedDetailIds.has(item.id)

                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                      isReturned
                        ? 'bg-slate-50 border-slate-200 opacity-60'
                        : isSelected
                          ? 'bg-blue-50 border-blue-200'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleDetail(item.id)}
                      disabled={isReturned}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed"
                    />

                    {/* Index */}
                    <span className="text-xs text-slate-400 w-5 text-center">{index + 1}</span>

                    {/* Book Info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{item.bookTitle}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-2">
                        <span>{item.inventoryNumber}</span>
                        {item.barcode && <span className="text-slate-400">|</span>}
                        {item.barcode && <span>{item.barcode}</span>}
                      </div>
                    </div>

                    {/* Status / Condition */}
                    {isReturned ? (
                      <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded">
                        Sudah Dikembalikan
                      </span>
                    ) : isSelected ? (
                      <select
                        value={conditions.get(item.id) ?? 'BAIK'}
                        onChange={(e) => setCondition(item.id, e.target.value as ReturnCondition)}
                        disabled={returning}
                        className="text-xs px-2 py-1.5 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
                      >
                        {CONDITIONS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded">
                        Dipinjam
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex items-center justify-between bg-white rounded-lg shadow-sm border border-slate-200 p-4">
            <div className="text-sm text-slate-500">
              {selectedCount > 0 ? (
                <>
                  <span className="font-medium text-slate-700">{selectedCount}</span> buku akan dikembalikan
                </>
              ) : (
                'Pilih buku yang ingin dikembalikan'
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={resetAll}
                disabled={returning}
                className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-50"
              >
                Reset
              </button>

              <button
                onClick={() => {
                  resetTransaction()
                  focusEntryInput()
                }}
                disabled={returning}
                className="flex items-center gap-1 px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                Cari Transaksi Lain
                <ChevronRight size={14} />
              </button>

              <button
                onClick={handleBatchReturn}
                disabled={selectedCount === 0 || returning}
                className="flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {returning ? (
                  <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <Undo2 size={18} />
                )}
                {returning ? 'Memproses...' : 'KEMBALIKAN BUKU'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success panel after return */}
      {returnResult && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle size={24} className="text-green-600" />
              <h2 className="text-lg font-bold text-slate-800">Pengembalian Berhasil</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="text-sm text-green-700">
                  <span className="font-bold text-lg">{returnResult.returnedCount}</span> buku dikembalikan
                </div>
                {returnResult.stillBorrowedCount > 0 && (
                  <div className="text-xs text-green-600 mt-1">
                    {returnResult.stillBorrowedCount} buku masih dipinjam
                  </div>
                )}
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <div className="text-xs text-slate-500">Transaksi</div>
                <div className="text-sm font-medium text-slate-800">{returnResult.borrowingNumber}</div>
                <div className="text-xs text-slate-500">{returnResult.memberName}</div>
              </div>
            </div>

            {/* Returned books detail */}
            <div className="mb-6">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Buku Dikembalikan</h3>
              <div className="space-y-1">
                {returnResult.returnedBooks.map((book, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm px-3 py-2 bg-slate-50 rounded-lg">
                    <span className="text-xs text-slate-400 w-5 text-center">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-slate-800 truncate block">{book.bookTitle}</span>
                      <span className="text-xs text-slate-500">{book.inventoryNumber}</span>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                      book.condition === 'BAIK'
                        ? 'text-green-600 bg-green-50'
                        : book.condition === 'RUSAK'
                          ? 'text-amber-600 bg-amber-50'
                          : 'text-red-600 bg-red-50'
                    }`}>
                      {book.condition}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3">
              {returnResult.stillBorrowedCount > 0 && (
                <button
                  onClick={() =>
                    navigate(receiptPreviewPath(returnResult.borrowingId), {
                      state: { activeOnly: true, returnResult }
                    })
                  }
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Printer size={16} />
                  Cetak Kartu Peminjaman
                </button>
              )}

              <button
                onClick={() =>
                  navigate(returnReceiptPreviewPath(returnResult.borrowingId), {
                    state: { returnedBookIds: returnResult.returnedBookIds, returnResult }
                  })
                }
                className="flex items-center gap-2 px-5 py-2.5 bg-slate-700 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors"
              >
                <Printer size={16} />
                Cetak Bukti Pengembalian
              </button>

              <button
                onClick={resetAll}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors ml-auto"
              >
                Cari Transaksi Lain
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state when no transaction loaded */}
      {!transaction && !loading && (
        <div className="text-center py-12 text-slate-400">
          <BookOpen size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-sm">Scan barcode buku atau masukkan nomor transaksi untuk memulai pengembalian.</p>
        </div>
      )}
    </div>
  )
}
