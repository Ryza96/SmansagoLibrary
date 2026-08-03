import { useEffect, useRef, useState } from 'react'
import { X, FileDown, Loader2, Upload, AlertTriangle } from 'lucide-react'
import { LABELS } from '../../utils/labels'
import FileUploadDropzone from '../books/FileUploadDropzone'
import { memberExcelParserService, type ParsedMemberRow } from '../../services/MemberExcelParserService'
import type { MemberValidationError } from '../../services/MemberImportValidationService'
import {
  memberPreviewService,
  PREVIEW_MAX_ROWS,
  type MemberPreviewResult,
  type MemberPreviewRow,
  type MemberPreviewStatus,
} from '../../services/MemberPreviewService'
import type {
  MemberImportPreviewIssue,
  MemberImportProgressEvent,
  MemberImportResultDTO,
  MemberImportRowInput,
  MemberImportStage,
} from '../../shared/dto/member'
import type { ImportCellValue, ImportErrorCode } from '../../types/import'
import type { AcademicYearDTO, CurriculumDTO } from '../../shared/dto/academic'
import { validateImportFile, getImportErrorMessage } from '../../utils/bookImport'
import { normalizeMemberImportRow } from '../../shared/utils/member-import-normalization'

interface MemberImportDialogProps {
  onClose: () => void
}

function displayValue(value: ImportCellValue): string {
  if (value === null || value === undefined) return '—'
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value)
}

function toString(value: ImportCellValue): string {
  return value === null || value === undefined ? '' : String(value)
}

function toGender(value: ImportCellValue): 'male' | 'female' {
  const normalized = toString(value).trim().toLowerCase().replace(/\s+/g, ' ')
  if (normalized === 'p' || normalized === 'perempuan') return 'female'
  return 'male'
}

function toDateString(value: ImportCellValue): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value === 'string' && value.trim() !== '') return value.trim()
  return ''
}

function toMemberImportRows(rows: ParsedMemberRow[]): MemberImportRowInput[] {
  return rows.map((row) =>
    normalizeMemberImportRow({
      rowNumber: row.rowNumber,
      fullName: toString(row.nama),
      className: toString(row.kelas),
      gender: toGender(row.jenisKelamin),
      nisn: toString(row.nisn),
      birthPlace: toString(row.tempatLahir) || undefined,
      birthDate: toDateString(row.tanggalLahir) || undefined,
      address: toString(row.alamat),
      phone: toString(row.whatsapp),
      email: toString(row.email) || undefined,
    })
  )
}

function errorMessage(error: MemberValidationError): string {
  const key = error.messageKey.replace('memberImport.', '')
  const messages = LABELS.MEMBER_IMPORT.MESSAGES as unknown as Record<string, (label: string) => string>
  const template = messages[key]
  return template ? template(error.label) : ''
}

function backendIssueMessage(issue: MemberImportPreviewIssue): string {
  const messages = LABELS.MEMBER_IMPORT.MESSAGES as unknown as Record<string, (label: string) => string>
  const key = issue.messageKey.replace('memberImport.', '')
  const template = messages[key]
  if (!template) return ''
  const label = issue.className ?? (issue.field === 'nisn' ? 'NISN' : issue.field === 'email' ? 'Email' : '')
  const suffix = issue.existingMemberName || issue.existingMemberNumber
    ? ` (${[issue.existingMemberName, issue.existingMemberNumber].filter(Boolean).join(' · ')})`
    : ''
  return template(label) + suffix
}

function keterangan(row: MemberPreviewRow): string {
  if (row.status === 'VALID') return LABELS.MEMBER_IMPORT.NOTE_VALID
  const parts: string[] = []
  for (const error of row.errors) {
    const message = errorMessage(error)
    if (message) parts.push(message)
  }
  if (row.duplicateNisnRows.length > 0) {
    parts.push(LABELS.MEMBER_IMPORT.NOTE_DUPLICATE_NISN(row.duplicateNisnRows.join(', ')))
  }
  if (row.duplicateEmailRows.length > 0) {
    parts.push(LABELS.MEMBER_IMPORT.NOTE_DUPLICATE_EMAIL(row.duplicateEmailRows.join(', ')))
  }
  for (const issue of row.issues) {
    const message = backendIssueMessage(issue)
    if (message) parts.push(message)
  }
  return parts.join('\n')
}

function resultIssueMessage(issue: MemberImportPreviewIssue): string {
  const message = backendIssueMessage(issue)
  if (!message) return ''
  return issue.rowNumber > 0
    ? `${LABELS.MEMBER_IMPORT.HEADER_BARIS} ${issue.rowNumber}: ${message}`
    : message
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

const STAGE_LABEL: Record<MemberImportStage, string> = {
  preparing: LABELS.MEMBER_IMPORT.PROGRESS_STAGES.preparing,
  'checking-duplicate': LABELS.MEMBER_IMPORT.PROGRESS_STAGES['checking-duplicate'],
  'resolving-class': LABELS.MEMBER_IMPORT.PROGRESS_STAGES['resolving-class'],
  'generating-number': LABELS.MEMBER_IMPORT.PROGRESS_STAGES['generating-number'],
  saving: LABELS.MEMBER_IMPORT.PROGRESS_STAGES.saving,
  completed: LABELS.MEMBER_IMPORT.PROGRESS_STAGES.completed,
}

export default function MemberImportDialog({ onClose }: MemberImportDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [parsedRows, setParsedRows] = useState<ParsedMemberRow[]>([])
  const [parsing, setParsing] = useState(false)
  const [previewChecking, setPreviewChecking] = useState(false)
  const [parseError, setParseError] = useState('')
  const [fileErrorCode, setFileErrorCode] = useState<ImportErrorCode | null>(null)
  const [previewError, setPreviewError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [downloadStatus, setDownloadStatus] = useState<'success' | 'error' | null>(null)
  const [previewResult, setPreviewResult] = useState<MemberPreviewResult | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<MemberImportResultDTO | null>(null)
  const [importSystemError, setImportSystemError] = useState('')
  const [progress, setProgress] = useState<MemberImportProgressEvent | null>(null)
  const [academicYears, setAcademicYears] = useState<AcademicYearDTO[]>([])
  const [curricula, setCurricula] = useState<CurriculumDTO[]>([])
  const [academicYearId, setAcademicYearId] = useState('')
  const [curriculumId, setCurriculumId] = useState('')
  const [scopeLoading, setScopeLoading] = useState(true)
  const [scopeLoadError, setScopeLoadError] = useState('')
  const [scopeHint, setScopeHint] = useState('')
  const unsubscribeRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([window.electronAPI.academicYears.findMany(), window.electronAPI.curricula.findMany()])
      .then(([yearsResult, curriculaResult]) => {
        if (cancelled) return
        setAcademicYears(yearsResult.data)
        setCurricula(curriculaResult.data)
        const activeYear = yearsResult.data.find((year) => year.isActive)
        setAcademicYearId(activeYear?.id ?? '')
      })
      .catch(() => {
        if (cancelled) return
        setScopeLoadError(LABELS.MEMBER_IMPORT.SCOPE_LOAD_ERROR)
      })
      .finally(() => {
        if (!cancelled) setScopeLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return () => {
      unsubscribeRef.current?.()
      unsubscribeRef.current = null
    }
  }, [])

  function subscribeProgress() {
    unsubscribeRef.current?.()
    unsubscribeRef.current = window.electronAPI.memberImport.onProgress((event) => {
      setProgress(event)
    })
  }

  function unsubscribeProgress() {
    unsubscribeRef.current?.()
    unsubscribeRef.current = null
  }

  async function runPreview(rows: ParsedMemberRow[], yearId: string, curriculumIdValue: string) {
    setPreviewChecking(true)
    setPreviewResult(null)
    setPreviewError('')
    setImportResult(null)
    setImportSystemError('')
    setProgress(null)
    try {
      const previewDto = await window.electronAPI.memberImport.previewCheck(toMemberImportRows(rows), {
        academicYearId: yearId,
        curriculumId: curriculumIdValue
      })
      setPreviewResult(memberPreviewService.buildPreview(rows, previewDto))
    } catch {
      setPreviewError(LABELS.MEMBER_IMPORT.PREVIEW_SYSTEM_ERROR)
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
      const rows = await memberExcelParserService.parse(next)
      setParsedRows(rows)
      if (academicYearId !== '' && curriculumId !== '') {
        await runPreview(rows, academicYearId, curriculumId)
      } else {
        setScopeHint(LABELS.MEMBER_IMPORT.REQUIRE_SCOPE)
      }
    } catch (error) {
      setParseError(error instanceof Error ? error.message : LABELS.MEMBER_IMPORT.PARSE_ERROR)
    } finally {
      setParsing(false)
    }
  }

  function handleAcademicYearChange(value: string) {
    setAcademicYearId(value)
    if (parsedRows.length > 0) {
      if (value !== '' && curriculumId !== '') {
        setScopeHint('')
        runPreview(parsedRows, value, curriculumId)
      } else {
        setScopeHint(LABELS.MEMBER_IMPORT.REQUIRE_SCOPE)
      }
    }
  }

  function handleCurriculumChange(value: string) {
    setCurriculumId(value)
    if (parsedRows.length > 0) {
      if (academicYearId !== '' && value !== '') {
        setScopeHint('')
        runPreview(parsedRows, academicYearId, value)
      } else {
        setScopeHint(LABELS.MEMBER_IMPORT.REQUIRE_SCOPE)
      }
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

  async function handleImport() {
    setImporting(true)
    setImportResult(null)
    setImportSystemError('')
    setProgress({ stage: 'preparing', current: 0, total: parsedRows.length })
    subscribeProgress()
    try {
      const result = await window.electronAPI.memberImport.import(toMemberImportRows(parsedRows), {
        academicYearId,
        curriculumId
      })
      if (result.success) {
        setProgress({ stage: 'completed', current: result.totalRows, total: result.totalRows })
      }
      setImportResult(result)
    } catch (error) {
      setImportSystemError(
        error instanceof Error && error.message !== ''
          ? error.message
          : LABELS.MEMBER_IMPORT.IMPORT_SYSTEM_ERROR
      )
    } finally {
      setImporting(false)
      unsubscribeProgress()
    }
  }

  function handleClose() {
    if (importing) return
    unsubscribeProgress()
    setFile(null)
    setParsedRows([])
    setPreviewResult(null)
    setImportResult(null)
    setImportSystemError('')
    setProgress(null)
    setParsing(false)
    setPreviewChecking(false)
    setParseError('')
    setPreviewError('')
    setFileErrorCode(null)
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
          <p className="text-sm text-slate-500">{LABELS.MEMBER_IMPORT.SUBTITLE}</p>

          <div>
            <h4 className="text-sm font-medium text-slate-700 mb-1">{LABELS.MEMBER_IMPORT.SCOPE_TITLE}</h4>
            <p className="text-sm text-slate-500 mb-4">{LABELS.MEMBER_IMPORT.SCOPE_DESC}</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {LABELS.MEMBER_IMPORT.YEAR} <span className="text-red-500">*</span>
                </label>
                <select
                  value={academicYearId}
                  onChange={(e) => handleAcademicYearChange(e.target.value)}
                  disabled={scopeLoading || importing}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">{LABELS.MEMBER_IMPORT.SELECT_YEAR}</option>
                  {academicYears.map((year) => (
                    <option key={year.id} value={year.id}>{year.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {LABELS.MEMBER_IMPORT.CURRICULUM} <span className="text-red-500">*</span>
                </label>
                <select
                  value={curriculumId}
                  onChange={(e) => handleCurriculumChange(e.target.value)}
                  disabled={scopeLoading || importing}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">{LABELS.MEMBER_IMPORT.SELECT_CURRICULUM}</option>
                  {curricula.map((curriculum) => (
                    <option key={curriculum.id} value={curriculum.id}>{curriculum.name}</option>
                  ))}
                </select>
              </div>
            </div>
            {scopeLoading && <p className="text-xs text-slate-500 mt-2">{LABELS.MEMBER_IMPORT.SCOPE_LOADING}</p>}
            {scopeLoadError && <p className="text-xs text-red-600 mt-2">{scopeLoadError}</p>}
            {scopeHint && <p className="text-xs text-amber-600 mt-2">{scopeHint}</p>}
          </div>

          <div>
            <h4 className="text-sm font-medium text-slate-700 mb-1">{LABELS.MEMBER_IMPORT.UPLOAD_STEP_TITLE}</h4>
            <p className="text-sm text-slate-500 mb-4">{LABELS.MEMBER_IMPORT.UPLOAD_STEP_DESC}</p>
            <div className="space-y-4">
              <div className={importing ? 'pointer-events-none opacity-60' : ''}>
                <FileUploadDropzone file={file} onFileChange={handleFileChange} />
              </div>
              {parsing && (
                <p className="text-xs text-slate-500">{LABELS.MEMBER_IMPORT.PARSING}</p>
              )}
              {fileErrorCode && (
                <p className="text-xs text-red-600">{getImportErrorMessage(fileErrorCode)}</p>
              )}
              {parseError && (
                <p className="text-xs text-red-600">{parseError}</p>
              )}
              <button
                type="button"
                onClick={handleDownloadTemplate}
                disabled={downloading || importing}
                className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

          {(previewResult || previewError) && (
            <div className="border-t border-slate-200 pt-5">
              <h4 className="text-sm font-medium text-slate-700 mb-3">{LABELS.MEMBER_IMPORT.PREVIEW_TITLE}</h4>

              {previewChecking && (
                <p className="text-xs text-slate-500 mb-3">{LABELS.MEMBER_IMPORT.PREVIEW_CHECKING}</p>
              )}

              {previewError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 mb-4">
                  <AlertTriangle size={16} className="text-red-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-red-700">{LABELS.MEMBER_IMPORT.STATUS_ERROR}</p>
                    <p className="text-xs text-red-600">{previewError}</p>
                  </div>
                </div>
              )}

              {previewResult && (
                <>
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
                            <td className="py-2 text-slate-600 whitespace-pre-line break-words">{keterangan(row)}</td>
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
                      disabled={!previewResult.canImport || previewError !== '' || importing || importResult?.success === true}
                      className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                      {LABELS.MEMBER_IMPORT.IMPORT_BUTTON}
                    </button>
                    {importing && <p className="text-xs text-slate-500">{LABELS.MEMBER_IMPORT.IMPORTING}</p>}
                  </div>

                  {progress && (
                    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-slate-700">{LABELS.MEMBER_IMPORT.PROGRESS_TITLE}</p>
                        <p className="text-xs text-slate-500 tabular-nums">
                          {STAGE_LABEL[progress.stage]} · {progress.current} / {progress.total}
                        </p>
                      </div>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-indigo-600 transition-all"
                          style={{
                            width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {importResult?.success && (
                    <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                      <p className="text-sm font-medium text-emerald-700">{LABELS.MEMBER_IMPORT.IMPORT_SUCCESS}</p>
                      <p className="text-xs text-emerald-600 mt-0.5">{LABELS.MEMBER_IMPORT.IMPORT_SUCCESS_DESC}</p>
                      <div className="mt-3 grid grid-cols-5 gap-3">
                        <div>
                          <p className="text-xs text-emerald-600">{LABELS.MEMBER_IMPORT.RESULT_TOTAL}</p>
                          <p className="text-lg font-semibold text-emerald-800 tabular-nums">{importResult.totalRows}</p>
                        </div>
                        <div>
                          <p className="text-xs text-emerald-600">{LABELS.MEMBER_IMPORT.RESULT_CREATED}</p>
                          <p className="text-lg font-semibold text-emerald-800 tabular-nums">{importResult.created}</p>
                        </div>
                        <div>
                          <p className="text-xs text-amber-600">{LABELS.MEMBER_IMPORT.RESULT_SKIPPED}</p>
                          <p className="text-lg font-semibold text-amber-700 tabular-nums">{importResult.skipped}</p>
                        </div>
                        <div>
                          <p className="text-xs text-red-600">{LABELS.MEMBER_IMPORT.RESULT_FAILED}</p>
                          <p className="text-lg font-semibold text-red-700 tabular-nums">{importResult.failed}</p>
                        </div>
                        <div>
                          <p className="text-xs text-amber-600">{LABELS.MEMBER_IMPORT.RESULT_WARNINGS}</p>
                          <p className="text-lg font-semibold text-amber-700 tabular-nums">{importResult.warnings}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {importResult && !importResult.success && (
                    <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                      <p className="text-sm font-medium text-red-700">{LABELS.MEMBER_IMPORT.IMPORT_FAILED}</p>
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
                        <p className="text-sm font-medium text-red-700">{LABELS.MEMBER_IMPORT.STATUS_ERROR}</p>
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
            {LABELS.MEMBER_IMPORT.CLOSE}
          </button>
        </div>
      </div>
    </div>
  )
}
