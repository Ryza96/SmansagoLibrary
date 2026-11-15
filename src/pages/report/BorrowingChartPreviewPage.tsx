// SESI 3 — Pratinjau cetak Grafik Peminjaman.
// Toolbar/zoom/tombol mengikuti pola ReportPrintPreviewPage, tetapi SELURUH
// pemanggilan memakai API chart (reports:chartPreview / chartPrint / chartPdf).
// Halaman ini tidak membaca state navigasi laporan tabel: periode adalah state
// lokal dengan nilai awal 6 bulan terakhir (tanggal lokal).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, FileDown, Maximize2, Printer, ZoomIn, ZoomOut } from 'lucide-react'
import { useNotification } from '../../notification/NotificationContext'
import { LABELS } from '../../utils/labels'
import { ROUTES } from '../../utils/navigation'
import { splitReportPrintHtml } from '../../utils/report-print'
import { BORROWING_CHART_TYPE, defaultBorrowingChartPeriod } from '../../shared/dto/borrowing-chart'
import type { BorrowingChartFilter } from '../../shared/dto/borrowing-chart'

const MIN_ZOOM = 0.5
const MAX_ZOOM = 2.0
const ZOOM_STEP = 0.1
const FIT_PADDING = 48

// Grafik selalu A4 landscape (1123×794 px @96dpi).
const SHEET_W = 1123
const SHEET_H = 794

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

export default function BorrowingChartPreviewPage() {
  const navigate = useNavigate()
  const { notify } = useNotification()

  const [initialPeriod] = useState<BorrowingChartFilter>(() => defaultBorrowingChartPeriod())
  const [from, setFrom] = useState(initialPeriod.from)
  const [to, setTo] = useState(initialPeriod.to)
  // Filter yang benar-benar dikirim ke main (hanya berubah lewat "Terapkan").
  const [applied, setApplied] = useState<BorrowingChartFilter>(initialPeriod)

  const [html, setHtml] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [zoom, setZoom] = useState(1)
  const [busyPrint, setBusyPrint] = useState(false)
  const [busyPdf, setBusyPdf] = useState(false)
  const [pdfStatus, setPdfStatus] = useState('')

  const scrollRef = useRef<HTMLDivElement>(null)
  const fitModeRef = useRef(false)

  const docParts = useMemo(() => (html ? splitReportPrintHtml(html) : null), [html])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    window.electronAPI.reportPrint
      .chartPreview({ type: BORROWING_CHART_TYPE, filter: applied })
      .then((preview) => {
        if (cancelled) return
        setHtml(preview.html)
        setTitle(preview.title)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const message = err instanceof Error ? err.message : LABELS.REPORT.CHART_PREVIEW_ERROR
        setError(message)
        notify.error(message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied])

  const handleFitWidth = useCallback(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    const scale = Math.min(1, (scroller.clientWidth - FIT_PADDING) / SHEET_W)
    setZoom(clampZoom(scale))
    fitModeRef.current = true
  }, [])

  useEffect(() => {
    function onResize() {
      if (!fitModeRef.current) return
      const scroller = scrollRef.current
      if (!scroller) return
      const scale = Math.min(1, (scroller.clientWidth - FIT_PADDING) / SHEET_W)
      setZoom(clampZoom(scale))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Validasi periode di renderer hanya untuk umpan balik cepat; periode yang
  // tidak valid tidak pernah dikirim ke main.
  function handleApply() {
    if (from && to && from > to) {
      notify.error(LABELS.REPORT.CHART_PERIOD_INVALID)
      return
    }
    setApplied({ from, to })
  }

  async function handlePrint() {
    setBusyPrint(true)
    try {
      await window.electronAPI.reportPrint.chartPrint({ type: BORROWING_CHART_TYPE, filter: applied })
      notify.success(LABELS.REPORT.CHART_SENT)
    } catch (err: unknown) {
      notify.error(err instanceof Error ? err.message : LABELS.REPORT.CHART_PREVIEW_ERROR)
    } finally {
      setBusyPrint(false)
    }
  }

  async function handleSavePdf() {
    setBusyPdf(true)
    setPdfStatus('')
    try {
      const result = await window.electronAPI.reportPrint.chartPdf({ type: BORROWING_CHART_TYPE, filter: applied })
      if (result.saved && result.filePath) {
        const message = LABELS.REPORT.CHART_SAVED + result.filePath
        setPdfStatus(message)
        notify.success(message)
      }
      // saved:false (user membatalkan) → tanpa error, tanpa toast.
    } catch (err: unknown) {
      notify.error(err instanceof Error ? err.message : LABELS.REPORT.CHART_PREVIEW_ERROR)
    } finally {
      setBusyPdf(false)
    }
  }

  const percent = Math.round(zoom * 100)
  const busy = busyPrint || busyPdf

  const toolbarButton =
    'flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  const primaryButton =
    'flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  const dateInput = 'px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-700'

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => navigate(ROUTES.REPORTS)}
          className="p-1.5 rounded hover:bg-slate-200 transition-colors text-slate-500"
          title={LABELS.REPORT.PRINT_BACK}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{title || LABELS.REPORT.CHART_PREVIEW_TITLE}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{LABELS.REPORT.CHART_META}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2 mb-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-600">{LABELS.REPORT.CHART_PERIOD_FROM}</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={dateInput} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-600">{LABELS.REPORT.CHART_PERIOD_TO}</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={dateInput} />
        </label>
        <button onClick={handleApply} disabled={loading} className={`${primaryButton} bg-slate-700 hover:bg-slate-800`}>
          {LABELS.REPORT.CHART_APPLY}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))} disabled={zoom <= MIN_ZOOM} className={toolbarButton}>
          <ZoomOut size={16} />
          {LABELS.RECEIPT_PREVIEW.ZOOM_OUT}
        </button>
        <button onClick={() => setZoom(1)} className={`${toolbarButton} min-w-[3.5rem] justify-center font-semibold`}>
          {percent}%
        </button>
        <button onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))} disabled={zoom >= MAX_ZOOM} className={toolbarButton}>
          <ZoomIn size={16} />
          {LABELS.RECEIPT_PREVIEW.ZOOM_IN}
        </button>
        <button onClick={handleFitWidth} className={toolbarButton}>
          <Maximize2 size={16} />
          {LABELS.RECEIPT_PREVIEW.FIT_WIDTH}
        </button>

        <div className="w-px h-6 bg-slate-300 mx-1" />

        <button onClick={handlePrint} disabled={busy || !html} className={`${primaryButton} bg-blue-600 hover:bg-blue-700`}>
          <Printer size={16} />
          {LABELS.RECEIPT_PREVIEW.PRINT}
        </button>
        <button onClick={handleSavePdf} disabled={busy || !html} className={`${primaryButton} bg-emerald-600 hover:bg-emerald-700`}>
          <FileDown size={16} />
          {LABELS.RECEIPT_PREVIEW.SAVE_PDF}
        </button>

        <button onClick={() => navigate(ROUTES.REPORTS)} className={`${toolbarButton} border-red-200 text-red-600 hover:bg-red-50`}>
          <ArrowLeft size={16} />
          {LABELS.REPORT.PRINT_BACK}
        </button>
      </div>

      {pdfStatus && <p className="mb-3 text-sm text-green-700">{pdfStatus}</p>}

      {loading ? (
        <p className="text-slate-400 text-sm">{LABELS.REPORT.CHART_PREVIEW_LOADING}</p>
      ) : error ? (
        <p className="text-red-500 text-sm">{error}</p>
      ) : docParts ? (
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto bg-slate-200 rounded-lg p-4">
          {/* CSS dokumen disuntik sekali agar berlaku untuk sheet yang dirender. */}
          <style dangerouslySetInnerHTML={{ __html: docParts.styleText }} />
          {docParts.sheets.map((sheet, i) => (
            <div key={i} style={{ width: SHEET_W * zoom, height: SHEET_H * zoom, margin: '0 auto 16px' }}>
              <div style={{ width: SHEET_W, transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
                <div dangerouslySetInnerHTML={{ __html: sheet }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-slate-400 text-sm">{LABELS.REPORT.CHART_PREVIEW_ERROR}</p>
      )}
    </div>
  )
}
