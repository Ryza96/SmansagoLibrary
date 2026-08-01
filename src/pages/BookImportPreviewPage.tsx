import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, CheckCircle2, FileSpreadsheet, FileUp, Hourglass, XCircle } from 'lucide-react'
import { LABELS } from '../utils/labels'
import { ROUTES } from '../utils/navigation'
import { getImportErrorMessage, getImportResultMessage, computeImportResultSummary, getValidationIssueMessage } from '../utils/bookImport'
import { useBookImport } from '../contexts/BookImportContext'
import type { ImportCellValue, MatchedWorkbook, RowResult, ValidationIssue } from '../types/import'
import { getColumnCount } from '../types/import'

const PREVIEW_ROW_LIMIT = 50
const ROW_RESULT_LIMIT = 20

function columnLabel(index: number): string {
  let label = ''
  let n = index
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26) - 1
  }
  return label
}

function formatCellValue(value: ImportCellValue): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toLocaleDateString()
  return String(value)
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-800">{value}</p>
    </div>
  )
}

function ImportResultSummary({ result }: { result: MatchedWorkbook }) {
  const errors = result.matchingResult.errors
  const { booksCreated, copiesCreated, failedRows: failedCount } = computeImportResultSummary(result)

  return (
    <div
      className={`rounded-lg border p-4 mb-4 ${
        failedCount === 0 ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        {failedCount === 0 ? (
          <CheckCircle2 size={18} className="text-emerald-600" />
        ) : (
          <AlertTriangle size={18} className="text-amber-500" />
        )}
        <p className={`text-sm font-semibold ${failedCount === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
          {LABELS.IMPORT.RESULT_TITLE}
        </p>
      </div>

      {failedCount === 0 ? (
        <p className="text-sm text-emerald-600 mb-4">{LABELS.IMPORT.RESULT_ALL_OK}</p>
      ) : (
        <ul className="mb-4 space-y-1">
          {errors.map((error, i) => (
            <li key={i} className="text-sm">
              <span className="font-medium text-slate-700">
                {LABELS.IMPORT.VALIDATION_ROW} {error.rowNumber ?? '-'}
              </span>
              <span className="text-slate-600">: {getImportResultMessage(error.messageKey)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Stat label={LABELS.IMPORT.RESULT_BOOKS_CREATED} value={String(booksCreated)} />
        <Stat label={LABELS.IMPORT.RESULT_COPIES_CREATED} value={String(copiesCreated)} />
        <Stat label={LABELS.IMPORT.RESULT_FAILED_ROWS} value={String(failedCount)} />
      </div>
    </div>
  )
}

function ValidationIssueRow({ issue }: { issue: ValidationIssue }) {
  const { metadata } = issue
  const location =
    [
      issue.row !== null ? `${LABELS.IMPORT.VALIDATION_ROW} ${issue.row}` : null,
      issue.column !== null ? `${LABELS.IMPORT.VALIDATION_COLUMN} ${issue.column}` : null,
    ]
      .filter((part) => part !== null)
      .join(' · ') ?? LABELS.IMPORT.VALIDATION_WHOLE_WORKBOOK

  let detail: string | null = null
  if (metadata.actualHeader !== null) {
    detail = `${LABELS.IMPORT.VALIDATION_EXPECTED}: "${metadata.expectedHeader ?? '-'}" · ${LABELS.IMPORT.VALIDATION_FOUND}: "${metadata.actualHeader}"`
  } else if (metadata.expectedType !== null) {
    detail = `${LABELS.IMPORT.VALIDATION_EXPECTED}: ${metadata.expectedType} · ${LABELS.IMPORT.VALIDATION_FOUND}: ${metadata.actualType ?? '-'}`
  } else if (metadata.expectedHeader !== null) {
    detail = `${LABELS.IMPORT.VALIDATION_EXPECTED}: "${metadata.expectedHeader}"`
  } else if (metadata.expectedColumn !== null && metadata.actualColumn !== null) {
    detail = `${LABELS.IMPORT.VALIDATION_EXPECTED}: ${metadata.expectedColumn} · ${LABELS.IMPORT.VALIDATION_FOUND}: ${metadata.actualColumn}`
  }

  return (
    <li className="flex items-start gap-2 text-sm">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
      <span>
        <span className="font-medium text-slate-700">{getValidationIssueMessage(issue.messageKey)}</span>
        <span className="text-slate-400"> — {location}</span>
        <span className="text-slate-300"> · {issue.code}</span>
        {detail && (
          <span className="block text-slate-500">
            {detail}
          </span>
        )}
      </span>
    </li>
  )
}

function ValidationSummary({
  title,
  badge,
  issues,
  emptyMessage,
}: {
  title: string
  badge: 'valid' | 'invalid'
  issues: ValidationIssue[]
  emptyMessage: string
}) {
  return (
    <div
      className={`rounded-lg border p-4 mb-6 ${
        badge === 'valid' ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        {badge === 'valid' ? (
          <CheckCircle2 size={18} className="text-emerald-600" />
        ) : (
          <XCircle size={18} className="text-red-600" />
        )}
        <p
          className={`text-sm font-semibold ${
            badge === 'valid' ? 'text-emerald-700' : 'text-red-700'
          }`}
        >
          {title}
        </p>
      </div>
      {issues.length === 0 ? (
        <p className={`text-sm ${badge === 'valid' ? 'text-emerald-600' : 'text-red-600'}`}>
          {emptyMessage}
        </p>
      ) : (
        <ul className="space-y-1">{issues.map((issue, i) => <ValidationIssueRow key={i} issue={issue} />)}</ul>
      )}
    </div>
  )
}

function RowResultsSummary({ rows }: { rows: RowResult[] }) {
  const invalidRows = rows.filter((row) => !row.valid)
  const valid = invalidRows.length === 0
  return (
    <div
      className={`rounded-lg border p-4 mb-6 ${
        valid ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        {valid ? (
          <CheckCircle2 size={18} className="text-emerald-600" />
        ) : (
          <AlertTriangle size={18} className="text-amber-500" />
        )}
        <p className={`text-sm font-semibold ${valid ? 'text-emerald-700' : 'text-amber-700'}`}>
          {LABELS.IMPORT.VALIDATION_ROW_TITLE}
        </p>
      </div>
      {valid ? (
        <p className="text-sm text-emerald-600">{LABELS.IMPORT.VALIDATION_ROW_OK}</p>
      ) : (
        <>
          <p className="text-sm text-amber-700">
            {LABELS.IMPORT.VALIDATION_ROW_SUMMARY(invalidRows.length, rows.length)}
          </p>
          <ul className="mt-2 space-y-1">
            {invalidRows.slice(0, ROW_RESULT_LIMIT).map((row) => (
              <li key={row.rowNumber} className="text-sm">
                <span className="font-medium text-slate-700">
                  {LABELS.IMPORT.VALIDATION_ROW} {row.rowNumber}
                </span>
                {row.issues.map((issue, j) => (
                  <span key={j} className="text-slate-600">
                    {j === 0 ? ': ' : ' · '}
                    {LABELS.IMPORT.VALIDATION_COLUMN} {issue.column ?? '-'} — {getValidationIssueMessage(issue.messageKey)}
                  </span>
                ))}
              </li>
            ))}
          </ul>
          {invalidRows.length > ROW_RESULT_LIMIT && (
            <p className="mt-2 text-xs text-slate-500">
              {LABELS.IMPORT.VALIDATION_ROW_MORE(invalidRows.length - ROW_RESULT_LIMIT)}
            </p>
          )}
        </>
      )}
    </div>
  )
}

export default function BookImportPreviewPage() {
  const navigate = useNavigate()
  const { file, validatedWorkbook, errorCode, parsing } = useBookImport()
  const [committing, setCommitting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState(false)
  const [importResult, setImportResult] = useState<MatchedWorkbook | null>(null)

  useEffect(() => {
    if (!file || (!parsing && !validatedWorkbook && !errorCode)) {
      navigate(ROUTES.BOOK_IMPORT, { replace: true })
    }
  }, [file, parsing, validatedWorkbook, errorCode, navigate])

  async function handleCommit() {
    if (!validatedWorkbook || committing) return
    setCommitting(true)
    setImportError(null)
    try {
      const result = await window.electronAPI.imports.match(validatedWorkbook.canonicalRows)
      setImportResult(result)
      setImportSuccess(true)
    } catch {
      setImportError(LABELS.IMPORT.IMPORT_ERROR)
    } finally {
      setCommitting(false)
    }
  }

  const errorMessage = errorCode ? getImportErrorMessage(errorCode) : null
  const targetSheet = validatedWorkbook ? validatedWorkbook.rawWorkbook.sheets[0] : null
  const validationResult = validatedWorkbook ? validatedWorkbook.validationResult : null
  const rowCount = targetSheet ? targetSheet.rows.length : 0
  const columnCount = targetSheet ? getColumnCount(targetSheet.rows) : 0
  const previewRows = targetSheet ? targetSheet.rows.slice(0, PREVIEW_ROW_LIMIT) : []

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 rounded hover:bg-slate-200 transition-colors text-slate-500"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-slate-800">{LABELS.IMPORT.PREVIEW_TITLE}</h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        {!file ? (
          <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
            <FileSpreadsheet size={48} className="text-slate-300" />
            <p className="mt-2 text-sm text-slate-500">{LABELS.IMPORT.PREVIEW_EMPTY}</p>
            <button
              onClick={() => navigate(ROUTES.BOOK_IMPORT)}
              className="mt-4 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              {LABELS.IMPORT.BACK}
            </button>
          </div>
        ) : parsing ? (
          <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
            <Hourglass size={48} className="text-slate-300 animate-pulse" />
            <p className="mt-2 text-sm text-slate-500">{LABELS.IMPORT.PREVIEW_LOADING}</p>
          </div>
        ) : errorMessage ? (
          <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
            <p className="text-sm font-medium text-red-600">{errorMessage}</p>
            <button
              onClick={() => navigate(ROUTES.BOOK_IMPORT)}
              className="mt-4 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              {LABELS.IMPORT.BACK}
            </button>
          </div>
        ) : validatedWorkbook ? (
          <>
            <div className="flex items-center gap-2 mb-6">
              <FileSpreadsheet size={18} className="text-emerald-600" />
              <p className="text-sm font-medium text-slate-700">
                {LABELS.IMPORT.PREVIEW_FILE} {file.name}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-6">
              <Stat label={LABELS.IMPORT.PREVIEW_SHEET_NAME} value={targetSheet ? targetSheet.name : '-'} />
              <Stat label={LABELS.IMPORT.PREVIEW_ROW_COUNT} value={String(rowCount)} />
              <Stat label={LABELS.IMPORT.PREVIEW_COLUMN_COUNT} value={String(columnCount)} />
            </div>

            {validatedWorkbook.normalizedHeaders.length > 0 && (
              <p className="text-xs text-slate-500 mb-6">
                {LABELS.IMPORT.VALIDATION_NORMALIZED_HEADERS}: {validatedWorkbook.normalizedHeaders.join(' · ')}
              </p>
            )}

            {validationResult ? (
              <>
                <ValidationSummary
                  title={
                    validationResult.valid
                      ? LABELS.IMPORT.VALIDATION_VALID
                      : LABELS.IMPORT.VALIDATION_INVALID
                  }
                  badge={validationResult.valid ? 'valid' : 'invalid'}
                  issues={validationResult.errors}
                  emptyMessage={LABELS.IMPORT.VALIDATION_EMPTY}
                />
                {validationResult.warnings.length > 0 && (
                  <ValidationSummary
                    title={LABELS.IMPORT.VALIDATION_WARNINGS}
                    badge="valid"
                    issues={validationResult.warnings}
                    emptyMessage={LABELS.IMPORT.VALIDATION_EMPTY}
                  />
                )}
              </>
            ) : null}

            {validatedWorkbook.rowResults.length > 0 && (
              <RowResultsSummary rows={validatedWorkbook.rowResults} />
            )}

            <h2 className="text-sm font-semibold text-slate-700 mb-3">
              {LABELS.IMPORT.PREVIEW_TABLE}
            </h2>
            {previewRows.length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">
                {LABELS.PLACEHOLDER.NO_DATA}
              </p>
            ) : (
              <>
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 text-left">
                        <th className="px-3 py-2 font-medium sticky left-0 bg-slate-50">
                          {LABELS.IMPORT.PREVIEW_ROW_NUMBER}
                        </th>
                        {Array.from({ length: columnCount }, (_, c) => (
                          <th key={c} className="px-3 py-2 font-medium">
                            {columnLabel(c)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, i) => (
                        <tr key={i} className="border-b border-slate-100">
                          <td className="px-3 py-2 text-slate-400 sticky left-0 bg-white">
                            {i + 1}
                          </td>
                          {Array.from({ length: columnCount }, (_, c) => (
                            <td key={c} className="px-3 py-2 text-slate-700 max-w-xs truncate">
                              {formatCellValue(row[c])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {previewRows.length < rowCount && (
                  <p className="mt-3 text-xs text-slate-400">
                    {LABELS.IMPORT.PREVIEW_SHOWING_ROWS(previewRows.length, rowCount)}
                  </p>
                )}
              </>
            )}

            <div className="mt-6 pt-6 border-t border-slate-200">
              {importError && (
                <p className="flex items-center gap-1.5 text-sm text-red-600 mb-3">
                  <XCircle size={16} />
                  {importError}
                </p>
              )}

              {!importSuccess && (
                <p className="text-xs text-slate-400 mb-3">{LABELS.IMPORT.COMMIT_HINT}</p>
              )}

              {importSuccess && importResult && (
                <div className="mb-4">
                  <ImportResultSummary result={importResult} />
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigate(ROUTES.BOOKS)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  {importSuccess ? LABELS.IMPORT.BACK_TO_BOOKS : LABELS.IMPORT.BACK}
                </button>
                <div className="flex-1" />
                {!importSuccess && (
                  <button
                    onClick={handleCommit}
                    disabled={committing}
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {committing ? (
                      <Hourglass size={16} className="animate-pulse" />
                    ) : (
                      <FileUp size={16} />
                    )}
                    {committing ? LABELS.IMPORT.IMPORT_PROCESSING : LABELS.IMPORT.IMPORT_ACTION}
                  </button>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
