import { useState } from 'react'
import { X, FileDown, Loader2, Upload } from 'lucide-react'
import { LABELS } from '../../utils/labels'
import FileUploadDropzone from '../books/FileUploadDropzone'
import { memberExcelParserService, type ParsedMemberRow } from '../../services/MemberExcelParserService'
import {
  memberImportValidationService,
  type MemberValidationError,
  type MemberValidationResult,
} from '../../services/MemberImportValidationService'
import {
  memberPreviewService,
  PREVIEW_MAX_ROWS,
  type MemberPreviewResult,
  type MemberPreviewRow,
  type MemberPreviewStatus,
} from '../../services/MemberPreviewService'
import type { ImportCellValue } from '../../types/import'

interface MemberImportDialogProps {
  onClose: () => void
}

function displayValue(value: ImportCellValue): string {
  if (value === null || value === undefined) return '—'
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value)
}

function nisnKey(value: ImportCellValue): string | null {
  if (value === null || value === undefined) return null
  const key = String(value).trim()
  return key === '' ? null : key
}

function errorMessage(error: MemberValidationError): string {
  const key = error.messageKey.replace('memberImport.', '')
  const messages = LABELS.MEMBER_IMPORT.MESSAGES as unknown as Record<string, (label: string) => string>
  const template = messages[key]
  return template ? template(error.label) : ''
}

function duplicateWith(row: MemberPreviewRow, rows: MemberPreviewRow[]): string {
  const key = nisnKey(row.nisn)
  if (key === null) return ''
  const siblings = rows
    .filter((r) => r.rowNumber !== row.rowNumber && nisnKey(r.nisn) === key)
    .map((r) => r.rowNumber)
  if (siblings.length === 0) return ''
  return LABELS.MEMBER_IMPORT.NOTE_DUPLICATE(siblings.join(', '))
}

function keterangan(row: MemberPreviewRow, rows: MemberPreviewRow[]): string {
  switch (row.status) {
    case 'VALID':
      return LABELS.MEMBER_IMPORT.NOTE_VALID
    case 'DUPLICATE':
      return duplicateWith(row, rows)
    case 'ERROR':
      return row.errors
        .map(errorMessage)
        .filter(Boolean)
        .join('\n')
  }
}

const STATUS_BADGE: Record<MemberPreviewStatus, string> = {
  VALID: 'bg-emerald-100 text-emerald-700',
  ERROR: 'bg-red-100 text-red-700',
  DUPLICATE: 'bg-amber-100 text-amber-700',
}

const STATUS_LABEL: Record<MemberPreviewStatus, string> = {
  VALID: LABELS.MEMBER_IMPORT.STATUS_VALID,
  ERROR: LABELS.MEMBER_IMPORT.STATUS_ERROR,
  DUPLICATE: LABELS.MEMBER_IMPORT.STATUS_DUPLICATE,
}

export default function MemberImportDialog({ onClose }: MemberImportDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [parsedRows, setParsedRows] = useState<ParsedMemberRow[]>([])
  const [validationResult, setValidationResult] = useState<MemberValidationResult | null>(null)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [downloadStatus, setDownloadStatus] = useState<'success' | 'error' | null>(null)
  const [previewResult, setPreviewResult] = useState<MemberPreviewResult | null>(null)
  const [importNotice, setImportNotice] = useState('')

  async function handleFileChange(next: File | null) {
    setFile(next)
    setParsedRows([])
    setValidationResult(null)
    setPreviewResult(null)
    setImportNotice('')
    setParseError('')
    if (!next) return
    setParsing(true)
    try {
      const rows = await memberExcelParserService.parse(next)
      setParsedRows(rows)
      setValidationResult(memberImportValidationService.validate(rows))
      setPreviewResult(memberPreviewService.buildPreview(rows))
    } catch (error) {
      setParseError(error instanceof Error ? error.message : LABELS.MEMBER_IMPORT.PARSE_ERROR)
    } finally {
      setParsing(false)
    }
  }

  async function handleDownloadTemplate() {
    setDownloading(true)
    setDownloadStatus(null)
    try {
      const result = await window.electronAPI.memberImport.downloadTemplate()
      setDownloadStatus(result.status === 'saved' ? 'success' : 'error')
    } catch {
      setDownloadStatus('error')
    } finally {
      setDownloading(false)
    }
  }

  function handleImport() {
    setImportNotice(LABELS.MEMBER_IMPORT.IMPORT_PLACEHOLDER)
  }

  function handleClose() {
    setFile(null)
    setParsedRows([])
    setValidationResult(null)
    setPreviewResult(null)
    setImportNotice('')
    setParsing(false)
    setParseError('')
    setDownloading(false)
    setDownloadStatus(null)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={handleClose}>
      <div
        className="w-full max-w-2xl bg-white rounded-lg shadow-xl mx-4 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800">{LABELS.MEMBER_IMPORT.TITLE}</h3>
          <button type="button" onClick={handleClose} className="p-1 rounded hover:bg-slate-100 text-slate-400">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          <p className="text-sm text-slate-500">{LABELS.MEMBER_IMPORT.SUBTITLE}</p>

          <div>
            <h4 className="text-sm font-medium text-slate-700 mb-1">{LABELS.MEMBER_IMPORT.UPLOAD_STEP_TITLE}</h4>
            <p className="text-sm text-slate-500 mb-4">{LABELS.MEMBER_IMPORT.UPLOAD_STEP_DESC}</p>
            <div className="space-y-4">
              <FileUploadDropzone file={file} onFileChange={handleFileChange} />
              {parsing && (
                <p className="text-xs text-slate-500">{LABELS.MEMBER_IMPORT.PARSING}</p>
              )}
              {parseError && (
                <p className="text-xs text-red-600">{parseError}</p>
              )}
              <button
                type="button"
                onClick={handleDownloadTemplate}
                disabled={downloading}
                className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                {downloading ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
                {LABELS.MEMBER_IMPORT.DOWNLOAD_TEMPLATE}
              </button>
              {downloadStatus && (
                <p className={`text-xs ${downloadStatus === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                  {downloadStatus === 'success'
                    ? LABELS.MEMBER_IMPORT.DOWNLOAD_SUCCESS
                    : LABELS.MEMBER_IMPORT.DOWNLOAD_ERROR}
                </p>
              )}
            </div>
          </div>

          {previewResult && (
            <div className="border-t border-slate-200 pt-5">
              <h4 className="text-sm font-medium text-slate-700 mb-3">{LABELS.MEMBER_IMPORT.PREVIEW_TITLE}</h4>

              <div className="grid grid-cols-4 gap-3 mb-4">
                <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                  <p className="text-xs text-slate-500">{LABELS.MEMBER_IMPORT.SUMMARY_TOTAL}</p>
                  <p className="text-lg font-semibold text-slate-800">{previewResult.summary.total}</p>
                </div>
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
                  <p className="text-xs text-emerald-600">{LABELS.MEMBER_IMPORT.SUMMARY_VALID}</p>
                  <p className="text-lg font-semibold text-emerald-700">{previewResult.summary.valid}</p>
                </div>
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                  <p className="text-xs text-red-600">{LABELS.MEMBER_IMPORT.SUMMARY_ERROR}</p>
                  <p className="text-lg font-semibold text-red-700">{previewResult.summary.error}</p>
                </div>
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                  <p className="text-xs text-amber-600">{LABELS.MEMBER_IMPORT.SUMMARY_DUPLICATE}</p>
                  <p className="text-lg font-semibold text-amber-700">{previewResult.summary.duplicate}</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-3 font-medium">{LABELS.MEMBER_IMPORT.HEADER_BARIS}</th>
                      <th className="py-2 pr-3 font-medium">{LABELS.MEMBER_IMPORT.HEADER_NAMA}</th>
                      <th className="py-2 pr-3 font-medium">{LABELS.MEMBER_IMPORT.HEADER_KELAS}</th>
                      <th className="py-2 pr-3 font-medium">{LABELS.MEMBER_IMPORT.HEADER_NISN}</th>
                      <th className="py-2 pr-3 font-medium">{LABELS.MEMBER_IMPORT.HEADER_STATUS}</th>
                      <th className="py-2 font-medium">{LABELS.MEMBER_IMPORT.HEADER_KETERANGAN}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewResult.rows.slice(0, PREVIEW_MAX_ROWS).map((row) => (
                      <tr key={row.rowNumber} className="border-b border-slate-100 align-top">
                        <td className="py-2 pr-3 text-slate-500 tabular-nums">{row.rowNumber}</td>
                        <td className="py-2 pr-3 text-slate-800">{displayValue(row.nama)}</td>
                        <td className="py-2 pr-3 text-slate-800">{displayValue(row.kelas)}</td>
                        <td className="py-2 pr-3 text-slate-800">{displayValue(row.nisn)}</td>
                        <td className="py-2 pr-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[row.status]}`}
                          >
                            {STATUS_LABEL[row.status]}
                          </span>
                        </td>
                        <td className="py-2 text-slate-600 whitespace-pre-line break-words">{keterangan(row, previewResult.rows)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {previewResult.summary.total > PREVIEW_MAX_ROWS && (
                <p className="text-xs text-slate-500 mt-2">
                  {LABELS.MEMBER_IMPORT.PREVIEW_MORE_ROWS(previewResult.summary.total - PREVIEW_MAX_ROWS)}
                </p>
              )}

              <div className="flex items-center gap-3 mt-4">
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={!previewResult.canImport}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Upload size={16} />
                  {LABELS.MEMBER_IMPORT.IMPORT_BUTTON}
                </button>
                {importNotice && <p className="text-xs text-slate-500">{importNotice}</p>}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-200">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
          >
            {LABELS.MEMBER_IMPORT.CLOSE}
          </button>
        </div>
      </div>
    </div>
  )
}
