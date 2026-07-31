import { Search, Plus, Pencil, Trash2 } from 'lucide-react'
import { LABELS } from '../../utils/labels'

export interface Column<T> {
  key: string
  label: string
  render: (item: T) => React.ReactNode
}

interface MasterTableProps<T> {
  columns: Column<T>[]
  data: T[]
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder: string
  onAdd: () => void
  onEdit: (item: T) => void
  onDelete: (item: T) => void
  loading: boolean
  addLabel: string
}

export default function MasterTable<T extends { id: string }>({
  columns,
  data,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  onAdd,
  onEdit,
  onDelete,
  loading,
  addLabel
}: MasterTableProps<T>) {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 ml-auto px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          {addLabel}
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200">
        <div className="p-4">
          {loading ? (
            <p className="text-slate-400 text-sm text-center py-8">{LABELS.PLACEHOLDER.LOADING}</p>
          ) : data.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">{LABELS.PLACEHOLDER.NO_DATA}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-left">
                    {columns.map((col) => (
                      <th key={col.key} className="pb-3 font-medium pr-4">{col.label}</th>
                    ))}
                    <th className="pb-3 font-medium">{LABELS.FIELD.ACTIONS}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((item) => (
                    <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      {columns.map((col) => (
                        <td key={col.key} className="py-3 pr-4 text-slate-700">{col.render(item)}</td>
                      ))}
                      <td className="py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => onEdit(item)}
                            className="p-1.5 rounded hover:bg-slate-200 transition-colors text-slate-500 hover:text-amber-600"
                            title={LABELS.ACTION.EDIT}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => onDelete(item)}
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
          )}
        </div>
      </div>
    </div>
  )
}
