import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FileDown, Maximize2, Printer, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useNotification } from '../notification/NotificationContext'
import { LABELS } from '../utils/labels'

const MIN_ZOOM = 0.5
const MAX_ZOOM = 2.0
const ZOOM_STEP = 0.1
const FIT_PADDING = 48

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

export default function CollectiveCardPreviewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { notify } = useNotification()

  const [html, setHtml] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [zoom, setZoom] = useState(1)
  const [natural, setNatural] = useState({ w: 0, h: 0 })
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
    window.electronAPI.print
      .collectiveCardPreview(id)
      .then((previewHtml) => {
        if (!cancelled) setHtml(previewHtml)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : LABELS.COLLECTIVE.CARD_ERROR)
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
  }, [html])

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

  async function handlePrint() {
    if (!id) return
    setBusyPrint(true)
    try {
      await window.electronAPI.print.collectiveCard(id)
    } catch (err: unknown) {
      notify.error(err instanceof Error ? err.message : LABELS.RECEIPT_PREVIEW.PRINT_ERROR)
    } finally {
      setBusyPrint(false)
    }
  }

  async function handleSavePdf() {
    if (!id) return
    setBusyPdf(true)
    setPdfStatus('')
    try {
      const result = await window.electronAPI.print.collectiveCardPdf(id)
      if (result.saved && result.filePath) {
        setPdfStatus(LABELS.COLLECTIVE.CARD_PDF_SAVED + result.filePath)
      }
    } catch (err: unknown) {
      notify.error(err instanceof Error ? err.message : LABELS.COLLECTIVE.CARD_PDF_ERROR)
    } finally {
      setBusyPdf(false)
    }
  }

  const percent = Math.round(zoom * 100)
  const busy = busyPrint || busyPdf
  const sheetW = natural.w || 794
  const sheetH = natural.h || 1123

  const toolbarButton =
    'flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  const primaryButton =
    'flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 rounded hover:bg-slate-200 transition-colors text-slate-500"
          title={LABELS.COLLECTIVE.CARD_CLOSE}
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-slate-800">{LABELS.COLLECTIVE.CARD_TITLE}</h1>
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
          {busyPrint ? LABELS.COLLECTIVE.CARD_PRINTING : LABELS.COLLECTIVE.CARD_PRINT}
        </button>
        <button
          onClick={handleSavePdf}
          disabled={busy || !html}
          className={`${primaryButton} bg-emerald-600 hover:bg-emerald-700`}
        >
          <FileDown size={16} />
          {busyPdf ? LABELS.COLLECTIVE.CARD_SAVING_PDF : LABELS.COLLECTIVE.CARD_SAVE_PDF}
        </button>

        <button onClick={() => navigate(-1)} className={`${toolbarButton} border-red-200 text-red-600 hover:bg-red-50`}>
          <X size={16} />
          {LABELS.COLLECTIVE.CARD_CLOSE}
        </button>
      </div>

      {pdfStatus && <p className="mb-3 text-sm text-green-700">{pdfStatus}</p>}

      {loading ? (
        <p className="text-slate-400 text-sm">{LABELS.COLLECTIVE.CARD_LOADING}</p>
      ) : error ? (
        <p className="text-red-500 text-sm">{error}</p>
      ) : html ? (
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto bg-slate-200 rounded-lg">
          <div style={{ width: sheetW * zoom, height: sheetH * zoom, margin: '0 auto' }}>
            <div style={{ width: sheetW, transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
              <div ref={contentRef} className="preview-sheet" dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          </div>
        </div>
      ) : (
        <p className="text-slate-400 text-sm">{LABELS.COLLECTIVE.CARD_ERROR}</p>
      )}
    </div>
  )
}
