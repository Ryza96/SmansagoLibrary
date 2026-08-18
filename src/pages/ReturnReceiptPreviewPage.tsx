import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Printer,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react'
import { LABELS } from '../utils/labels'
import { useNotification } from '../notification/NotificationContext'

const MIN_ZOOM = 0.5
const MAX_ZOOM = 2.0
const ZOOM_STEP = 0.1
const FIT_PADDING = 48

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

interface ReturnReceiptState {
  returnedBookIds?: string[]
}

export default function ReturnReceiptPreviewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state as ReturnReceiptState | null)
  const { notify } = useNotification()

  const [html, setHtml] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [zoom, setZoom] = useState(1)
  const [natural, setNatural] = useState({ w: 0, h: 0 })
  const [activePage, setActivePage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [busyPrint, setBusyPrint] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const fitModeRef = useRef(false)

  const returnedBookIds = state?.returnedBookIds

  useEffect(() => {
    if (!id) return
    if (!returnedBookIds || returnedBookIds.length === 0) {
      setError(LABELS.RETURN_RECEIPT_PREVIEW.NO_STATE)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    window.electronAPI.print
      .returnReceiptPreview(id, returnedBookIds)
      .then((previewHtml) => {
        if (cancelled) return
        setHtml(previewHtml)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : LABELS.RETURN_RECEIPT_PREVIEW.ERROR)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id, returnedBookIds])

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
    if (!id || !returnedBookIds) return
    setBusyPrint(true)
    try {
      const receiptHtml = await window.electronAPI.print.returnReceiptPreview(id, returnedBookIds)
      const printWindow = window.open('', '_blank')
      if (printWindow) {
        printWindow.document.write(receiptHtml)
        printWindow.document.close()
        printWindow.print()
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal mencetak.'
      notify.error(message)
    } finally {
      setBusyPrint(false)
    }
  }

  const percent = Math.round(zoom * 100)
  const sheetW = natural.w || 700
  const sheetH = natural.h || 400
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
          onClick={() => {
            const rr = (location.state as Record<string, unknown> | null)?.returnResult
            if (rr) {
              navigate('/returns', { state: location.state })
            } else {
              navigate(-1)
            }
          }}
          className="p-1.5 rounded hover:bg-slate-200 transition-colors text-slate-500"
          title={LABELS.RETURN_RECEIPT_PREVIEW.CLOSE}
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-slate-800">
          {LABELS.RETURN_RECEIPT_PREVIEW.TITLE}
        </h1>
        {returnedBookIds && returnedBookIds.length > 0 && (
          <span className="text-sm text-slate-500 font-mono bg-slate-200 px-2 py-0.5 rounded">
            {returnedBookIds.length} {LABELS.RETURN_RECEIPT_PREVIEW.ITEMS_RETURNED}
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
          {LABELS.RETURN_RECEIPT_PREVIEW.ZOOM_OUT}
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
          {LABELS.RETURN_RECEIPT_PREVIEW.ZOOM_IN}
        </button>
        <button onClick={handleFitWidth} className={toolbarButton}>
          <Maximize2 size={16} />
          {LABELS.RETURN_RECEIPT_PREVIEW.FIT_WIDTH}
        </button>

        <div className="w-px h-6 bg-slate-300 mx-1" />

        <button
          onClick={handlePrint}
          disabled={busyPrint || !html}
          className={`${primaryButton} bg-blue-600 hover:bg-blue-700`}
        >
          <Printer size={16} />
          {busyPrint ? LABELS.RETURN_RECEIPT_PREVIEW.PRINTING : LABELS.RETURN_RECEIPT_PREVIEW.PRINT}
        </button>

        <button
          onClick={() => {
            const rr = (location.state as Record<string, unknown> | null)?.returnResult
            if (rr) {
              navigate('/returns', { state: location.state })
            } else {
              navigate(-1)
            }
          }}
          className={`${toolbarButton} border-red-200 text-red-600 hover:bg-red-50`}
        >
          <X size={16} />
          {LABELS.RETURN_RECEIPT_PREVIEW.CLOSE}
        </button>

        {showPages && (
          <div className="ml-auto flex items-center gap-1 text-sm text-slate-600">
            <button
              onClick={() => scrollToPage(activePage - 1)}
              disabled={activePage <= 1}
              className={iconButton}
              title={LABELS.RETURN_RECEIPT_PREVIEW.PREV_PAGE}
            >
              <ChevronLeft size={18} />
            </button>
            <span className="px-2 py-1 font-medium bg-white border border-slate-300 rounded-lg">
              {LABELS.RETURN_RECEIPT_PREVIEW.PAGE} {activePage} / {totalPages}
            </span>
            <button
              onClick={() => scrollToPage(activePage + 1)}
              disabled={activePage >= totalPages}
              className={iconButton}
              title={LABELS.RETURN_RECEIPT_PREVIEW.NEXT_PAGE}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm">{LABELS.RETURN_RECEIPT_PREVIEW.LOADING}</p>
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
              <div ref={contentRef} dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          </div>
        </div>
      ) : (
        <p className="text-slate-400 text-sm">{LABELS.RETURN_RECEIPT_PREVIEW.NO_DATA}</p>
      )}
    </div>
  )
}
