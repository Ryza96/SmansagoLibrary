import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { BookDetailDTO, BookCopyDTO } from '../types/dtos/book'
import type { BookLabelData } from '../shared/dto/print'
import { LABELS } from '../utils/labels'

const api = window.electronAPI

export default function LabelPreviewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [html, setHtml] = useState('')
  const [labelData, setLabelData] = useState<BookLabelData | null>(null)
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!id) return
      setLoading(true)
      setError('')
      try {
        const [book, copies, settings] = await Promise.all([
          api.books.findById(id),
          api.bookCopies.findByBookId(id),
          api.settings.get()
        ])
        if (!book) {
          throw new Error(LABELS.LABEL_PREVIEW.BOOK_NOT_FOUND)
        }

        const data: BookLabelData = {
          libraryName: settings.libraryName,
          bookTitle: book.title,
          items: copies.map((copy: BookCopyDTO) => ({
            barcode: copy.barcode ?? copy.inventoryNumber,
            inventoryNumber: copy.inventoryNumber,
            shelfLocation: copy.shelfLocation ?? ''
          }))
        }

        const previewHtml = await api.print.getLabelPreviewHtml(data)
        if (cancelled) return
        setLabelData(data)
        setHtml(previewHtml)
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : LABELS.LABEL_PREVIEW.ERROR)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [id])

  async function handlePrint() {
    if (!labelData) return
    setPrinting(true)
    try {
      await api.print.bookLabels(labelData)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal mencetak label.'
      alert(message)
    } finally {
      setPrinting(false)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 rounded hover:bg-slate-200 transition-colors text-slate-500"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-slate-800">{LABELS.LABEL_PREVIEW.TITLE}</h1>
        <button
          onClick={handlePrint}
          disabled={!labelData || printing}
          className="flex items-center gap-1.5 ml-auto px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Printer size={16} />
          {printing ? LABELS.LABEL_PREVIEW.PRINTING : LABELS.LABEL_PREVIEW.PRINT}
        </button>
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm">{LABELS.LABEL_PREVIEW.LOADING}</p>
      ) : error ? (
        <p className="text-red-500 text-sm">{error}</p>
      ) : html ? (
        <div className="preview-sheet overflow-auto" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <p className="text-slate-400 text-sm">{LABELS.LABEL_PREVIEW.NO_DATA}</p>
      )}
    </div>
  )
}
