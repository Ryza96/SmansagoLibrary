import { useEffect, useRef, useState } from 'react'
import { DatabaseBackup, FolderOpen, Loader2, HardDriveDownload } from 'lucide-react'
import { LABELS } from '../../utils/labels'
import { useNotification } from '../../notification/NotificationContext'
import type { BackupUIProgressEvent, BackupUIStage, BackupUISummary, BackupTargetInfo } from '../../shared/dto/backup-ui'

const STAGE_LABEL: Record<BackupUIStage, string> = {
  validate: LABELS.BACKUP_RESTORE.STAGE_VALIDATE,
  collect: LABELS.BACKUP_RESTORE.STAGE_COLLECT,
  manifest: LABELS.BACKUP_RESTORE.STAGE_MANIFEST,
  compress: LABELS.BACKUP_RESTORE.STAGE_COMPRESS,
  verify: LABELS.BACKUP_RESTORE.STAGE_VERIFY,
  finalize: LABELS.BACKUP_RESTORE.STAGE_FINALIZE,
  complete: LABELS.BACKUP_RESTORE.STAGE_COMPLETE,
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} ${LABELS.BACKUP_RESTORE.SIZE_MB}`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} ${LABELS.BACKUP_RESTORE.SIZE_KB}`
  return `${bytes} ${LABELS.BACKUP_RESTORE.SIZE_BYTES}`
}

function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)} ${LABELS.BACKUP_RESTORE.DURATION_SECONDS}`
}

export default function BackupPage() {
  const { notify } = useNotification()
  const [targetInfo, setTargetInfo] = useState<BackupTargetInfo | null>(null)
  const [loadingInfo, setLoadingInfo] = useState(true)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<BackupUIProgressEvent | null>(null)
  const [summary, setSummary] = useState<BackupUISummary | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    let cancelled = false
    window.electronAPI.backupUI
      .getTargetInfo()
      .then((info) => {
        if (!cancelled) setTargetInfo(info)
      })
      .catch(() => {
        if (!cancelled) setTargetInfo(null)
      })
      .finally(() => {
        if (!cancelled) setLoadingInfo(false)
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
    unsubscribeRef.current = window.electronAPI.backupUI.onProgress((event) => {
      setProgress(event)
    })
  }

  function unsubscribeProgress() {
    unsubscribeRef.current?.()
    unsubscribeRef.current = null
  }

  async function handleOpenFolder() {
    const result = await window.electronAPI.backupUI.openFolder()
    if (result.ok === false) notify.error(result.message ?? LABELS.BACKUP_RESTORE.STORAGE_LOCATION_DESC)
  }

  async function handleRunBackup() {
    setRunning(true)
    setSummary(null)
    setProgress(null)
    subscribeProgress()
    try {
      const result = await window.electronAPI.backupUI.run()
      setSummary(result)
      if (result.status === 'SUCCESS') {
        notify.success(LABELS.BACKUP_RESTORE.BACKUP_SUCCESS)
      } else if (result.status === 'SUCCESS_WITH_WARNING') {
        notify.warning(LABELS.BACKUP_RESTORE.BACKUP_WARNING)
      } else if (result.status === 'CANCELLED') {
        notify.info(LABELS.BACKUP_RESTORE.BACKUP_CANCELLED)
      } else {
        const message = result.errors.length > 0 ? result.errors.join('\n') : LABELS.BACKUP_RESTORE.BACKUP_FAILED
        notify.error(message)
      }
    } catch (error) {
      notify.error(error instanceof Error && error.message !== '' ? error.message : LABELS.BACKUP_RESTORE.BACKUP_FAILED)
    } finally {
      setRunning(false)
      unsubscribeProgress()
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">{LABELS.BACKUP_RESTORE.BACKUP_TITLE}</h2>
        <p className="mt-1 text-sm text-slate-500">{LABELS.BACKUP_RESTORE.BACKUP_SUBTITLE}</p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-blue-50 p-2.5">
            <DatabaseBackup size={20} className="text-blue-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-slate-800">{LABELS.BACKUP_RESTORE.STORAGE_LOCATION}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{LABELS.BACKUP_RESTORE.STORAGE_LOCATION_DESC}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-slate-500">{LABELS.BACKUP_RESTORE.FIXED_DIR}</p>
            <p className="mt-1 break-all font-mono text-xs text-slate-700">{loadingInfo ? '…' : (targetInfo?.backupDir ?? '—')}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">{LABELS.BACKUP_RESTORE.SAMPLE_FILENAME}</p>
            <p className="mt-1 break-all font-mono text-xs text-slate-700">{loadingInfo ? '…' : (targetInfo?.sampleFilename ?? '—')}</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleRunBackup}
            disabled={running}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? <Loader2 size={16} className="animate-spin" /> : <HardDriveDownload size={16} />}
            {running ? LABELS.BACKUP_RESTORE.BACKUP_RUNNING : LABELS.BACKUP_RESTORE.START_BACKUP}
          </button>
          <button
            type="button"
            onClick={handleOpenFolder}
            disabled={running || targetInfo === null}
            className="flex items-center gap-1.5 px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FolderOpen size={16} />
            {LABELS.BACKUP_RESTORE.OPEN_FOLDER}
          </button>
        </div>
      </div>

      {progress && (
        <div className="rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-slate-700">{LABELS.BACKUP_RESTORE.PROGRESS}</p>
            <p className="text-xs text-slate-500 tabular-nums">
              {STAGE_LABEL[progress.stage]} · {progress.current} / {progress.total}
            </p>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-indigo-600 transition-all"
              style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {summary && (
        <div
          className={`rounded-lg border px-5 py-4 shadow-sm ${
            summary.status === 'SUCCESS'
              ? 'border-emerald-200 bg-emerald-50'
              : summary.status === 'SUCCESS_WITH_WARNING'
                ? 'border-amber-200 bg-amber-50'
                : 'border-red-200 bg-red-50'
          }`}
        >
          <p
            className={`text-sm font-medium ${
              summary.status === 'SUCCESS'
                ? 'text-emerald-700'
                : summary.status === 'SUCCESS_WITH_WARNING'
                  ? 'text-amber-700'
                  : 'text-red-700'
            }`}
          >
            {summary.status === 'SUCCESS'
              ? LABELS.BACKUP_RESTORE.BACKUP_SUCCESS
              : summary.status === 'SUCCESS_WITH_WARNING'
                ? LABELS.BACKUP_RESTORE.BACKUP_WARNING
                : LABELS.BACKUP_RESTORE.BACKUP_FAILED}
          </p>
          {summary.fileName !== null && summary.filePath !== null && (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs text-slate-500">{LABELS.BACKUP_RESTORE.RESULT_FILE}</p>
                <p className="mt-0.5 break-all font-mono text-xs text-slate-700">{summary.fileName}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">{LABELS.BACKUP_RESTORE.RESULT_SIZE}</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800 tabular-nums">{formatSize(summary.sizeBytes ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">{LABELS.BACKUP_RESTORE.RESULT_DIR}</p>
                <p className="mt-0.5 break-all font-mono text-xs text-slate-700">{summary.backupDir}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">{LABELS.BACKUP_RESTORE.RESULT_DURATION}</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800 tabular-nums">{formatDuration(summary.durationMs)}</p>
              </div>
            </div>
          )}
          {summary.warnings.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-amber-700">
              {summary.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          )}
          {summary.errors.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-red-600">
              {summary.errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
