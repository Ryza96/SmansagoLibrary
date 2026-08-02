import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, RefreshCw, Upload } from 'lucide-react'
import { BookListItemDTO } from '../types/dtos/book'
import BookTable from '../components/books/BookTable'
import { LABELS } from '../utils/labels'
import { ROUTES } from '../utils/navigation'

const api = window.electronAPI

export default function BooksPage() {
  const navigate = useNavigate()
  const [books, setBooks] = useState<BookListItemDTO[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  async function fetchBooks() {
    setLoading(true)
    try {
      const data = await api.books.findMany()
      setBooks(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBooks()
  }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return books
    const q = search.toLowerCase()
    return books.filter(
      (b) => b.title.toLowerCase().includes(q) || (b.isbn && b.isbn.toLowerCase().includes(q))
    )
  }, [books, search])

  async function handleDelete(id: string) {
    if (!window.confirm(LABELS.BOOK.CONFIRM_DELETE)) return
    try {
      await api.books.delete(id)
      setBooks((prev) => prev.filter((b) => b.id !== id))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : LABELS.BOOK.DELETE_ERROR
      alert(message)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">{LABELS.BOOK.TITLE}</h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200">
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={LABELS.BOOK.SEARCH_PLACEHOLDER}
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={fetchBooks}
              className="p-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              title={LABELS.BOOK.REFRESH}
            >
              <RefreshCw size={16} className="text-slate-500" />
            </button>
            <button
              onClick={() => navigate(ROUTES.BOOK_IMPORT)}
              className="flex items-center gap-1.5 ml-auto px-3 py-2 border border-slate-300 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Upload size={16} />
              {LABELS.BOOK.IMPORT}
            </button>
            <button
              onClick={() => navigate(ROUTES.BOOK_NEW)}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={16} />
              {LABELS.BOOK.NEW}
            </button>
          </div>
        </div>

        <div className="p-4">
          {loading ? (
            <p className="text-slate-400 text-sm text-center py-8">{LABELS.PLACEHOLDER.LOADING}</p>
          ) : (
            <BookTable books={filtered} onDelete={handleDelete} />
          )}
        </div>
      </div>
    </div>
  )
}
