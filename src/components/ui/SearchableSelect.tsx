import { useState, useRef, useEffect } from 'react'
import { X, Plus, ChevronDown } from 'lucide-react'

interface SearchableSelectProps {
  options: { id: string; name: string }[]
  value: string | string[]
  onChange: (value: string | string[]) => void
  onAdd?: () => void
  placeholder?: string
  label?: string
  required?: boolean
  error?: string
  multiple?: boolean
  onSearch?: (query: string) => void
  selectedOption?: { id: string; name: string }
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  onAdd,
  placeholder,
  label,
  required,
  error,
  multiple = false,
  onSearch,
  selectedOption
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filtered = onSearch ? options : options.filter((o) =>
    o.name.toLowerCase().includes(search.toLowerCase())
  )

  function handleSearchChange(value: string) {
    setSearch(value)
    if (onSearch) {
      onSearch(value)
    }
  }

  const selectedIds = multiple ? (value as string[]) : (value ? [value as string] : [])
  const selectedLabels = selectedIds
    .map((id) => options.find((o) => o.id === id)?.name)
    .filter(Boolean) as string[]

  function toggleOption(id: string) {
    if (multiple) {
      const next = (value as string[]).includes(id)
        ? (value as string[]).filter((v) => v !== id)
        : [...(value as string[]), id]
      onChange(next)
    } else {
      onChange(id)
      setIsOpen(false)
      setSearch('')
    }
  }

  function removeOption(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (multiple) {
      onChange((value as string[]).filter((v) => v !== id))
    }
  }

  const displayValue = multiple
    ? selectedLabels.join(', ')
    : options.find((o) => o.id === value)?.name
      ?? (selectedOption?.id === value ? selectedOption.name : '')

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="block text-sm font-medium text-slate-700 mb-1">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      <div
        className={`flex items-center gap-1 flex-wrap min-h-[2.5rem] w-full px-3 py-1.5 border rounded-lg text-sm cursor-pointer focus-within:ring-2 focus-within:ring-blue-500 ${error ? 'border-red-400' : 'border-slate-300'}`}
        onClick={() => setIsOpen(true)}
      >
        {multiple || onSearch ? (
          <>
            {!multiple && value && (
              <span className="text-sm text-slate-900 truncate max-w-[60%]">
                {displayValue}
              </span>
            )}
            {!multiple && value ? null : (
              selectedLabels.map((lbl, i) => (
                <span key={selectedIds[i]} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md text-xs">
                  {lbl}
                  <button type="button" onClick={(e) => removeOption(selectedIds[i], e)} className="hover:text-blue-900">
                    <X size={12} />
                  </button>
                </span>
              ))
            )}
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => setIsOpen(true)}
              placeholder={(!multiple && value && onSearch) ? 'Ketik untuk mencari...' : (selectedLabels.length === 0 ? placeholder : '')}
              className="flex-1 min-w-[80px] outline-none text-sm bg-transparent py-0.5 cursor-pointer"
            />
          </>
        ) : (
          <>
            <span className={`flex-1 text-sm ${displayValue ? 'text-slate-900' : 'text-slate-400'}`}>
              {displayValue || placeholder}
            </span>
            <ChevronDown size={16} className="text-slate-400" />
          </>
        )}
      </div>
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {(multiple || onSearch) && (
            <div className="px-3 py-2 border-b border-slate-100">
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Cari..."
                className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm outline-none focus:ring-1 focus:ring-blue-500"
                autoFocus
              />
            </div>
          )}
          {filtered.length === 0 && !onAdd && (
            <p className="text-slate-400 text-sm text-center py-4">Tidak ada data.</p>
          )}
          {filtered.map((o) => (
            <label
              key={o.id}
              className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm"
            >
              <input
                type={multiple ? 'checkbox' : 'radio'}
                name="ss-radio"
                checked={multiple ? (value as string[]).includes(o.id) : value === o.id}
                onChange={() => toggleOption(o.id)}
                className={multiple ? 'rounded' : ''}
              />
              {o.name}
            </label>
          ))}
          {onAdd && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setSearch(''); setIsOpen(false); onAdd() }}
              className="flex items-center gap-2 w-full px-3 py-2 text-blue-600 hover:bg-blue-50 text-sm font-medium border-t border-slate-100"
            >
              <Plus size={16} />
              Tambah Baru
            </button>
          )}
        </div>
      )}
    </div>
  )
}
