import { useState, useRef, useEffect } from 'react'
import { Undo2, BookOpen, User, Calendar, Printer } from 'lucide-react'
import type { BorrowingByBarcodeResult, ReturnBookInput } from '../types/dtos/borrowing'

const CONDITIONS = ['BAIK', 'RUSAK', 'HILANG'] as const

export default function ReturnsPage() {
  const barcodeRef = useRef<HTMLInputElement>(null)
  const [barcode, setBarcode] = useState('')
  const [data, setData] = useState<BorrowingByBarcodeResult | null>(null)
  const [condition, setCondition] = useState<string>('BAIK')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [lastSuccessBorrowingId, setLastSuccessBorrowingId] = useState<string | null>(null)
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    barcodeRef.current?.focus()
  }, [])

  async function handleBarcodeKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Enter' || !barcode.trim()) return
    e.preventDefault()

    try {
      const result = await window.electronAPI.returns.findByBarcode(barcode.trim())
      setData(result)
      setCondition('BAIK')
      setNotes('')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan.'
      alert(message)
      setBarcode('')
      barcodeRef.current?.focus()
    }
  }

  async function handleReturn() {
    if (!data) return
    setSaving(true)
    try {
      const input: ReturnBookInput = {
        bookCopyId: data.bookCopyId,
        condition: condition as ReturnBookInput['condition'],
        notes: notes.trim() || undefined
      }
      const result = await window.electronAPI.returns.returnBook(input)
      setLastSuccessBorrowingId(result.id)
      alert('Buku berhasil dikembalikan.')
      setData(null)
      setBarcode('')
      setCondition('BAIK')
      setNotes('')
      barcodeRef.current?.focus()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan saat mengembalikan buku.'
      alert(message)
    } finally {
      setSaving(false)
    }
  }

  async function handlePrintReceipt() {
    if (!lastSuccessBorrowingId) return
    setPrinting(true)
    try {
      await window.electronAPI.print.returnReceipt(lastSuccessBorrowingId)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal mencetak.'
      alert(message)
    } finally {
      setPrinting(false)
    }
  }

  function resetForm() {
    setData(null)
    setBarcode('')
    setCondition('BAIK')
    setNotes('')
    barcodeRef.current?.focus()
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Pengembalian</h1>

      <div className="flex gap-6">
        <div className="flex-1 min-w-0 space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Scan Barcode Buku
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

          {data && (
            <>
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 space-y-3">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <BookOpen size={14} />
                  Informasi Buku
                </h3>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Barcode</span>
                    <span className="text-slate-800">{data.barcode}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Nomor Inventaris</span>
                    <span className="text-slate-800">{data.inventoryNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Judul Buku</span>
                    <span className="text-slate-800 font-medium text-right max-w-[60%]">{data.bookTitle}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 space-y-3">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <User size={14} />
                  Informasi Peminjaman
                </h3>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Nama Anggota</span>
                    <span className="text-slate-800 font-medium">{data.memberName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Nomor Anggota</span>
                    <span className="text-slate-800">{data.memberNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tanggal Pinjam</span>
                    <span className="text-slate-800">{new Date(data.borrowDate).toLocaleDateString('id-ID')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Due Date</span>
                    <span className="text-slate-800">{new Date(data.dueDate).toLocaleDateString('id-ID')}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="w-80 shrink-0 space-y-4">
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 space-y-3">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Kondisi Buku
            </h3>
            <div className="space-y-2">
              {CONDITIONS.map((c) => (
                <label key={c} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="radio"
                    name="condition"
                    value={c}
                    checked={condition === c}
                    onChange={(e) => setCondition(e.target.value)}
                    className="accent-blue-600"
                  />
                  {c}
                </label>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Catatan
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Catatan (opsional)..."
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 space-y-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar size={14} />
              Ringkasan
            </h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Status</span>
                <span className="text-slate-800 font-medium text-yellow-600">Dipinjam</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Tanggal Kembali</span>
                <span className="text-slate-800">
                  {new Date().toLocaleDateString('id-ID')}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleReturn}
            disabled={!data || saving}
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Undo2 size={18} />
            {saving ? 'Memproses...' : 'KEMBALIKAN BUKU'}
          </button>

          {lastSuccessBorrowingId && (
            <div className="bg-green-50 rounded-lg border border-green-200 p-4 space-y-2">
              <p className="text-sm text-green-700 font-medium">Buku berhasil dikembalikan!</p>
              <button
                onClick={handlePrintReceipt}
                disabled={printing}
                className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-white text-green-700 text-sm font-medium rounded-lg border border-green-300 hover:bg-green-100 disabled:opacity-50 transition-colors"
              >
                <Printer size={18} />
                {printing ? 'Mencetak...' : 'CETAK BUKTI'}
              </button>
            </div>
          )}

          {data && (
            <button
              onClick={resetForm}
              className="flex items-center justify-center gap-2 w-full px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
