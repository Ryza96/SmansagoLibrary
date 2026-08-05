import { useNavigate } from 'react-router-dom'
import { FileText, Undo2, TriangleAlert, ChevronRight } from 'lucide-react'
import { LABELS } from '../utils/labels'

export default function ReportsPage() {
  const navigate = useNavigate()

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-1">{LABELS.REPORT.TITLE}</h1>
      <p className="text-slate-500 text-sm mb-6">{LABELS.REPORT.SUBTITLE}</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-4xl">
        <button
          onClick={() => navigate('/reports/borrowings')}
          className="flex items-center gap-5 p-5 rounded-xl border border-slate-200 bg-white hover:shadow-lg hover:-translate-y-0.5 hover:border-slate-300 transition-all duration-200 text-left w-full"
        >
          <div className="p-3 rounded-xl shrink-0 text-blue-600 bg-blue-50">
            <FileText size={24} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800">{LABELS.REPORT.BORROWINGS}</p>
            <p className="text-xs text-slate-500 mt-0.5">{LABELS.REPORT.BORROWINGS_DESC}</p>
          </div>
          <ChevronRight size={18} className="text-slate-300 shrink-0" />
        </button>

        <button
          onClick={() => navigate('/reports/returns')}
          className="flex items-center gap-5 p-5 rounded-xl border border-slate-200 bg-white hover:shadow-lg hover:-translate-y-0.5 hover:border-slate-300 transition-all duration-200 text-left w-full"
        >
          <div className="p-3 rounded-xl shrink-0 text-emerald-600 bg-emerald-50">
            <Undo2 size={24} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800">{LABELS.REPORT.RETURNS}</p>
            <p className="text-xs text-slate-500 mt-0.5">{LABELS.REPORT.RETURNS_DESC}</p>
          </div>
          <ChevronRight size={18} className="text-slate-300 shrink-0" />
        </button>

        <button
          onClick={() => navigate('/reports/overdues')}
          className="flex items-center gap-5 p-5 rounded-xl border border-slate-200 bg-white hover:shadow-lg hover:-translate-y-0.5 hover:border-slate-300 transition-all duration-200 text-left w-full"
        >
          <div className="p-3 rounded-xl shrink-0 text-rose-600 bg-rose-50">
            <TriangleAlert size={24} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800">{LABELS.REPORT.OVERDUES}</p>
            <p className="text-xs text-slate-500 mt-0.5">{LABELS.REPORT.OVERDUES_DESC}</p>
          </div>
          <ChevronRight size={18} className="text-slate-300 shrink-0" />
        </button>
      </div>
    </div>
  )
}
