import { useState, useEffect } from 'react'
import { Database, Monitor } from 'lucide-react'

type AppInfo = {
  version: string
  name: string
  platform: string
  electronVersion: string
  nodeVersion: string
}

export default function StatusBar() {
  const [dbOk, setDbOk] = useState<boolean | null>(null)
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    window.electronAPI.db.ping().then((res) => setDbOk(res.ok))
    window.electronAPI.app.info().then(setInfo)
  }, [])

  return (
    <footer className="flex items-center justify-between h-7 px-4 bg-slate-900 text-slate-400 text-xs">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <Database size={14} />
          SQLite
          <span
            className={`inline-block w-2 h-2 rounded-full ml-1 ${
              dbOk === null ? 'bg-yellow-500' : dbOk ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
        </span>
        {info && (
          <>
            <span className="flex items-center gap-1.5">
              <Monitor size={14} />
              v{info.version}
            </span>
            <span>Electron {info.electronVersion}</span>
            <span>Node {info.nodeVersion}</span>
          </>
        )}
      </div>
    </footer>
  )
}
