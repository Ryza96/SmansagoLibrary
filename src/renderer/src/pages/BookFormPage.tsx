import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { BookDetailDTO, SelectOption, CreateBookDTO, UpdateBookDTO } from '../types/dtos/book'
import BookForm from '../components/books/BookForm'
import { LABELS } from '../constants/labels'

const api = window.electronAPI

export default function BookFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id

  const [initialData, setInitialData] = useState<BookDetailDTO | null>(null)
  const [authors, setAuthors] = useState<SelectOption[]>([])
  const [publishers, setPublishers] = useState<SelectOption[]>([])
  const [categories, setCategories] = useState<SelectOption[]>([])
  const [loading, setLoading] = useState(true)

  async function loadOptions() {
    const [authorList, publisherList, categoryList] = await Promise.all([
      api.authors.findMany(),
      api.publishers.findMany(),
      api.categories.findMany()
    ])
    setAuthors(authorList)
    setPublishers(publisherList)
    setCategories(categoryList)
  }

  useEffect(() => {
    async function load() {
      await loadOptions()

      if (isEdit && id) {
        const book = await api.books.findById(id)
        setInitialData(book)
      }

      setLoading(false)
    }
    load()
  }, [id, isEdit])

  async function handleSubmit(data: CreateBookDTO | UpdateBookDTO) {
    if (isEdit && id) {
      await api.books.update(id, data)
    } else {
      await api.books.create(data as CreateBookDTO)
    }
    navigate(-1)
  }

  async function handleAddAuthor(name: string) {
    await api.authors.create({ name })
    await loadOptions()
  }

  async function handleAddPublisher(name: string) {
    await api.publishers.create({ name })
    await loadOptions()
  }

  async function handleAddCategory(name: string) {
    const code = name.slice(0, 10).toUpperCase().replace(/\s+/g, '_')
    await api.categories.create({ code, name })
    await loadOptions()
  }

  if (loading) {
    return <p className="text-slate-400 text-sm">{LABELS.PLACEHOLDER.LOADING}</p>
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
        <h1 className="text-2xl font-bold text-slate-800">
          {isEdit ? LABELS.BOOK.EDIT : LABELS.BOOK.NEW}
        </h1>
      </div>

      <BookForm
        initialData={initialData}
        authors={authors}
        publishers={publishers}
        categories={categories}
        onSubmit={handleSubmit}
        onCancel={() => navigate(-1)}
        isEdit={isEdit}
        onAddAuthor={handleAddAuthor}
        onAddPublisher={handleAddPublisher}
        onAddCategory={handleAddCategory}
      />
    </div>
  )
}
