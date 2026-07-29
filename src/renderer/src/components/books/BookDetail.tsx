import { BookDetailDTO } from '../../types/dtos/book'
import { LABELS } from '../../constants/labels'

interface BookDetailProps {
  book: BookDetailDTO
}

export default function BookDetail({ book }: BookDetailProps) {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-sm font-medium text-slate-500 mb-1">{LABELS.FIELD.TITLE}</h2>
        <p className="text-slate-800">{book.title}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <h2 className="text-sm font-medium text-slate-500 mb-1">{LABELS.FIELD.ISBN}</h2>
          <p className="text-slate-800">{book.isbn ?? '-'}</p>
        </div>
        <div>
          <h2 className="text-sm font-medium text-slate-500 mb-1">{LABELS.FIELD.YEAR}</h2>
          <p className="text-slate-800">{book.publicationYear ?? '-'}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <h2 className="text-sm font-medium text-slate-500 mb-1">{LABELS.FIELD.CATEGORY}</h2>
          <p className="text-slate-800">{book.category?.name ?? '-'}</p>
        </div>
        <div>
          <h2 className="text-sm font-medium text-slate-500 mb-1">{LABELS.FIELD.PUBLISHER}</h2>
          <p className="text-slate-800">{book.publisher?.name ?? '-'}</p>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium text-slate-500 mb-1">{LABELS.FIELD.AUTHORS}</h2>
        {book.authors.length === 0 ? (
          <p className="text-slate-400">-</p>
        ) : (
          <p className="text-slate-800">{book.authors.map((a) => a.name).join(', ')}</p>
        )}
      </div>

      {book.edition && (
        <div>
          <h2 className="text-sm font-medium text-slate-500 mb-1">{LABELS.FIELD.EDITION}</h2>
          <p className="text-slate-800">{book.edition}</p>
        </div>
      )}

      {book.language && (
        <div>
          <h2 className="text-sm font-medium text-slate-500 mb-1">{LABELS.FIELD.LANGUAGE}</h2>
          <p className="text-slate-800">{book.language}</p>
        </div>
      )}

      {book.pageCount && (
        <div>
          <h2 className="text-sm font-medium text-slate-500 mb-1">{LABELS.FIELD.PAGE_COUNT}</h2>
          <p className="text-slate-800">{book.pageCount}</p>
        </div>
      )}

      {book.description && (
        <div>
          <h2 className="text-sm font-medium text-slate-500 mb-1">{LABELS.FIELD.DESCRIPTION}</h2>
          <p className="text-slate-700 whitespace-pre-wrap">{book.description}</p>
        </div>
      )}

      {book.copies.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-slate-500 mb-2">
            {LABELS.FIELD.COPY_COUNT} ({book.copies.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {book.copies.map((copy) => (
              <span
                key={copy.id}
                className={`text-xs px-2 py-1 rounded-full ${
                  copy.status === 'AVAILABLE'
                    ? 'bg-green-100 text-green-700'
                    : copy.status === 'BORROWED'
                    ? 'bg-blue-100 text-blue-700'
                    : copy.status === 'DAMAGED' || copy.status === 'LOST'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {copy.inventoryNumber} ({copy.status})
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
