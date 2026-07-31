import { useState } from 'react'
import { BookDetailDTO, CreateBookDTO, UpdateBookDTO, SelectOption } from '../../types/dtos/book'
import { LABELS } from '../../utils/labels'
import SearchableSelect from '../ui/SearchableSelect'
import InlineAddModal from '../ui/InlineAddModal'

interface BookFormProps {
  initialData?: BookDetailDTO | null
  authors: SelectOption[]
  publishers: SelectOption[]
  categories: SelectOption[]
  onSubmit: (data: CreateBookDTO | UpdateBookDTO) => Promise<void>
  onCancel: () => void
  isEdit: boolean
  onAddAuthor?: (name: string) => Promise<void>
  onAddPublisher?: (name: string) => Promise<void>
  onAddCategory?: (name: string) => Promise<void>
}

export default function BookForm({
  initialData, authors, publishers, categories,
  onSubmit, onCancel, isEdit,
  onAddAuthor, onAddPublisher, onAddCategory
}: BookFormProps) {
  const [title, setTitle] = useState(initialData?.title ?? '')
  const [isbn, setIsbn] = useState(initialData?.isbn ?? '')
  const [categoryId, setCategoryId] = useState(initialData?.category?.id ?? '')
  const [publisherId, setPublisherId] = useState(initialData?.publisher?.id ?? '')
  const [publicationYear, setPublicationYear] = useState(initialData?.publicationYear?.toString() ?? '')
  const [description, setDescription] = useState(initialData?.description ?? '')
  const [selectedAuthorIds, setSelectedAuthorIds] = useState<string[]>(
    initialData?.authors.map((a) => a.id) ?? []
  )

  const [language, setLanguage] = useState(initialData?.language ?? '')
  const [edition, setEdition] = useState(initialData?.edition ?? '')
  const [pageCount, setPageCount] = useState(initialData?.pageCount?.toString() ?? '')

  const [errors, setErrors] = useState<Record<string, string>>({})

  const [showAddAuthor, setShowAddAuthor] = useState(false)
  const [showAddPublisher, setShowAddPublisher] = useState(false)
  const [showAddCategory, setShowAddCategory] = useState(false)

  function validate(): boolean {
    const newErrors: Record<string, string> = {}
    if (!title.trim()) newErrors.title = 'Judul buku wajib diisi.'
    if (publicationYear && isNaN(Number(publicationYear))) newErrors.publicationYear = 'Tahun terbit harus berupa angka.'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    const data: CreateBookDTO | UpdateBookDTO = {
      title: title.trim(),
      isbn: isbn.trim() || undefined,
      categoryId: categoryId || undefined,
      publisherId: publisherId || undefined,
      publicationYear: publicationYear ? Number(publicationYear) : undefined,
      description: description.trim() || undefined,
      authorIds: selectedAuthorIds,
      edition: edition.trim() || undefined,
      language: language || undefined,
      pageCount: pageCount ? Number(pageCount) : undefined,
    }

    await onSubmit(data)
  }

  const authorNames = selectedAuthorIds
    .map((id) => authors.find((a) => a.id === id)?.name)
    .filter(Boolean) as string[]

  const publisherName = publishers.find((p) => p.id === publisherId)?.name
  const categoryName = categories.find((c) => c.id === categoryId)?.name

  return (
    <>
      <form onSubmit={handleSubmit}>
        <div className="flex gap-6">
          <div className="flex-1 min-w-0 space-y-6">
            <Section title={LABELS.BOOK_SECTION.MAIN_INFO}>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {LABELS.FIELD.TITLE} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Masukkan judul buku"
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
                    placeholder="Contoh: 978-602-1234-56-7"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {LABELS.FIELD.YEAR} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={publicationYear}
                    onChange={(e) => setPublicationYear(e.target.value)}
                    placeholder="Contoh: 2024"
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.publicationYear ? 'border-red-400' : 'border-slate-300'}`}
                  />
                  {errors.publicationYear && <p className="text-red-500 text-xs mt-1">{errors.publicationYear}</p>}
                </div>
              </div>

              <SearchableSelect
                label={LABELS.FIELD.AUTHORS}
                options={authors}
                value={selectedAuthorIds}
                onChange={(val) => setSelectedAuthorIds(val as string[])}
                onAdd={onAddAuthor ? () => setShowAddAuthor(true) : undefined}
                placeholder="Cari dan pilih penulis..."
                required
                multiple
              />

              <div className="grid grid-cols-2 gap-4">
                <SearchableSelect
                  label={LABELS.FIELD.PUBLISHER}
                  options={publishers}
                  value={publisherId}
                  onChange={(val) => setPublisherId(val as string)}
                  onAdd={onAddPublisher ? () => setShowAddPublisher(true) : undefined}
                  placeholder={LABELS.PLACEHOLDER.SELECT_PUBLISHER}
                  required
                />
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {LABELS.FIELD.CATEGORY} <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">{LABELS.PLACEHOLDER.SELECT_CATEGORY}</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                    {onAddCategory && (
                      <button
                        type="button"
                        onClick={() => setShowAddCategory(true)}
                        className="px-3 py-2 border border-slate-300 rounded-lg text-slate-500 hover:bg-slate-50 transition-colors"
                        title="Tambah Kategori Baru"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </Section>

            <Section title={LABELS.BOOK_SECTION.BIBLIOGRAPHY}>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{LABELS.FIELD.LANGUAGE}</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">{LABELS.PLACEHOLDER.LANGUAGE}</option>
                    {LABELS.LANGUAGES.map((lang) => (
                      <option key={lang.value} value={lang.value}>{lang.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{LABELS.FIELD.EDITION}</label>
                  <input
                    type="text"
                    value={edition}
                    onChange={(e) => setEdition(e.target.value)}
                    placeholder={LABELS.PLACEHOLDER.EDITION}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{LABELS.FIELD.PAGE_COUNT}</label>
                  <input
                    type="number"
                    value={pageCount}
                    onChange={(e) => setPageCount(e.target.value)}
                    placeholder={LABELS.PLACEHOLDER.PAGE_COUNT}
                    min={1}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{LABELS.FIELD.DESCRIPTION}</label>
                <textarea
                  value={description}
                  onChange={(e) => {
                    if (e.target.value.length <= 2000) setDescription(e.target.value)
                  }}
                  rows={4}
                  placeholder={LABELS.PLACEHOLDER.DESCRIPTION}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <div className="flex justify-end mt-1">
                  <span className={`text-xs ${description.length > 1800 ? 'text-amber-500' : 'text-slate-400'}`}>
                    {description.length}/2000
                  </span>
                </div>
              </div>
            </Section>

            <Section title={LABELS.BOOK_SECTION.PROCUREMENT} placeholder>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-1">{LABELS.FIELD.ACQUISITION_DATE}</label>
                  <input
                    type="date"
                    disabled
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-400 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-1">{LABELS.FIELD.ACQUISITION_SOURCE}</label>
                  <input
                    type="text"
                    disabled
                    placeholder={LABELS.PLACEHOLDER.ACQUISITION_SOURCE}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-400 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-1">{LABELS.FIELD.PRICE}</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">Rp</span>
                    <input
                      type="text"
                      disabled
                      className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-400 cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <label className="block text-sm font-medium text-slate-500">{LABELS.FIELD.NOTES}</label>
                  <span className="text-xs text-slate-400">({LABELS.OPTIONAL})</span>
                </div>
                <textarea
                  disabled
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-400 cursor-not-allowed resize-none"
                />
              </div>
            </Section>
          </div>

          <div className="w-80 flex-shrink-0 space-y-6">
            <Card title={LABELS.BOOK_SECTION.COVER}>
              <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center hover:border-blue-300 transition-colors cursor-pointer">
                <div className="mx-auto mb-3 w-16 h-16 bg-slate-50 rounded-lg flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                </div>
                <p className="text-sm font-medium text-slate-600">{LABELS.COVER.UPLOAD}</p>
                <p className="text-xs text-slate-400 mt-1">{LABELS.COVER.FORMAT}</p>
                <p className="text-xs text-slate-400">{LABELS.COVER.SIZE}</p>
              </div>
            </Card>

            <Card title={LABELS.BOOK_SECTION.SUMMARY}>
              <div className="space-y-2 text-sm">
                <SummaryRow label={LABELS.FIELD.TITLE} value={title || '-'} />
                <SummaryRow label={LABELS.FIELD.AUTHORS} value={authorNames.length > 0 ? authorNames.join(', ') : '-'} />
                <SummaryRow label={LABELS.FIELD.PUBLISHER} value={publisherName || '-'} />
                <SummaryRow label={LABELS.FIELD.CATEGORY} value={categoryName || '-'} />
                <SummaryRow label={LABELS.FIELD.YEAR} value={publicationYear || '-'} />
              </div>
            </Card>

            <Card title={LABELS.BOOK_SECTION.COPIES}>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{LABELS.FIELD.INITIAL_COPIES}</label>
                <input
                  type="number"
                  defaultValue={0}
                  min={0}
                  disabled
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-400 cursor-not-allowed"
                />
              </div>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                {LABELS.COPIES_INFO}
              </p>
            </Card>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-8 pt-6 border-t border-slate-200">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
          >
            {LABELS.BOOK.CANCEL}
          </button>
          <button
            type="button"
            onClick={() => alert('Fitur Simpan Draft belum tersedia.')}
            className="px-5 py-2 border border-blue-200 text-blue-700 text-sm font-medium rounded-lg hover:bg-blue-50 transition-colors"
          >
            {LABELS.BOOK.SAVE_DRAFT}
          </button>
          <button
            type="submit"
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            {LABELS.BOOK.SAVE}
          </button>
        </div>
      </form>

      {showAddAuthor && onAddAuthor && (
        <InlineAddModal
          title={`Tambah ${LABELS.MASTER.AUTHOR} Baru`}
          fieldLabel={`Nama ${LABELS.MASTER.AUTHOR}`}
          onSubmit={onAddAuthor}
          onClose={() => setShowAddAuthor(false)}
        />
      )}
      {showAddPublisher && onAddPublisher && (
        <InlineAddModal
          title={`Tambah ${LABELS.MASTER.PUBLISHER} Baru`}
          fieldLabel={`Nama ${LABELS.MASTER.PUBLISHER}`}
          onSubmit={onAddPublisher}
          onClose={() => setShowAddPublisher(false)}
        />
      )}
      {showAddCategory && onAddCategory && (
        <InlineAddModal
          title={`Tambah ${LABELS.MASTER.CATEGORY} Baru`}
          fieldLabel={`Nama ${LABELS.MASTER.CATEGORY}`}
          onSubmit={onAddCategory}
          onClose={() => setShowAddCategory(false)}
        />
      )}
    </>
  )
}

function Section({ title, children, placeholder }: { title: string; children: React.ReactNode; placeholder?: boolean }) {
  return (
    <div className={`bg-white rounded-lg shadow-sm border p-6 ${placeholder ? 'border-dashed border-slate-300' : 'border-slate-200'}`}>
      <div className="flex items-center gap-2 mb-5">
        <h2 className="text-base font-semibold text-slate-800">{title}</h2>
        {placeholder && (
          <span className="text-[10px] uppercase tracking-wider text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full font-medium">
            {LABELS.OPTIONAL}
          </span>
        )}
      </div>
      <div className="space-y-4">
        {children}
      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
      <h2 className="text-sm font-semibold text-slate-800 mb-4">{title}</h2>
      {children}
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-slate-500 w-20 flex-shrink-0 text-xs">{label}</span>
      <span className={`text-slate-800 text-xs leading-relaxed ${value === '-' ? 'text-slate-300' : ''}`}>{value}</span>
    </div>
  )
}
