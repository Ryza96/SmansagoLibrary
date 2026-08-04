import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, Play } from 'lucide-react'
import { LABELS } from '../../utils/labels'
import { promotionDetailPath } from '../../utils/navigation'
import type { AcademicYearDTO, ClassDTO } from '../../shared/dto/academic'
import type { PromotionOutcome, PromotionPreviewDTO } from '../../shared/dto/promotion'

const api = window.electronAPI

// WO P-4 (PROMOTION OPERATOR UI) — halaman operator menjalankan promosi.
// Renderer HANYA menampilkan hasil; SELURUH keputusan akademik tetap berasal
// dari decide() melalui PromotionPreviewService (preview) & PromotionExecuteService
// (execute). Tidak ada business rule / komputasi keputusan di layer ini.
const OUTCOME_LABEL: Record<string, string> = {
  PROMOTED: LABELS.PROMOTION.OUTCOME_PROMOTED,
  REPEATED: LABELS.PROMOTION.OUTCOME_REPEATED,
  REDISTRIBUTED: LABELS.PROMOTION.OUTCOME_REDISTRIBUTED,
  GRADUATED: LABELS.PROMOTION.OUTCOME_GRADUATED,
  NO_TARGET: LABELS.PROMOTION.OUTCOME_NO_TARGET,
  ERROR: LABELS.PROMOTION.OUTCOME_ERROR,
}

const COUNT_CARDS = [
  { key: 'promoted', label: LABELS.PROMOTION.HEADER_PROMOTED, tone: 'bg-blue-50 text-blue-700' },
  { key: 'graduated', label: LABELS.PROMOTION.HEADER_GRADUATED, tone: 'bg-emerald-50 text-emerald-700' },
  { key: 'repeated', label: LABELS.PROMOTION.HEADER_REPEATED, tone: 'bg-amber-50 text-amber-700' },
  { key: 'redistributed', label: LABELS.PROMOTION.HEADER_REDISTRIBUTED, tone: 'bg-violet-50 text-violet-700' },
  { key: 'noTarget', label: LABELS.PROMOTION.HEADER_NO_TARGET, tone: 'bg-slate-100 text-slate-600' },
  { key: 'error', label: LABELS.PROMOTION.HEADER_ERROR, tone: 'bg-red-50 text-red-700' },
] as const

function outcomeLabel(outcome: PromotionOutcome): string {
  return OUTCOME_LABEL[outcome] ?? outcome
}

export default function PromotionPage() {
  const navigate = useNavigate()
  const [academicYears, setAcademicYears] = useState<AcademicYearDTO[]>([])
  const [classes, setClasses] = useState<ClassDTO[]>([])
  const [fromYearId, setFromYearId] = useState('')
  const [toYearId, setToYearId] = useState('')
  const [fromClassId, setFromClassId] = useState('')
  const [preview, setPreview] = useState<PromotionPreviewDTO | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(false)
      try {
        const [years, classResult] = await Promise.all([
          api.academicYears.findMany(),
          fetchAllClasses(),
        ])
        if (cancelled) return
        setAcademicYears(years.data)
        setClasses(classResult)
        if (years.data.length > 0) {
          const active = years.data.find((y) => y.isActive) ?? years.data[0]
          setFromYearId(active.id)
          setToYearId(years.data.find((y) => y.id !== active.id)?.id ?? '')
        }
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  async function fetchAllClasses(): Promise<ClassDTO[]> {
    const all: ClassDTO[] = []
    let page = 1
    for (;;) {
      const result = await api.classes.findMany(undefined, page, 100)
      all.push(...result.data)
      if (all.length >= result.total) break
      page += 1
    }
    return all
  }

  const sourceClasses = classes.filter((c) => c.academicYearId === fromYearId)
  const fromYear = academicYears.find((y) => y.id === fromYearId)

  function handleFromYearChange(id: string) {
    setFromYearId(id)
    setPreview(null)
    setFromClassId('')
    const target = academicYears.find((y) => y.id !== id)
    setToYearId((current) => (current !== id && academicYears.some((y) => y.id === current) ? current : (target?.id ?? '')))
  }

  function handleToYearChange(id: string) {
    setToYearId(id)
    setPreview(null)
  }

  function handleClassChange(id: string) {
    setFromClassId(id)
    setPreview(null)
  }

  async function handlePreview() {
    if (!fromYearId || !toYearId) return
    setPreviewing(true)
    setPreview(null)
    try {
      const result = await api.promotions.preview({
        mode: 'AUTOMATIC',
        fromYearId,
        toYearId,
        ...(fromClassId ? { fromClassId } : {}),
      })
      setPreview(result)
    } catch (err: any) {
      alert(err.message)
    } finally {
      setPreviewing(false)
    }
  }

  async function handleExecute() {
    if (!fromYearId || !toYearId) return
    if (!window.confirm(LABELS.PROMOTION_OPERATOR.CONFIRM_EXECUTE)) return
    setExecuting(true)
    try {
      const run = await api.promotions.execute({
        mode: 'AUTOMATIC',
        fromYearId,
        toYearId,
        ...(fromClassId ? { fromClassId } : {}),
      })
      navigate(promotionDetailPath(run.id))
    } catch (err: any) {
      alert(err.message)
    } finally {
      setExecuting(false)
    }
  }

  if (loading) {
    return <p className="text-slate-400 text-sm">{LABELS.PROMOTION.LOADING}</p>
  }

  if (error) {
    return <p className="text-red-500 text-sm">{LABELS.PROMOTION.ERROR}</p>
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">{LABELS.PROMOTION_OPERATOR.TITLE}</h1>
        <p className="text-sm text-slate-500 mt-0.5">{LABELS.PROMOTION_OPERATOR.SUBTITLE}</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label={LABELS.PROMOTION_OPERATOR.SOURCE_YEAR}>
            <select
              value={fromYearId}
              onChange={(e) => handleFromYearChange(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {academicYears.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={LABELS.PROMOTION_OPERATOR.TARGET_YEAR}>
            <select
              value={toYearId}
              onChange={(e) => handleToYearChange(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {academicYears
                .filter((y) => y.id !== fromYearId)
                .map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label={LABELS.PROMOTION_OPERATOR.SOURCE_CLASS}>
            <select
              value={fromClassId}
              onChange={(e) => handleClassChange(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{LABELS.PROMOTION_OPERATOR.ALL_CLASSES}</option>
              {sourceClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={handlePreview}
            disabled={previewing || !fromYearId || !toYearId}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Eye size={16} />
            {previewing ? LABELS.PROMOTION_OPERATOR.PREVIEWING : LABELS.PROMOTION_OPERATOR.PREVIEW}
          </button>
        </div>
      </div>

      {fromYear && preview ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">
              {LABELS.PROMOTION_OPERATOR.RESULT_TITLE}
              <span className="ml-2 text-sm font-normal text-slate-500">
                {fromYear.name} → {academicYears.find((y) => y.id === toYearId)?.name}
              </span>
            </h2>
            <button
              onClick={handleExecute}
              disabled={executing}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Play size={16} />
              {executing ? LABELS.PROMOTION_OPERATOR.EXECUTING : LABELS.PROMOTION_OPERATOR.EXECUTE}
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>{LABELS.PROMOTION_OPERATOR.RESULT_HINT}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {COUNT_CARDS.map((card) => (
              <div key={card.key} className={`rounded-lg px-3 py-2.5 ${card.tone}`}>
                <p className="text-2xl font-bold tabular-nums">{preview.counts[card.key]}</p>
                <p className="text-xs font-medium mt-0.5">{card.label}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 text-sm font-medium text-slate-700">
              {LABELS.PROMOTION.HEADER_TOTAL}
              <span className="ml-2 text-slate-400 font-normal">({preview.items.length})</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="px-4 py-3 font-medium whitespace-nowrap">{LABELS.PROMOTION_OPERATOR.MEMBER_COLUMN}</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">{LABELS.PROMOTION_OPERATOR.CLASS_COLUMN}</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">{LABELS.PROMOTION_OPERATOR.TARGET_COLUMN}</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">{LABELS.PROMOTION_OPERATOR.OUTCOME_COLUMN}</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">{LABELS.PROMOTION_OPERATOR.MESSAGE_COLUMN}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.items.map((item) => (
                    <tr key={item.memberId} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-slate-800 font-medium whitespace-nowrap">{item.memberName}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{item.sourceLabel}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{item.targetLabel ?? '-'}</td>
                      <td className="px-4 py-3">
                        <OutcomeBadge outcome={item.outcome} />
                      </td>
                      <td className="px-4 py-3 text-slate-500 max-w-[280px] truncate" title={item.message ?? undefined}>
                        {item.message ?? '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center py-16 text-center bg-white rounded-lg shadow-sm border border-slate-200">
          <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center mb-4">
            <Play size={24} className="text-slate-300" />
          </div>
          <p className="text-sm font-medium text-slate-600 mb-1">{LABELS.PROMOTION_OPERATOR.EMPTY_TITLE}</p>
          <p className="text-xs text-slate-400 max-w-xs">{LABELS.PROMOTION_OPERATOR.EMPTY_DESC}</p>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-slate-500 text-xs mb-1.5">{label}</p>
      {children}
    </div>
  )
}

function OutcomeBadge({ outcome }: { outcome: PromotionOutcome }) {
  const tone =
    outcome === 'PROMOTED'
      ? 'bg-blue-100 text-blue-700'
      : outcome === 'GRADUATED'
        ? 'bg-emerald-100 text-emerald-700'
        : outcome === 'REPEATED'
          ? 'bg-amber-100 text-amber-700'
          : outcome === 'REDISTRIBUTED'
            ? 'bg-violet-100 text-violet-700'
            : outcome === 'ERROR'
              ? 'bg-red-100 text-red-700'
              : 'bg-slate-100 text-slate-600'
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${tone}`}>
      {outcomeLabel(outcome)}
    </span>
  )
}
