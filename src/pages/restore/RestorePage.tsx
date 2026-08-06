import { useEffect, useRef, useState } from 'react'
import { FolderOpen, HardDriveUpload, Loader2, FileArchive, AlertTriangle } from 'lucide-react'
import { LABELS } from '../../utils/labels'
import { useNotification } from '../../notification/NotificationContext'
import type {
  BackupFileInfo,
  RestoreUIProgressEvent,
  RestoreUIStage,
  RestoreUIResult,
} from '../../shared/dto/backup-ui'

const STAGE_LABEL: Record<RestoreUIStage, string> = {
  validate: LABELS.BACKUP_RESTORE.RESTORE_STAGE_VALIDATE,
  extract: LABELS.BACKUP_RESTORE.RESTORE_STAGE_EXTRACT,
  verify: LABELS.BACKUP_RESTORE.RESTORE_STAGE_VERIFY,
  snapshot: LABELS.BACKUP_RESTORE.RESTORE_STAGE_SNAPSHOT,
  restore: LABELS.BACKUP_RESTORE.RESTORE_STAGE_RESTORE,
  'verify-after': LABELS.BACKUP_RESTORE.RESTORE_STAGE_VERIFY_AFTER,
  cleanup: LABELS.BACKUP_RESTORE.RESTORE_STAGE_CLEANUP,
  complete: LABELS.BACKUP_RESTORE.RESTORE_STAGE_COMPLETE,
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} ${LABELS.BACKUP_RESTORE.SIZE_MB}`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} ${LABELS.BACKUP_RESTORE.SIZE_KB}`
  return `${bytes} ${LABELS.BACKUP_RESTORE.SIZE_BYTES}`
}

function formatDate(value: string | null): string {
  if (value === null) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function RestorePage() {
  const { notify, confirm } = useNotification()
  const [fileInfo, setFileInfo] = useState<BackupFileInfo | null>(null)
  const [loadingFile, setLoadingFile] = useState(false)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<RestoreUIProgressEvent | null>(null)
  const [result, setResult] = useState<RestoreUIResult | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => {
      unsubscribeRef.current?.()
      unsubscribeRef.current = null
    }
  }, [])

  function subscribeProgress() {
    unsubscribeRef.current?.()
    unsubscribeRef.current = window.electronAPI.restoreUI.onProgress((event) => {
      setProgress(event)
    })
  }

  function unsubscribeProgress() {
    unsubscribeRef.current?.()
    unsubscribeRef.current = null
  }

  async function handlePickBackup() {
    setLoadingFile(true)
    setFileInfo(null)
    setResult(null)
    setProgress(null)
    try {
      const picked = await window.electronAPI.restoreUI.pickBackup()
      if (picked.canceled || picked.filePath === undefined) return
      const info = await window.electronAPI.restoreUI.inspect(picked.filePath)
      setFileInfo(info)
      if (info.ok === false) {
        notify.error(info.errors.length > 0 ? info.errors.join('\n') : LABELS.BACKUP_RESTORE.INVALID_FILE)
      }
    } catch (error) {
      notify.error(error instanceof Error && error.message !== '' ? error.message : LABELS.BACKUP_RESTORE.INVALID_FILE)
    } finally {
      setLoadingFile(false)
    }
  }

  async function handleRestore() {
    if (fileInfo === null || fileInfo.ok === false || fileInfo.filePath === '') return
    const confirmed = await confirm({
      title: LABELS.BACKUP_RESTORE.RESTORE_CONFIRM_TITLE,
      message: LABELS.BACKUP_RESTORE.RESTORE_CONFIRM_MESSAGE,
      confirmLabel: LABELS.BACKUP_RESTORE.RESTORE_CONFIRM_OK,
      cancelLabel: LABELS.BACKUP_RESTORE.RESTORE_CANCEL,
      danger: true,
    })
    if (!confirmed) return
    setRunning(true)
    setResult(null)
    setProgress(null)
    subscribeProgress()
    try {
      const restoreResult = await window.electronAPI.restoreUI.run(fileInfo.filePath)
      setResult(restoreResult)
      if (restoreResult.status === 'SUCCESS') {
        if (restoreResult.needsRestart) {
          notify.success(LABELS.BACKUP_RESTORE.RESTORE_NEEDS_RESTART)
        } else {
          notify.success(LABELS.BACKUP_RESTORE.RESTORE_SUCCESS)
        }
      } else if (restoreResult.status === 'CANCELLED') {
        notify.info(LABELS.BACKUP_RESTORE.RESTORE_CANCELLED)
      } else {
        const message = restoreResult.errors.length > 0 ? restoreResult.errors.join('\n') : LABELS.BACKUP_RESTORE.RESTORE_FAILED
        notify.error(message)
      }
    } catch (error) {
      notify.error(error instanceof Error && error.message !== '' ? error.message : LABELS.BACKUP_RESTORE.RESTORE_FAILED)
    } finally {
      setRunning(false)
      unsubscribeProgress()
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">{LABELS.BACKUP_RESTORE.RESTORE_TITLE}</h2>
        <p className="mt-1 text-sm text-slate-500">{LABELS.BACKUP_RESTORE.RESTORE_SUBTITLE}</p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-indigo-50 p-2.5">
            <HardDriveUpload size={20} className="text-indigo-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-slate-800">{LABELS.BACKUP_RESTORE.PICK_BACKUP}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{LABELS.BACKUP_RESTORE.PICK_BACKUP_DESC}</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handlePickBackup}
            disabled={running}
            className="flex items-center gap-1.5 px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loadingFile ? <Loader2 size={16} className="animate-spin" /> : <FolderOpen size={16} />}
            {loadingFile ? LABELS.BACKUP_RESTORE.LOADING_FILE : LABELS.BACKUP_RESTORE.PICK_BACKUP}
          </button>
        </div>

        {fileInfo && fileInfo.ok && (
          <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2">
              <FileArchive size={16} className="text-slate-500" />
              <p className="text-sm font-semibold text-slate-800">{LABELS.BACKUP_RESTORE.FILE_INFO}</p>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs text-slate-500">{LABELS.BACKUP_RESTORE.FILE_NAME}</p>
                <p className="mt-0.5 break-all font-mono text-xs text-slate-700">{fileInfo.fileName}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">{LABELS.BACKUP_RESTORE.FILE_SIZE}</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800 tabular-nums">{formatSize(fileInfo.sizeBytes)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">{LABELS.BACKUP_RESTORE.BACKUP_DATE}</p>
                <p className="mt-0.5 text-sm text-slate-800">{formatDate(fileInfo.backupDate)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">{LABELS.BACKUP_RESTORE.APP_VERSION}</p>
                <p className="mt-0.5 text-sm text-slate-800">{fileInfo.appVersion !== '' ? fileInfo.appVersion : '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">{LABELS.BACKUP_RESTORE.SCHEMA_VERSION}</p>
                <p className="mt-0.5 text-sm text-slate-800">{fileInfo.schemaVersion !== '' ? fileInfo.schemaVersion : '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">{LABELS.BACKUP_RESTORE.BACKUP_VERSION}</p>
                <p className="mt-0.5 text-sm text-slate-800 tabular-nums">{fileInfo.backupVersion > 0 ? fileInfo.backupVersion : '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">{LABELS.BACKUP_RESTORE.BOOK_COUNT}</p>
                <p className="mt-0.5 text-sm text-slate-800 tabular-nums">{fileInfo.bookCount ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">{LABELS.BACKUP_RESTORE.MEMBER_COUNT}</p>
                <p className="mt-0.5 text-sm text-slate-800 tabular-nums">{fileInfo.memberCount ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">{LABELS.BACKUP_RESTORE.COPY_COUNT}</p>
                <p className="mt-0.5 text-sm text-slate-800 tabular-nums">{fileInfo.copyCount ?? '—'}</p>
              </div>
            </div>
            {fileInfo.warnings.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-amber-700">
                {fileInfo.warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            )}

            <div className="mt-5 flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-600" />
              <p className="text-xs text-amber-700">{LABELS.BACKUP_RESTORE.RESTORE_CONFIRM_MESSAGE}</p>
            </div>
            <button
              type="button"
              onClick={handleRestore}
              disabled={running}
              className="mt-4 flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {running ? <Loader2 size={16} className="animate-spin" /> : <HardDriveUpload size={16} />}
              {running ? LABELS.BACKUP_RESTORE.RESTORE_RUNNING : LABELS.BACKUP_RESTORE.RESTORE_BUTTON}
            </button>
          </div>
        )}

        {fileInfo && fileInfo.ok === false && (
          <div className="mt-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <AlertTriangle size={16} className="text-red-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-700">{LABELS.BACKUP_RESTORE.INVALID_FILE}</p>
              <p className="mt-0.5 break-all text-xs text-red-600">{fileInfo.filePath}</p>
            </div>
          </div>
        )}
      </div>

      {progress && (
        <div className="rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-slate-700">{LABELS.BACKUP_RESTORE.RESTORE_PROGRESS}</p>
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

      {result && result.status === 'SUCCESS' && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-4 shadow-sm">
          <p className="text-sm font-medium text-emerald-700">
            {result.needsRestart ? LABELS.BACKUP_RESTORE.RESTORE_NEEDS_RESTART : LABELS.BACKUP_RESTORE.RESTORE_SUCCESS}
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs text-slate-500">{LABELS.BACKUP_RESTORE.SCHEMA_VERSION}</p>
              <p className="mt-0.5 text-sm text-slate-800">
                {result.schemaVersionBefore ?? '—'} → {result.schemaVersionRestored ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">{LABELS.BACKUP_RESTORE.RESULT_DURATION}</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-800 tabular-nums">{formatDurationMs(result.durationMs)}</p>
            </div>
          </div>
          {result.warnings.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-amber-700">
              {result.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {result && result.status !== 'SUCCESS' && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 shadow-sm">
          <p className="text-sm font-medium text-red-700">
            {result.status === 'CANCELLED' ? LABELS.BACKUP_RESTORE.RESTORE_CANCELLED : LABELS.BACKUP_RESTORE.RESTORE_FAILED}
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-red-600">
              {result.errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function formatDurationMs(ms: number): string {
  return `${(ms / 1000).toFixed(1)} ${LABELS.BACKUP_RESTORE.DURATION_SECONDS}`
}
