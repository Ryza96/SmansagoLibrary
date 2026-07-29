import { Eye, Pencil, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { BookListItemDTO } from '../../types/dtos/book'
import { bookEditPath, bookDetailPath } from '../../config/navigation'
import { LABELS } from '../../constants/labels'

interface BookTableProps {
  books: BookListItemDTO[]
  onDelete: (id: string) => void
}

export default function BookTable({ books, onDelete }: BookTableProps) {
  const navigate = useNavigate()

  if (books.length === 0) {
    return <p className="text-slate-400 text-sm py-8 text-center">{LABELS.PLACEHOLDER.NO_DATA}</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500 text-left">
            <th className="pb-3 font-medium">{LABELS.FIELD.TITLE}</th>
            <th className="pb-3 font-medium">{LABELS.FIELD.ISBN}</th>
            <th className="pb-3 font-medium">{LABELS.FIELD.CATEGORY}</th>
            <th className="pb-3 font-medium">{LABELS.FIELD.PUBLISHER}</th>
            <th className="pb-3 font-medium">{LABELS.FIELD.YEAR}</th>
            <th className="pb-3 font-medium">{LABELS.FIELD.COPY_COUNT}</th>
            <th className="pb-3 font-medium">{LABELS.FIELD.ACTIONS}</th>
          </tr>
        </thead>
        <tbody>
          {books.map((book) => (
            <tr key={book.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
              <td className="py-3 pr-4 font-medium text-slate-800">{book.title}</td>
              <td className="py-3 pr-4 text-slate-500">{book.isbn ?? '-'}</td>
              <td className="py-3 pr-4 text-slate-500">{book.categoryName ?? '-'}</td>
              <td className="py-3 pr-4 text-slate-500">{book.publisherName ?? '-'}</td>
              <td className="py-3 pr-4 text-slate-500">{book.publicationYear ?? '-'}</td>
              <td className="py-3 pr-4 text-slate-500">{book.copyCount}</td>
              <td className="py-3">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => navigate(bookDetailPath(book.id))}
                    className="p-1.5 rounded hover:bg-slate-200 transition-colors text-slate-500 hover:text-blue-600"
                    title={LABELS.ACTION.VIEW}
                  >
                    <Eye size={16} />
                  </button>
                  <button
                    onClick={() => navigate(bookEditPath(book.id))}
                    className="p-1.5 rounded hover:bg-slate-200 transition-colors text-slate-500 hover:text-amber-600"
                    title={LABELS.ACTION.EDIT}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => onDelete(book.id)}
                    className="p-1.5 rounded hover:bg-slate-200 transition-colors text-slate-500 hover:text-red-600"
                    title={LABELS.ACTION.DELETE}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
