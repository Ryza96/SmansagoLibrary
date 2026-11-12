import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileDown, Maximize2, Printer, ZoomIn, ZoomOut } from 'lucide-react'
import { useNotification } from '../../notification/NotificationContext'
import { LABELS } from '../../utils/labels'
import { ROUTES } from '../../utils/navigation'
import { readReportPrintState, splitReportPrintHtml } from '../../utils/report-print'
import type { ReportPrintRequest } from '../../shared/dto/report-print'

const MIN_ZOOM = 0.5
const MAX_ZOOM = 2.0
const ZOOM_STEP = 0.1
const FIT_PADDING = 48
// Render bertahap: hanya N halaman pertama diekspor ke DOM, sisanya dimuat
// saat sentinel terlihat (dokumen hingga ~170 halaman pada 5.000 baris).
const INITIAL_PAGES = 10
const PAGE_BATCH = 10

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

export default function ReportPrintPreviewPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { notify } = useNotification()

  // Request dibaca SEKALI dari state navigasi saat mount (refresh → state
  // hilang → pesan ramah + kembali ke menu Laporan, bukan crash).
  const [request] = useState<ReportPrintRequest | null>(() => readReportPrintState(location.state)?.request ?? null)
  const [fromPath] = useState<string>(() => readReportPrintState(location.state)?.fromPath ?? ROUTES.REPORTS)

  const [html, setHtml] = useState('')
  const [pageCount, setPageCount] = useState(0)
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait')
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [zoom, setZoom] = useState(1)
  const [busyPrint, setBusyPrint] = useState(false)
  const [busyPdf, setBusyPdf] = useState(false)
  const [pdfStatus, setPdfStatus] = useState('')
  const [visibleCount, setVisibleCount] = useState(INITIAL_PAGES)
  const [totalRows, setTotalRows] = useState(0)

  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const fitModeRef = useRef(false)

  // Pecah HTML menjadi <style> + per-halaman HANYA saat html berubah
  // (regex di helper murni — tanpa DOM — sehingga pemecahan 170 halaman
  // tetap murah; yang mahal adalah DOM, dan itu yang di-lazy).
  const docParts = useMemo(() => (html ? splitReportPrintHtml(html) : null), [html])
  const visibleSheets = docParts ? docParts.sheets.slice(0, visibleCount) : []
  const hasMore = docParts != null && visibleCount < docParts.sheets.length

  useEffect(() => {
    if (!request) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    window.electronAPI.reportPrint
      .preview(request)
      .then((preview) => {
        if (cancelled) return
        setHtml(preview.html)
        setPageCount(preview.pageCount)
        setOrientation(preview.orientation)
        setTitle(preview.title)
        setTotalRows(preview.totalRows ?? 0)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const message = err instanceof Error ? err.message : LABELS.REPORT.PRINT_PREVIEW_ERROR
        setError(message)
        // Pesan dari main (mis. batas 5.000 baris) ditampilkan apa adanya.
        notify.error(message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request])

  // Muat halaman berikutnya saat sentinel terlihat di scroll container.
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((count) => count + PAGE_BATCH)
        }
      },
      { root: scrollRef.current }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, docParts])

  const sheetW = orientation === 'landscape' ? 1123 : 794
  const sheetH = orientation === 'landscape' ? 794 : 1123

  const handleFitWidth = useCallback(() => {
    const scroller = scrollRef.current
    if (!scroller || sheetW <= 0) return
    const scale = Math.min(1, (scroller.clientWidth - FIT_PADDING) / sheetW)
    setZoom(clampZoom(scale))
    fitModeRef.current = true
  }, [sheetW])

  useEffect(() => {
    function onResize() {
      if (!fitModeRef.current) return
      const scroller = scrollRef.current
      if (!scroller || sheetW <= 0) return
      const scale = Math.min(1, (scroller.clientWidth - FIT_PADDING) / sheetW)
      setZoom(clampZoom(scale))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [sheetW])

  async function handlePrint() {
    if (!request) return
    setBusyPrint(true)
    try {
      // Pembatalan oleh user diperlakukan normal oleh main (tidak error).
      await window.electronAPI.reportPrint.print(request)
      notify.success(LABELS.REPORT.PRINT_SENT)
    } catch (err: unknown) {
      notify.error(err instanceof Error ? err.message : LABELS.REPORT.PRINT_PREVIEW_ERROR)
    } finally {
      setBusyPrint(false)
    }
  }

  async function handleSavePdf() {
    if (!request) return
    setBusyPdf(true)
    setPdfStatus('')
    try {
      const result = await window.electronAPI.reportPrint.pdf(request)
      if (result.saved && result.filePath) {
        const message = LABELS.REPORT.PRINT_SAVED + result.filePath
        setPdfStatus(message)
        notify.success(message)
      }
      // saved:false (user membatalkan) → tanpa error, tanpa toast.
    } catch (err: unknown) {
      notify.error(err instanceof Error ? err.message : LABELS.REPORT.PRINT_PREVIEW_ERROR)
    } finally {
      setBusyPdf(false)
    }
  }

  const percent = Math.round(zoom * 100)
  const busy = busyPrint || busyPdf
  const orientationLabel = orientation === 'landscape' ? LABELS.REPORT.PRINT_LANDSCAPE : LABELS.REPORT.PRINT_PORTRAIT
  const metaText = pageCount ? `A4 ${orientationLabel} / ${pageCount} ${LABELS.REPORT.PRINT_PAGES}` : `A4 ${orientationLabel}`

  const toolbarButton =
    'flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  const primaryButton =
    'flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => navigate(fromPath)}
          className="p-1.5 rounded hover:bg-slate-200 transition-colors text-slate-500"
          title={LABELS.REPORT.PRINT_BACK}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{title || LABELS.REPORT.PRINT_PREVIEW_TITLE}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{metaText}</p>
        </div>
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

        <button onClick={() => navigate(fromPath)} className={`${toolbarButton} border-red-200 text-red-600 hover:bg-red-50`}>
          <ArrowLeft size={16} />
          {LABELS.REPORT.PRINT_BACK}
        </button>
      </div>

      {pdfStatus && <p className="mb-3 text-sm text-green-700">{pdfStatus}</p>}

      {!request ? (
        <div className="space-y-3">
          <p className="text-slate-500 text-sm">{LABELS.REPORT.PRINT_PREVIEW_NO_STATE}</p>
          <button onClick={() => navigate(ROUTES.REPORTS)} className={toolbarButton}>
            <ArrowLeft size={16} />
            {LABELS.REPORT.PRINT_BACK}
          </button>
        </div>
      ) : loading ? (
        <p className="text-slate-400 text-sm">{LABELS.REPORT.PRINT_PREVIEW_LOADING}</p>
      ) : error ? (
        <p className="text-red-500 text-sm">{error}</p>
      ) : docParts ? (
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto bg-slate-200 rounded-lg p-4">
          {/* CSS dokumen disuntik SEKALI agar berlaku untuk semua sheet yang dirender sebagian. */}
          <style dangerouslySetInnerHTML={{ __html: docParts.styleText }} />
          {visibleSheets.map((sheet, i) => (
            <div key={i} style={{ width: sheetW * zoom, height: sheetH * zoom, margin: '0 auto 16px' }}>
              <div style={{ width: sheetW, transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
                <div dangerouslySetInnerHTML={{ __html: sheet }} />
              </div>
            </div>
          ))}
          {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
          {totalRows === 0 && <p className="text-center text-slate-500 mt-4">{LABELS.REPORT.EMPTY_PREVIEW}</p>}
        </div>
      ) : (
        <p className="text-slate-400 text-sm">{LABELS.REPORT.PRINT_PREVIEW_ERROR}</p>
      )}
    </div>
  )
}
