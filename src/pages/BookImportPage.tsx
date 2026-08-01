import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, FileDown, FileUp } from 'lucide-react'
import FileUploadDropzone from '../components/books/FileUploadDropzone'
import { LABELS } from '../utils/labels'
import { ROUTES } from '../utils/navigation'
import { getImportErrorMessage } from '../utils/bookImport'
import { useBookImport } from '../contexts/BookImportContext'
import { useBookImportWorkflow } from '../hooks/useBookImportWorkflow'

export default function BookImportPage() {
  const navigate = useNavigate()
  const { file, errorCode, validatedWorkbook, parsing } = useBookImport()
  const { selectFile, parseAndValidate } = useBookImportWorkflow()
  const [downloading, setDownloading] = useState(false)
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const isValid = file !== null && errorCode === null && !parsing && !submitting

  async function handleContinue() {
    if (!isValid) return
    setSubmitting(true)
    try {
      const parsed = await parseAndValidate()
      if (parsed) navigate(ROUTES.BOOK_IMPORT_PREVIEW)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDownloadTemplate() {
    setDownloading(true)
    setDownloadMessage(null)
    try {
      const result = await window.electronAPI.imports.downloadTemplate()
      if (result.status === 'cancelled') {
        setDownloadMessage(LABELS.IMPORT.DOWNLOAD_CANCELLED)
      } else if (result.status === 'saved') {
        setDownloadMessage(LABELS.IMPORT.DOWNLOAD_SUCCESS)
      } else {
        setDownloadMessage(result.message)
      }
    } catch {
      setDownloadMessage(LABELS.IMPORT.DOWNLOAD_ERROR)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 rounded hover:bg-slate-200 transition-colors text-slate-500"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-slate-800">{LABELS.IMPORT.TITLE}</h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <p className="text-sm text-slate-500 mb-6">{LABELS.IMPORT.SUBTITLE}</p>

        <FileUploadDropzone file={file} onFileChange={selectFile} />

        {file === null && <p className="mt-3 text-xs text-slate-400">{LABELS.IMPORT.NO_FILE}</p>}
        {file !== null && errorCode && (
          <p className="mt-3 text-xs text-red-600">
            {getImportErrorMessage(errorCode)}
          </p>
        )}
        {file !== null && !errorCode && parsing && (
          <p className="mt-3 text-xs text-slate-400">{LABELS.IMPORT.PARSING}</p>
        )}
        {file !== null && !errorCode && validatedWorkbook && (
          <p className="mt-3 text-xs text-emerald-600">{LABELS.IMPORT.READY}</p>
        )}

        <div className="flex items-center gap-3 mt-6">
          <button
            onClick={handleDownloadTemplate}
            disabled={downloading}
            className="flex items-center gap-1.5 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileDown size={16} />
            {LABELS.IMPORT.DOWNLOAD_TEMPLATE}
          </button>
          {downloadMessage && (
            <span className="text-xs text-slate-500">{downloadMessage}</span>
          )}
          <div className="flex-1" />
          <button
            onClick={() => navigate(ROUTES.BOOKS)}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            {LABELS.IMPORT.BACK}
          </button>
          <button
            onClick={handleContinue}
            disabled={!isValid}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileUp size={16} />
            {LABELS.IMPORT.CONTINUE}
          </button>
        </div>
      </div>
    </div>
  )
}
