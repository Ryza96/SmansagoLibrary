import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  BookOpen,
  Users,
  BookmarkCheck,
  Undo2,
  ClipboardList,
  BarChart3,
  Settings,
  Database,
  ChevronDown,
  ChevronRight
} from 'lucide-react'

const menuItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/books', label: 'Buku', icon: BookOpen },
  { to: '/borrowings', label: 'Peminjaman', icon: BookmarkCheck },
  { to: '/returns', label: 'Pengembalian', icon: Undo2 },
  { to: '/inventory', label: 'Inventaris', icon: ClipboardList },
  { to: '/reports', label: 'Laporan', icon: BarChart3 },
  { to: '/settings', label: 'Pengaturan', icon: Settings }
]

const memberSubItems = [
  { to: '/members/students', label: 'Siswa' },
  { to: '/members/teachers', label: 'Guru' },
  { to: '/members/general', label: 'Umum' }
]

const masterSubItems = [
  { to: '/master/academic-years', label: 'Tahun Ajaran' },
  { to: '/master/authors', label: 'Penulis' },
  { to: '/master/publishers', label: 'Penerbit' },
  { to: '/master/categories', label: 'Kategori' }
]

export default function Sidebar() {
  const location = useLocation()
  const [memberOpen, setMemberOpen] = useState(true)
  const [masterOpen, setMasterOpen] = useState(true)

  const isMemberActive = location.pathname.startsWith('/members')

  return (
    <nav className="w-56 bg-slate-800 text-slate-300 flex flex-col py-2 overflow-y-auto">
      {menuItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
              isActive
                ? 'bg-slate-700 text-white border-l-2 border-blue-500'
                : 'hover:bg-slate-700/50 hover:text-white'
            }`
          }
        >
          <item.icon size={18} />
          <span>{item.label}</span>
        </NavLink>
      ))}

      <div>
        <button
          onClick={() => setMemberOpen(!memberOpen)}
          className={`flex items-center gap-3 w-full px-4 py-2.5 text-sm transition-colors ${
            isMemberActive
              ? 'bg-slate-700 text-white border-l-2 border-blue-500'
              : 'hover:bg-slate-700/50 hover:text-white'
          }`}
        >
          <Users size={18} />
          <span className="flex-1 text-left">Anggota</span>
          {memberOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>

        {memberOpen && (
          <div className="ml-2">
            {memberSubItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                    isActive
                      ? 'bg-slate-700 text-white border-l-2 border-blue-500'
                      : 'hover:bg-slate-700/50 hover:text-white'
                  }`
                }
              >
                <span className="w-[18px]" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-slate-700 mt-2 pt-2">
        <button
          onClick={() => setMasterOpen(!masterOpen)}
          className="flex items-center gap-3 w-full px-4 py-2.5 text-sm hover:bg-slate-700/50 hover:text-white transition-colors"
        >
          <Database size={18} />
          <span className="flex-1 text-left">Master Data</span>
          {masterOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>

        {masterOpen && (
          <div className="ml-2">
            {masterSubItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                    isActive
                      ? 'bg-slate-700 text-white border-l-2 border-blue-500'
                      : 'hover:bg-slate-700/50 hover:text-white'
                  }`
                }
              >
                <span className="w-[18px]" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        )}
      </div>
    </nav>
  )
}
