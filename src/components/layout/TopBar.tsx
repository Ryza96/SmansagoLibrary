import { User, Settings, Minus, Square, X } from 'lucide-react'

function minimize() {
  window.electronAPI.window.minimize()
}

function maximize() {
  window.electronAPI.window.maximize()
}

function close() {
  window.electronAPI.window.close()
}

export default function TopBar() {
  return (
    <header className="flex items-center justify-between h-12 px-4 bg-slate-900 text-white select-none draggable">
      <div className="flex items-center gap-2">
        <span className="font-bold text-lg tracking-wide">APLibrary</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-sm text-slate-300">
          <User size={16} />
          <span>Admin</span>
        </div>

        <button className="p-1.5 rounded hover:bg-slate-700 transition-colors" title="Settings">
          <Settings size={16} />
        </button>

        <div className="flex items-center ml-2">
          <button
            onClick={minimize}
            className="p-2 hover:bg-slate-700 transition-colors"
            title="Minimize"
          >
            <Minus size={16} />
          </button>
          <button
            onClick={maximize}
            className="p-2 hover:bg-slate-700 transition-colors"
            title="Maximize"
          >
            <Square size={14} />
          </button>
          <button
            onClick={close}
            className="p-2 hover:bg-red-600 transition-colors"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </header>
  )
}
