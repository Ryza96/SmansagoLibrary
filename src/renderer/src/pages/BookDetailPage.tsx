import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Pencil } from 'lucide-react'
import { BookDetailDTO } from '../types/dtos/book'
import BookDetail from '../components/books/BookDetail'
import { LABELS } from '../constants/labels'
import { bookEditPath } from '../config/navigation'

const api = window.electronAPI

export default function BookDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [book, setBook] = useState<BookDetailDTO | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    api.books.findById(id).then((data: BookDetailDTO | null) => {
      setBook(data)
      setLoading(false)
    })
  }, [id])

  if (loading) {
    return <p className="text-slate-400 text-sm">{LABELS.PLACEHOLDER.LOADING}</p>
  }

  if (!book) {
    return <p className="text-slate-400 text-sm">{LABELS.PLACEHOLDER.NO_DATA}</p>
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
        <h1 className="text-2xl font-bold text-slate-800">{LABELS.BOOK.DETAIL}</h1>
        <button
          onClick={() => navigate(bookEditPath(book.id))}
          className="flex items-center gap-1.5 ml-auto px-3 py-2 border border-slate-300 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
        >
          <Pencil size={16} />
          {LABELS.BOOK.EDIT}
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <BookDetail book={book} />
      </div>
    </div>
  )
}
