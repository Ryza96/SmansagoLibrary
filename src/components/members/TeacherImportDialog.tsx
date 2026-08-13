import { useEffect, useRef, useState } from 'react'
import { X, FileDown, Loader2, Upload, AlertTriangle } from 'lucide-react'
import FileUploadDropzone from '../books/FileUploadDropzone'
import { teacherExcelParserService, type ParsedTeacherRow } from '../../services/TeacherExcelParserService'
import type { TeacherValidationError } from '../../services/TeacherImportValidationService'
import {
  teacherPreviewService,
  TEACHER_PREVIEW_MAX_ROWS,
  type TeacherPreviewResult,
  type TeacherPreviewRow,
  type TeacherPreviewStatus,
} from '../../services/TeacherPreviewService'
import type {
  TeacherImportPreviewIssue,
  TeacherImportResultDTO,
  TeacherImportRowInput,
} from '../../shared/dto/teacher'
import type { ImportCellValue, ImportErrorCode } from '../../types/import'
import { validateImportFile, getImportErrorMessage } from '../../utils/bookImport'
import { teacherImportMessage } from '../../utils/teacherImport'

interface TeacherImportDialogProps {
  onClose: () => void
}

function toString(value: ImportCellValue): string {
  return value === null || value === undefined ? '' : String(value)
}

function toGender(value: ImportCellValue): 'male' | 'female' {
  const normalized = toString(value).trim().toLowerCase()
  if (normalized === 'p' || normalized === 'perempuan') return 'female'
  return 'male'
}

function toDateString(value: ImportCellValue): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value === 'string' && value.trim() !== '') return value.trim()
  return ''
}

function toTeacherImportRows(rows: ParsedTeacherRow[]): TeacherImportRowInput[] {
  return rows.map((row) => ({
    rowNumber: row.rowNumber,
    fullName: toString(row.nama),
    gender: toGender(row.jenisKelamin),
    nip: toString(row.nip) || undefined,
    birthPlace: toString(row.tempatLahir) || undefined,
    birthDate: toDateString(row.tanggalLahir) || undefined,
    address: toString(row.alamat) || undefined,
    phone: toString(row.whatsapp) || undefined,
    email: toString(row.email) || undefined,
  }))
}

function validationMessage(error: TeacherValidationError): string {
  return teacherImportMessage(error.messageKey)
}

function backendIssueMessage(issue: TeacherImportPreviewIssue): string {
  const label = issue.field === 'nip' ? 'NIP' : issue.field ?? ''
  const suffix =
    issue.existingMemberName || issue.existingMemberNumber
      ? ` (${[issue.existingMemberName, issue.existingMemberNumber].filter(Boolean).join(' · ')})`
      : ''
  return teacherImportMessage(issue.messageKey) + (label ? ` (${label})` : '') + suffix
}

function keterangan(row: TeacherPreviewRow): string {
  if (row.status === 'VALID') return 'Baris valid.'
  const parts: string[] = []
  for (const error of row.errors) {
    parts.push(validationMessage(error))
  }
  if (row.duplicateNipRows.length > 0) {
    parts.push(`NIP duplikat dalam file: baris ${row.duplicateNipRows.join(', ')}`)
  }
  for (const issue of row.issues) {
    if (issue.messageKey === 'teacherImport.duplicateNipInFile') continue
    const message = backendIssueMessage(issue as unknown as TeacherImportPreviewIssue)
    if (message) parts.push(message)
  }
  return parts.join('\n')
}

function resultIssueMessage(issue: TeacherImportPreviewIssue): string {
  const message = backendIssueMessage(issue)
  if (!message) return ''
  return issue.rowNumber > 0 ? `Baris ${issue.rowNumber}: ${message}` : message
}

const STATUS_BADGE: Record<TeacherPreviewStatus, string> = {
  VALID: 'bg-emerald-100 text-emerald-700',
  ERROR: 'bg-red-100 text-red-700',
  DUPLICATE: 'bg-amber-100 text-amber-700',
}

const STATUS_LABEL: Record<TeacherPreviewStatus, string> = {
  VALID: 'Valid',
  ERROR: 'Error',
  DUPLICATE: 'Duplikat',
}

const STAGE_LABEL: Record<string, string> = {
  preparing: 'Menyiapkan',
  'checking-duplicate': 'Memeriksa duplikat',
  'generating-number': 'Membuat nomor anggota',
  completed: 'Selesai',
}

export default function TeacherImportDialog({ onClose }: TeacherImportDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [parsedRows, setParsedRows] = useState<ParsedTeacherRow[]>([])
  const [parsing, setParsing] = useState(false)
  const [previewChecking, setPreviewChecking] = useState(false)
  const [parseError, setParseError] = useState('')
  const [fileErrorCode, setFileErrorCode] = useState<ImportErrorCode | null>(null)
  const [previewError, setPreviewError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [downloadStatus, setDownloadStatus] = useState<'success' | 'error' | null>(null)
  const [previewResult, setPreviewResult] = useState<TeacherPreviewResult | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<TeacherImportResultDTO | null>(null)
  const [importSystemError, setImportSystemError] = useState('')
  const [progress, setProgress] = useState<string | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => {
      unsubscribeRef.current?.()
      unsubscribeRef.current = null
    }
  }, [])

  function subscribeProgress() {
    unsubscribeRef.current?.()
    unsubscribeRef.current = window.electronAPI.teacherImport.onProgress((stage) => {
      setProgress(stage)
    })
  }

  function unsubscribeProgress() {
    unsubscribeRef.current?.()
    unsubscribeRef.current = null
  }

  function buildPreview(rows: ParsedTeacherRow[], backendIssues: TeacherImportPreviewIssue[]): TeacherPreviewResult {
    const local = teacherPreviewService.preview(rows)
    if (backendIssues.length === 0) return local

    const issuesByRow = new Map<number, TeacherImportPreviewIssue[]>()
    for (const issue of backendIssues) {
      const list = issuesByRow.get(issue.rowNumber)
      if (list) list.push(issue)
      else issuesByRow.set(issue.rowNumber, [issue])
    }

    const previewRows = local.rows.map((row) => {
      const issues = issuesByRow.get(row.rowNumber) ?? []
      if (issues.length === 0) return row
      const hasBackendDuplicate = issues.some(
        (issue) => issue.messageKey === 'teacherImport.duplicateNipInDb'
      )
      const status: TeacherPreviewStatus =
        row.status === 'ERROR' || !hasBackendDuplicate ? 'ERROR' : 'DUPLICATE'
      return {
        ...row,
        status,
        issues: [...row.issues, ...(issues as unknown as TeacherValidationError[])],
      }
    })

    const errorCount = previewRows.filter((row) => row.status === 'ERROR').length
    const duplicateCount = previewRows.filter((row) => row.status === 'DUPLICATE').length
    return {
      rows: previewRows,
      summary: {
        total: local.summary.total,
        valid: local.summary.total - errorCount - duplicateCount,
        error: errorCount,
        duplicate: duplicateCount,
      },
      canImport:
        local.summary.total > 0 &&
        errorCount === 0 &&
        duplicateCount === 0 &&
        backendIssues.length === 0,
    }
  }

  async function runPreview(rows: ParsedTeacherRow[]) {
    setPreviewChecking(true)
    setPreviewResult(null)
    setPreviewError('')
    setImportResult(null)
    setImportSystemError('')
    setProgress(null)
    try {
      const previewDto = await window.electronAPI.teacherImport.previewCheck(toTeacherImportRows(rows))
      setPreviewResult(buildPreview(rows, previewDto.errors))
    } catch {
      setPreviewError('Gagal memeriksa data. Silakan coba lagi.')
    } finally {
      setPreviewChecking(false)
    }
  }

  async function handleFileChange(next: File | null) {
    setFile(next)
    setParsedRows([])
    setPreviewResult(null)
    setImportResult(null)
    setImportSystemError('')
    setProgress(null)
    setParseError('')
    setPreviewError('')
    if (!next) return
    const code = validateImportFile(next)
    setFileErrorCode(code)
    if (code) return
    setParsing(true)
    try {
      const rows = await teacherExcelParserService.parse(next)
      setParsedRows(rows)
      await runPreview(rows)
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'File gagal diproses.')
    } finally {
      setParsing(false)
    }
  }

  async function handleDownloadTemplate() {
    setDownloading(true)
    setDownloadStatus(null)
    try {
      const result = await window.electronAPI.teacherImport.downloadTemplate()
      setDownloadStatus(result.status === 'saved' ? 'success' : 'error')
    } catch {
      setDownloadStatus('error')
    } finally {
      setDownloading(false)
    }
  }

  async function handleImport() {
    setImporting(true)
    setImportResult(null)
    setImportSystemError('')
    setProgress('preparing')
    subscribeProgress()
    try {
      const result = await window.electronAPI.teacherImport.import(toTeacherImportRows(parsedRows))
      if (result.success) setProgress('completed')
      setImportResult(result)
    } catch (error) {
      setImportSystemError(
        error instanceof Error && error.message !== ''
          ? error.message
          : 'Terjadi kesalahan saat mengimpor data.'
      )
    } finally {
      setImporting(false)
      unsubscribeProgress()
    }
  }

  function handleClose() {
    if (importing) return
    unsubscribeProgress()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={handleClose}>
      <div
        className="w-full max-w-2xl bg-white rounded-lg shadow-xl mx-4 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800">Import Guru</h3>
          <button
            type="button"
            onClick={handleClose}
            disabled={importing}
            className="p-1 rounded hover:bg-slate-100 text-slate-400 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          <p className="text-sm text-slate-500">
            Import data guru dari file Excel. Unduh template untuk melihat format kolom yang dibutuhkan.
          </p>

          <div>
            <h4 className="text-sm font-medium text-slate-700 mb-1">Unggah File</h4>
            <p className="text-sm text-slate-500 mb-4">
              Pilih file Excel (.xlsx) berisi data guru. Maksimal {TEACHER_PREVIEW_MAX_ROWS} baris dipratinjau.
            </p>
            <div className="space-y-4">
              <div className={importing ? 'pointer-events-none opacity-60' : ''}>
                <FileUploadDropzone file={file} onFileChange={handleFileChange} />
              </div>
              {parsing && <p className="text-xs text-slate-500">Membaca file...</p>}
              {fileErrorCode && (
                <p className="text-xs text-red-600">{getImportErrorMessage(fileErrorCode)}</p>
              )}
              {parseError && <p className="text-xs text-red-600">{parseError}</p>}
              <button
                type="button"
                onClick={handleDownloadTemplate}
                disabled={downloading || importing}
                className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {downloading ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
                Unduh Template
              </button>
              {downloadStatus && (
                <p className={`text-xs ${downloadStatus === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                  {downloadStatus === 'success'
                    ? 'Template berhasil diunduh.'
                    : 'Gagal mengunduh template.'}
                </p>
              )}
            </div>
          </div>

          {(previewResult || previewError) && (
            <div className="border-t border-slate-200 pt-5">
              <h4 className="text-sm font-medium text-slate-700 mb-3">Pratinjau Data</h4>

              {previewChecking && <p className="text-xs text-slate-500 mb-3">Memeriksa data...</p>}

              {previewError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 mb-4">
                  <AlertTriangle size={16} className="text-red-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-red-700">Gagal memeriksa data</p>
                    <p className="text-xs text-red-600">{previewError}</p>
                  </div>
                </div>
              )}

              {previewResult && (
                <>
                  <div className="grid grid-cols-4 gap-3 mb-4">
                    <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                      <p className="text-xs text-slate-500">Total Baris</p>
                      <p className="text-lg font-semibold text-slate-800">{previewResult.summary.total}</p>
                    </div>
                    <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
                      <p className="text-xs text-emerald-600">Valid</p>
                      <p className="text-lg font-semibold text-emerald-700">{previewResult.summary.valid}</p>
                    </div>
                    <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                      <p className="text-xs text-red-600">Error</p>
                      <p className="text-lg font-semibold text-red-700">{previewResult.summary.error}</p>
                    </div>
                    <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                      <p className="text-xs text-amber-600">Duplikat</p>
                      <p className="text-lg font-semibold text-amber-700">{previewResult.summary.duplicate}</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                          <th className="py-2 pr-3 font-medium">Baris</th>
                          <th className="py-2 pr-3 font-medium">Nama</th>
                          <th className="py-2 pr-3 font-medium">NIP</th>
                          <th className="py-2 pr-3 font-medium">Status</th>
                          <th className="py-2 font-medium">Keterangan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewResult.rows.map((row) => (
                          <tr key={row.rowNumber} className="border-b border-slate-100 align-top">
                            <td className="py-2 pr-3 text-slate-500 tabular-nums">{row.rowNumber}</td>
                            <td className="py-2 pr-3 text-slate-800">{row.nama}</td>
                            <td className="py-2 pr-3 text-slate-800">{row.nip}</td>
                            <td className="py-2 pr-3">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[row.status]}`}
                              >
                                {STATUS_LABEL[row.status]}
                              </span>
                            </td>
                            <td className="py-2 text-slate-600 whitespace-pre-line break-words">{keterangan(row)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {previewResult.summary.total > TEACHER_PREVIEW_MAX_ROWS && (
                    <p className="text-xs text-slate-500 mt-2">
                      {previewResult.summary.total - TEACHER_PREVIEW_MAX_ROWS} baris lainnya tidak ditampilkan.
                    </p>
                  )}

                  <div className="flex items-center gap-3 mt-4">
                    <button
                      type="button"
                      onClick={handleImport}
                      disabled={!previewResult.canImport || previewError !== '' || importing || importResult?.success === true}
                      className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                      Import Guru
                    </button>
                    {importing && <p className="text-xs text-slate-500">Mengimpor data...</p>}
                  </div>

                  {progress && importing && (
                    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-sm font-medium text-slate-700">
                        {STAGE_LABEL[progress] ?? progress}
                      </p>
                    </div>
                  )}

                  {importResult?.success && (
                    <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                      <p className="text-sm font-medium text-emerald-700">Import berhasil.</p>
                      <div className="mt-3 grid grid-cols-5 gap-3">
                        <div>
                          <p className="text-xs text-emerald-600">Total</p>
                          <p className="text-lg font-semibold text-emerald-800 tabular-nums">{importResult.totalRows}</p>
                        </div>
                        <div>
                          <p className="text-xs text-emerald-600">Dibuat</p>
                          <p className="text-lg font-semibold text-emerald-800 tabular-nums">{importResult.created}</p>
                        </div>
                        <div>
                          <p className="text-xs text-amber-600">Dilewati</p>
                          <p className="text-lg font-semibold text-amber-700 tabular-nums">{importResult.skipped}</p>
                        </div>
                        <div>
                          <p className="text-xs text-red-600">Gagal</p>
                          <p className="text-lg font-semibold text-red-700 tabular-nums">{importResult.failed}</p>
                        </div>
                        <div>
                          <p className="text-xs text-amber-600">Peringatan</p>
                          <p className="text-lg font-semibold text-amber-700 tabular-nums">{importResult.warnings}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {importResult && !importResult.success && (
                    <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                      <p className="text-sm font-medium text-red-700">Import gagal.</p>
                      <ul className="mt-1 space-y-1 text-xs text-red-600">
                        {importResult.errors.map((issue, index) => {
                          const message = resultIssueMessage(issue)
                          return message ? <li key={`${issue.rowNumber}-${index}`}>{message}</li> : null
                        })}
                      </ul>
                    </div>
                  )}

                  {importSystemError && (
                    <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                      <AlertTriangle size={16} className="text-red-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-red-700">Kesalahan Sistem</p>
                        <p className="text-xs text-red-600">{importSystemError}</p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-200">
          <button
            type="button"
            onClick={handleClose}
            disabled={importing}
            className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  )
}
