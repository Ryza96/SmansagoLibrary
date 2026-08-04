import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Maximize2,
  Printer,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react'
import { LABELS } from '../utils/labels'

const MIN_ZOOM = 0.5
const MAX_ZOOM = 2.0
const ZOOM_STEP = 0.1
const FIT_PADDING = 48

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

export default function BorrowReceiptPreviewPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [html, setHtml] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [borrowNumber, setBorrowNumber] = useState('')
  const [zoom, setZoom] = useState(1)
  const [natural, setNatural] = useState({ w: 0, h: 0 })
  const [activePage, setActivePage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [busyPrint, setBusyPrint] = useState(false)
  const [busyPdf, setBusyPdf] = useState(false)
  const [pdfStatus, setPdfStatus] = useState('')

  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const fitModeRef = useRef(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setError('')
    Promise.all([
      window.electronAPI.print.borrowCardPreview(id),
      window.electronAPI.borrowings.findById(id)
    ])
      .then(([previewHtml, borrowing]) => {
        if (cancelled) return
        setHtml(previewHtml)
        setBorrowNumber(borrowing.borrowingNumber)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : LABELS.RECEIPT_PREVIEW.ERROR)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (!html || !contentRef.current) return
    const el = contentRef.current
    setNatural({ w: el.offsetWidth, h: el.scrollHeight })
    const sheets = el.querySelectorAll('.sheet')
    setTotalPages(sheets.length)
    setActivePage(1)
  }, [html])

  function sheetNaturalOffsets(): number[] {
    const content = contentRef.current
    if (!content) return []
    const contentTop = content.getBoundingClientRect().top
    return Array.from(content.querySelectorAll<HTMLElement>('.sheet')).map(
      (el) => el.getBoundingClientRect().top - contentTop
    )
  }

  const handleScroll = useCallback(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    const offsets = sheetNaturalOffsets()
    if (offsets.length === 0) return
    const naturalTop = scroller.scrollTop / zoom
    let current = 1
    offsets.forEach((top, index) => {
      if (top <= naturalTop + 1) current = index + 1
    })
    setActivePage(Math.min(current, offsets.length))
  }, [zoom])

  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey) return
      e.preventDefault()
      const step = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
      setZoom((z) => clampZoom(z + step))
    }
    scroller.addEventListener('wheel', onWheel, { passive: false })
    return () => scroller.removeEventListener('wheel', onWheel)
  }, [])

  const handleFitWidth = useCallback(() => {
    const scroller = scrollRef.current
    if (!scroller || natural.w <= 0) return
    const scale = Math.min(1, (scroller.clientWidth - FIT_PADDING) / natural.w)
    setZoom(clampZoom(scale))
    fitModeRef.current = true
  }, [natural.w])

  useEffect(() => {
    function onResize() {
      if (!fitModeRef.current) return
      const scroller = scrollRef.current
      if (!scroller || natural.w <= 0) return
      const scale = Math.min(1, (scroller.clientWidth - FIT_PADDING) / natural.w)
      setZoom(clampZoom(scale))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [natural.w])

  function scrollToPage(page: number) {
    const scroller = scrollRef.current
    if (!scroller) return
    const offsets = sheetNaturalOffsets()
    const target = offsets[page - 1]
    if (target === undefined) return
    scroller.scrollTop = target * zoom
    setActivePage(page)
  }

  async function handlePrint() {
    if (!id) return
    setBusyPrint(true)
    setPdfStatus('')
    try {
      await window.electronAPI.print.borrowCard(id)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : LABELS.RECEIPT_PREVIEW.PRINT_ERROR
      alert(message)
    } finally {
      setBusyPrint(false)
    }
  }

  async function handleSavePdf() {
    if (!id) return
    setBusyPdf(true)
    setPdfStatus('')
    try {
      const result = await window.electronAPI.print.borrowCardPdf(id)
      if (result.saved && result.filePath) {
        setPdfStatus(LABELS.RECEIPT_PREVIEW.PDF_SAVED + result.filePath)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : LABELS.RECEIPT_PREVIEW.PDF_ERROR
      alert(message)
    } finally {
      setBusyPdf(false)
    }
  }

  const percent = Math.round(zoom * 100)
  const busy = busyPrint || busyPdf
  const sheetW = natural.w || 416
  const sheetH = natural.h || 227
  const showPages = totalPages > 1

  const toolbarButton =
    'flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  const primaryButton =
    'flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  const iconButton =
    'p-1.5 rounded hover:bg-slate-200 transition-colors text-slate-500 disabled:opacity-40 disabled:cursor-not-allowed'

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 rounded hover:bg-slate-200 transition-colors text-slate-500"
          title={LABELS.RECEIPT_PREVIEW.CLOSE}
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-slate-800">{LABELS.RECEIPT_PREVIEW.TITLE}</h1>
        {borrowNumber && (
          <span className="text-sm text-slate-500 font-mono bg-slate-200 px-2 py-0.5 rounded">
            {borrowNumber}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
          disabled={zoom <= MIN_ZOOM}
          className={toolbarButton}
        >
          <ZoomOut size={16} />
          {LABELS.RECEIPT_PREVIEW.ZOOM_OUT}
        </button>
        <button
          onClick={() => setZoom(1)}
          className={`${toolbarButton} min-w-[3.5rem] justify-center font-semibold`}
        >
          {percent}%
        </button>
        <button
          onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
          disabled={zoom >= MAX_ZOOM}
          className={toolbarButton}
        >
          <ZoomIn size={16} />
          {LABELS.RECEIPT_PREVIEW.ZOOM_IN}
        </button>
        <button onClick={handleFitWidth} className={toolbarButton}>
          <Maximize2 size={16} />
          {LABELS.RECEIPT_PREVIEW.FIT_WIDTH}
        </button>

        <div className="w-px h-6 bg-slate-300 mx-1" />

        <button
          onClick={handlePrint}
          disabled={busy || !html}
          className={`${primaryButton} bg-blue-600 hover:bg-blue-700`}
        >
          <Printer size={16} />
          {busyPrint ? LABELS.RECEIPT_PREVIEW.PRINTING : LABELS.RECEIPT_PREVIEW.PRINT}
        </button>
        <button
          onClick={handleSavePdf}
          disabled={busy || !html}
          className={`${primaryButton} bg-emerald-600 hover:bg-emerald-700`}
        >
          <FileDown size={16} />
          {busyPdf ? LABELS.RECEIPT_PREVIEW.SAVING_PDF : LABELS.RECEIPT_PREVIEW.SAVE_PDF}
        </button>

        <button
          onClick={() => navigate(-1)}
          className={`${toolbarButton} border-red-200 text-red-600 hover:bg-red-50`}
        >
          <X size={16} />
          {LABELS.RECEIPT_PREVIEW.CLOSE}
        </button>

        {showPages && (
          <div className="ml-auto flex items-center gap-1 text-sm text-slate-600">
            <button
              onClick={() => scrollToPage(activePage - 1)}
              disabled={activePage <= 1}
              className={iconButton}
              title={LABELS.RECEIPT_PREVIEW.PREV_PAGE}
            >
              <ChevronLeft size={18} />
            </button>
            <span className="px-2 py-1 font-medium bg-white border border-slate-300 rounded-lg">
              {LABELS.RECEIPT_PREVIEW.PAGE} {activePage} / {totalPages}
            </span>
            <button
              onClick={() => scrollToPage(activePage + 1)}
              disabled={activePage >= totalPages}
              className={iconButton}
              title={LABELS.RECEIPT_PREVIEW.NEXT_PAGE}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>

      {pdfStatus && <p className="mb-3 text-sm text-green-700">{pdfStatus}</p>}

      {loading ? (
        <p className="text-slate-400 text-sm">{LABELS.RECEIPT_PREVIEW.LOADING}</p>
      ) : error ? (
        <p className="text-red-500 text-sm">{error}</p>
      ) : html ? (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 min-h-0 overflow-auto bg-slate-200 rounded-lg"
        >
          <div style={{ width: sheetW * zoom, height: sheetH * zoom, margin: '0 auto' }}>
            <div style={{ width: sheetW, transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
              <div ref={contentRef} className="preview-sheet" dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          </div>
        </div>
      ) : (
        <p className="text-slate-400 text-sm">{LABELS.RECEIPT_PREVIEW.NO_DATA}</p>
      )}
    </div>
  )
}
