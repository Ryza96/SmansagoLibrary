import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, Database, DatabaseBackup, LogOut, Printer } from 'lucide-react'
import { LABELS } from '../../utils/labels'
import { FILE_MENU_ITEMS, type FileMenuIcon, type FileMenuItemId } from './file-menu-items'

const FILE_MENU_ICONS: Record<FileMenuIcon, typeof Database> = {
  'database-backup': DatabaseBackup,
  'database-restore': Database,
  printer: Printer,
  exit: LogOut,
}

export default function FileMenuDropdown() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function onMouseDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function handleSelect(id: FileMenuItemId) {
    setOpen(false)
    const item = FILE_MENU_ITEMS.find((entry) => entry.id === id)
    if (!item) return
    if (item.exit) {
      window.electronAPI.window.close()
    } else if (item.route) {
      navigate(item.route)
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-sm text-slate-200 hover:bg-slate-700 hover:text-white transition-colors"
      >
        {LABELS.FILE_MENU.LABEL}
        <ChevronDown size={14} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 min-w-[200px] bg-white rounded-lg shadow-xl border border-slate-200 py-1 z-[70]">
          {FILE_MENU_ITEMS.map((item) => {
            const Icon = FILE_MENU_ICONS[item.icon]
            const isExit = item.exit === true
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                  isExit ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon size={16} className={isExit ? 'text-red-500' : 'text-slate-400'} />
                {item.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
