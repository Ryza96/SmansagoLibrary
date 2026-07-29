import { useState, useEffect } from 'react'
import { BookDetailDTO, CreateBookDTO, UpdateBookDTO, SelectOption } from '../../types/dtos/book'
import { LABELS } from '../../constants/labels'

interface BookFormProps {
  initialData?: BookDetailDTO | null
  authors: SelectOption[]
  publishers: SelectOption[]
  categories: SelectOption[]
  onSubmit: (data: CreateBookDTO | UpdateBookDTO) => Promise<void>
  onCancel: () => void
  isEdit: boolean
}

export default function BookForm({ initialData, authors, publishers, categories, onSubmit, onCancel, isEdit }: BookFormProps) {
  const [title, setTitle] = useState(initialData?.title ?? '')
  const [isbn, setIsbn] = useState(initialData?.isbn ?? '')
  const [categoryId, setCategoryId] = useState(initialData?.category?.id ?? '')
  const [publisherId, setPublisherId] = useState(initialData?.publisher?.id ?? '')
  const [publicationYear, setPublicationYear] = useState(initialData?.publicationYear?.toString() ?? '')
  const [description, setDescription] = useState(initialData?.description ?? '')
  const [selectedAuthorIds, setSelectedAuthorIds] = useState<string[]>(
    initialData?.authors.map((a) => a.id) ?? []
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  function validate(): boolean {
    const newErrors: Record<string, string> = {}
    if (!title.trim()) {
      newErrors.title = LABELS.VALIDATION.TITLE_REQUIRED
    }
    if (publicationYear && isNaN(Number(publicationYear))) {
      newErrors.publicationYear = LABELS.VALIDATION.YEAR_NUMBER
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    const data: any = {
      title: title.trim(),
      isbn: isbn.trim() || undefined,
      categoryId: categoryId || undefined,
      publisherId: publisherId || undefined,
      publicationYear: publicationYear ? Number(publicationYear) : undefined,
      description: description.trim() || undefined,
      authorIds: selectedAuthorIds
    }

    await onSubmit(data)
  }

  function toggleAuthor(authorId: string) {
    setSelectedAuthorIds((prev) =>
      prev.includes(authorId) ? prev.filter((id) => id !== authorId) : [...prev, authorId]
    )
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          {LABELS.FIELD.TITLE} <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.title ? 'border-red-400' : 'border-slate-300'}`}
        />
        {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{LABELS.FIELD.ISBN}</label>
          <input
            type="text"
            value={isbn}
            onChange={(e) => setIsbn(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{LABELS.FIELD.YEAR}</label>
          <input
            type="text"
            value={publicationYear}
            onChange={(e) => setPublicationYear(e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.publicationYear ? 'border-red-400' : 'border-slate-300'}`}
          />
          {errors.publicationYear && <p className="text-red-500 text-xs mt-1">{errors.publicationYear}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{LABELS.FIELD.CATEGORY}</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{LABELS.PLACEHOLDER.SELECT_CATEGORY}</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{LABELS.FIELD.PUBLISHER}</label>
          <select
            value={publisherId}
            onChange={(e) => setPublisherId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{LABELS.PLACEHOLDER.SELECT_PUBLISHER}</option>
            {publishers.map((pub) => (
              <option key={pub.id} value={pub.id}>{pub.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{LABELS.FIELD.AUTHORS}</label>
        <div className="border border-slate-300 rounded-lg p-2 max-h-32 overflow-y-auto">
          {authors.length === 0 ? (
            <p className="text-slate-400 text-sm p-2">{LABELS.PLACEHOLDER.NO_DATA}</p>
          ) : (
            authors.map((author) => (
              <label key={author.id} className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 rounded cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={selectedAuthorIds.includes(author.id)}
                  onChange={() => toggleAuthor(author.id)}
                  className="rounded"
                />
                {author.name}
              </label>
            ))
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{LABELS.FIELD.DESCRIPTION}</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          {LABELS.BOOK.SAVE}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
        >
          {LABELS.BOOK.CANCEL}
        </button>
      </div>
    </form>
  )
}
