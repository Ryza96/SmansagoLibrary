import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  Save,
  Loader2,
  Library,
  Database,
  ShieldCheck,
  Info,
  Sparkles,
  ImagePlus,
  DatabaseBackup,
  Undo2,
  RotateCcw,
  KeyRound,
  Lock,
} from 'lucide-react'
import { LABELS } from '../utils/labels'
import { APP } from '../utils/app'
import { ROUTES } from '../utils/navigation'
import { useNotification } from '../notification/NotificationContext'
import type { PrinterInfoDTO } from '../shared/dto/print'
import type { AppDatabaseInfoDTO } from '../shared/dto/app-info'
import { BARCODE_FORMATS, normalizeBarcodeFormat } from '../shared/config/barcode-format'
import { formatFileSize } from '../utils/bookImport'

type TabKey = 'identity' | 'data' | 'security' | 'appInfo' | 'about'

interface IdentityForm {
  libraryName: string
  schoolName: string
  librarianName: string
  borrowCardPrinter: string
  barcodeFormat: string
  inventoryPrefix: string
}

interface LogoPreview {
  filePath: string
  sizeBytes: number
  previewUri: string
}

const api = window.electronAPI

const TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: 'identity', label: LABELS.SETTINGS.TAB_IDENTITY, icon: Library },
  { key: 'data', label: LABELS.SETTINGS.TAB_DATA, icon: Database },
  { key: 'security', label: LABELS.SETTINGS.TAB_SECURITY, icon: ShieldCheck },
  { key: 'appInfo', label: LABELS.SETTINGS.TAB_APP_INFO, icon: Info },
  { key: 'about', label: LABELS.SETTINGS.TAB_ABOUT, icon: Sparkles },
]

export default function SettingsPage() {
  const { notify, confirm } = useNotification()
  const navigate = useNavigate()
  const [form, setForm] = useState<IdentityForm | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('identity')
  const [appInfo, setAppInfo] = useState<{ version: string; name: string } | null>(null)
  const [dbInfo, setDbInfo] = useState<AppDatabaseInfoDTO | null>(null)
  const [backupDir, setBackupDir] = useState<string | null>(null)
  const [logoPreview, setLogoPreview] = useState<LogoPreview | null>(null)
  const [logoPicking, setLogoPicking] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [printers, setPrinters] = useState<PrinterInfoDTO[]>([])
  const [printersLoading, setPrintersLoading] = useState(true)

  function loadPrinters() {
    api.settings.listPrinters()
      .then((list) => setPrinters(list))
      .catch(() => setPrinters([]))
      .finally(() => setPrintersLoading(false))
  }

  useEffect(() => {
    let cancelled = false
    api.settings.get()
      .then((data) => {
        if (cancelled) return
        setForm({
          libraryName: data.libraryName,
          schoolName: data.schoolName,
          librarianName: data.librarianName,
          borrowCardPrinter: data.borrowCardPrinter ?? '',
          barcodeFormat: normalizeBarcodeFormat(data.barcodeFormat),
          inventoryPrefix: data.inventoryPrefix ?? 'INV',
        })
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : LABELS.SETTINGS.VALIDATION_LOADING)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    api.app.info()
      .then((info) => {
        if (!cancelled) setAppInfo({ version: info.version, name: info.name })
      })
      .catch(() => {})
    api.backupUI.getTargetInfo()
      .then((info) => {
        if (!cancelled) setBackupDir(info.backupDir)
      })
      .catch(() => {})
    api.app.dbInfo()
      .then((info) => {
        if (!cancelled) setDbInfo(info)
      })
      .catch(() => {})
    loadPrinters()
    return () => {
      cancelled = true
    }
  }, [])

  function set<K extends keyof IdentityForm>(key: K, value: IdentityForm[K]) {
    if (!form) return
    setForm({ ...form, [key]: value })
  }

  async function handleSave() {
    if (!form) return
    if (!form.libraryName.trim()) {
      notify.error(LABELS.SETTINGS.VALIDATION_LIBRARY_NAME)
      return
    }
    const inventoryPrefixRaw = form.inventoryPrefix.trim().toUpperCase()
    if (!/^[A-Z0-9]{1,10}$/.test(inventoryPrefixRaw)) {
      notify.error(LABELS.SETTINGS.VALIDATION_INVENTORY_PREFIX)
      return
    }

    setSaving(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = { ...form, inventoryPrefix: inventoryPrefixRaw }
      if (logoPreview?.filePath) {
        payload.logoUpload = logoPreview.filePath
      }
      const result = await api.settings.update(payload)
      setForm({
        libraryName: result.libraryName,
        schoolName: result.schoolName,
        librarianName: result.librarianName,
        borrowCardPrinter: result.borrowCardPrinter ?? '',
        barcodeFormat: normalizeBarcodeFormat(result.barcodeFormat),
        inventoryPrefix: result.inventoryPrefix ?? 'INV',
      })
      setLogoPreview(null)
      notify.success(LABELS.SETTINGS.SAVED)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : LABELS.SETTINGS.VALIDATION_LOADING)
    } finally {
      setSaving(false)
    }
  }

  function handleComingSoon() {
    notify.info(LABELS.SETTINGS.COMING_SOON_HINT)
  }

  async function handleResetDatabase() {
    const confirmed = await confirm({
      title: LABELS.SETTINGS.RESET_CONFIRM_TITLE,
      message: LABELS.SETTINGS.RESET_CONFIRM_MESSAGE,
      confirmLabel: LABELS.SETTINGS.RESET_CONFIRM_OK,
      cancelLabel: LABELS.SETTINGS.RESET_CONFIRM_CANCEL,
      danger: true,
    })
    if (!confirmed) return
    setResetting(true)
    try {
      await api.settings.resetDatabase()
      notify.success(LABELS.SETTINGS.RESET_SUCCESS)
    } catch (err: unknown) {
      notify.error(err instanceof Error && err.message !== '' ? err.message : LABELS.SETTINGS.RESET_ERROR)
    } finally {
      setResetting(false)
    }
  }

  async function handlePickLogo() {
    setLogoPicking(true)
    try {
      const result = await api.settings.pickLogo()
      if (!result.canceled) {
        setLogoPreview({
          filePath: result.filePath,
          sizeBytes: result.sizeBytes,
          previewUri: result.previewUri,
        })
      }
    } catch (err: unknown) {
      notify.error(err instanceof Error ? err.message : LABELS.SETTINGS.VALIDATION_LOADING)
    } finally {
      setLogoPicking(false)
    }
  }

  if (loading) {
    return <p className="text-slate-400 text-sm text-center py-8">{LABELS.SETTINGS.LOADING}</p>
  }

  if (error && !form) {
    return (
      <div className="text-sm text-center py-8">
        <p className="text-red-500 mb-2">{error}</p>
        <button onClick={() => window.location.reload()} className="text-blue-600 hover:text-blue-800 text-xs font-medium">
          Coba lagi
        </button>
      </div>
    )
  }

  if (!form) return null
  const f = form

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">{LABELS.SETTINGS.TITLE}</h1>
        <p className="text-sm text-slate-500 mt-1">{LABELS.SETTINGS.SUBTITLE}</p>
      </div>

      <div className="flex flex-col md:flex-row gap-6 items-start">
        <nav className="md:w-48 shrink-0 space-y-1">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === key
                  ? 'bg-white border border-slate-200 shadow-sm text-blue-700'
                  : 'text-slate-600 hover:bg-white/70 border border-transparent'
              }`}
            >
              <Icon size={18} className={tab === key ? 'text-blue-600' : 'text-slate-400'} />
              {label}
            </button>
          ))}
        </nav>

        <div className="flex-1 min-w-0">
          {tab === 'identity' && renderIdentity()}
          {tab === 'data' && renderData()}
          {tab === 'security' && renderSecurity()}
          {tab === 'appInfo' && renderAppInfo()}
          {tab === 'about' && renderAbout()}
        </div>
      </div>
    </div>
  )

  function renderIdentity() {
    return (
      <Card title={LABELS.SETTINGS.TAB_IDENTITY} subtitle={LABELS.SETTINGS.IDENTITY_SUBTITLE}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
          <Field label={LABELS.SETTINGS.FIELD_LIBRARY_NAME} required>
            <input
              type="text"
              value={f.libraryName}
              onChange={(e) => set('libraryName', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Field>
          <Field label={LABELS.SETTINGS.FIELD_SCHOOL_NAME}>
            <input
              type="text"
              value={f.schoolName}
              onChange={(e) => set('schoolName', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label={LABELS.SETTINGS.FIELD_LOGO}>
              <div className="flex items-center gap-4">
                <div className="w-24 h-24 shrink-0 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden">
                  {logoPreview ? (
                    <img
                      src={logoPreview.previewUri}
                      alt={LABELS.SETTINGS.FIELD_LOGO}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="flex items-center justify-center px-2">
                      <ImagePlus size={22} className="text-slate-300" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  {logoPreview && (
                    <>
                      <p className="text-sm font-semibold text-slate-700 truncate">
                        {logoPreview.filePath.split(/[/\\]+/).filter(Boolean).pop() || logoPreview.filePath}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {logoPreview.sizeBytes < 1024
                          ? `${Math.round(logoPreview.sizeBytes)} B`
                          : `${(Math.round((logoPreview.sizeBytes / 1024) * 10) / 10).toFixed(1)} KB`}
                      </p>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={handlePickLogo}
                    disabled={logoPicking}
                    className="mt-2 inline-flex items-center gap-2 border border-slate-300 rounded-lg px-4 py-2 bg-white hover:bg-slate-50 hover:border-slate-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {logoPicking ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <ImagePlus size={16} className="text-slate-500" />
                    )}
                    <span className="text-sm font-semibold text-slate-700">{LABELS.SETTINGS.LOGO_PICK}</span>
                  </button>
                </div>
              </div>
            </Field>
          </div>
          <Field label={LABELS.SETTINGS.FIELD_LIBRARIAN_NAME}>
            <input
              type="text"
              value={f.librarianName}
              onChange={(e) => set('librarianName', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label={LABELS.SETTINGS.FIELD_PRINTER}>
              <p className="text-xs text-slate-400 mb-1">{LABELS.SETTINGS.PRINTER_SUBTITLE}</p>
              <div className="flex items-center gap-2">
                <select
                  value={f.borrowCardPrinter}
                  onChange={(e) => set('borrowCardPrinter', e.target.value)}
                  disabled={printersLoading}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  <option value="">{LABELS.SETTINGS.PRINTER_AUTO}</option>
                  {printersLoading ? (
                    <option value="" disabled>{LABELS.SETTINGS.PRINTER_LOADING}</option>
                  ) : printers.length === 0 ? (
                    <option value="" disabled>{LABELS.SETTINGS.PRINTER_NONE}</option>
                  ) : (
                    printers.map((printer) => (
                      <option key={printer.name} value={printer.name}>
                        {printer.displayName || printer.name}
                        {printer.isDefault ? ' (default)' : ''}
                      </option>
                    ))
                  )}
                </select>
                <button
                  type="button"
                  onClick={() => { setPrintersLoading(true); loadPrinters() }}
                  className="shrink-0 px-3 py-2 border border-slate-300 rounded-lg bg-white text-sm text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition-colors"
                >
                  {LABELS.SETTINGS.PRINTER_REFRESH}
                </button>
              </div>
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label={LABELS.SETTINGS.FIELD_BARCODE_FORMAT}>
              <p className="text-xs text-slate-400 mb-1">{LABELS.SETTINGS.BARCODE_FORMAT_SUBTITLE}</p>
              <select
                value={f.barcodeFormat}
                onChange={(e) => set('barcodeFormat', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Object.values(BARCODE_FORMATS).map((format) => (
                  <option key={format.code} value={format.code}>
                    {format.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label={LABELS.SETTINGS.FIELD_INVENTORY_PREFIX}>
              <p className="text-xs text-slate-400 mb-1">{LABELS.SETTINGS.INVENTORY_PREFIX_SUBTITLE}</p>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={f.inventoryPrefix}
                  onChange={(e) => set('inventoryPrefix', e.target.value)}
                  className="w-full max-w-[220px] px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-xs text-slate-500">
                  {LABELS.SETTINGS.INVENTORY_PREFIX_PREVIEW}
                  <span className="font-mono font-semibold text-slate-700">
                    {(f.inventoryPrefix.trim() || 'INV').toUpperCase()}-000001
                  </span>
                </span>
              </div>
            </Field>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-6 pt-5 border-t border-slate-100">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? LABELS.SETTINGS.SAVING : LABELS.SETTINGS.SAVE}
          </button>
          {error && <span className="text-sm text-red-500">{error}</span>}
        </div>
      </Card>
    )
  }

  function renderData() {
    return (
      <Card title={LABELS.SETTINGS.TAB_DATA} subtitle={LABELS.SETTINGS.DATA_SUBTITLE}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <ActionCard
            icon={DatabaseBackup}
            title={LABELS.SETTINGS.DATA_BACKUP}
            desc={LABELS.SETTINGS.DATA_BACKUP_DESC}
            actionLabel={LABELS.SETTINGS.DATA_BACKUP_OPEN}
            onAction={() => navigate(ROUTES.BACKUP)}
          />
          <ActionCard
            icon={Undo2}
            title={LABELS.SETTINGS.DATA_RESTORE}
            desc={LABELS.SETTINGS.DATA_RESTORE_DESC}
            actionLabel={LABELS.SETTINGS.DATA_RESTORE_OPEN}
            onAction={() => navigate(ROUTES.RESTORE)}
          />
          <ActionCard
            icon={RotateCcw}
            title={LABELS.SETTINGS.DATA_RESET}
            desc={LABELS.SETTINGS.DATA_RESET_DESC}
            actionLabel={resetting ? LABELS.SETTINGS.RESET_RUNNING : LABELS.SETTINGS.DATA_RESET}
            loading={resetting}
            onAction={handleResetDatabase}
          />
        </div>
      </Card>
    )
  }

  function renderSecurity() {
    return (
      <Card title={LABELS.SETTINGS.TAB_SECURITY} subtitle={LABELS.SETTINGS.SECURITY_SUBTITLE}>
        <div className="grid sm:grid-cols-2 gap-4">
          <ActionCard
            icon={KeyRound}
            title={LABELS.SETTINGS.SECURITY_LOGIN}
            desc={LABELS.SETTINGS.SECURITY_LOGIN_DESC}
            actionLabel={LABELS.SETTINGS.SECURITY_LOGIN}
            badge={LABELS.SETTINGS.COMING_SOON}
            onAction={handleComingSoon}
          />
          <ActionCard
            icon={Lock}
            title={LABELS.SETTINGS.SECURITY_PASSWORD}
            desc={LABELS.SETTINGS.SECURITY_PASSWORD_DESC}
            actionLabel={LABELS.SETTINGS.SECURITY_PASSWORD}
            onAction={() => navigate(ROUTES.CHANGE_PASSWORD)}
          />
        </div>
      </Card>
    )
  }

  function renderAppInfo() {
    const notAvailable = LABELS.SETTINGS.NOT_AVAILABLE
    const rows = [
      { label: LABELS.SETTINGS.INFO_APP_VERSION, value: appInfo?.version ?? notAvailable, mono: false },
      { label: LABELS.SETTINGS.INFO_DB_VERSION, value: dbInfo?.dbVersion ?? notAvailable, mono: false },
      { label: LABELS.SETTINGS.INFO_BACKUP_VERSION, value: dbInfo ? String(dbInfo.backupVersion) : notAvailable, mono: false },
      { label: LABELS.SETTINGS.INFO_DB_LOCATION, value: dbInfo?.dbLocation ?? notAvailable, mono: true },
      { label: LABELS.SETTINGS.INFO_BACKUP_LOCATION, value: backupDir ?? notAvailable, mono: true },
      { label: LABELS.SETTINGS.INFO_DB_SIZE, value: dbInfo?.dbSizeBytes != null ? formatFileSize(dbInfo.dbSizeBytes) : notAvailable, mono: false },
    ]
    return (
      <Card title={LABELS.SETTINGS.TAB_APP_INFO} subtitle={LABELS.SETTINGS.APP_INFO_SUBTITLE}>
        <dl className="divide-y divide-slate-100">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-4 py-3">
              <dt className="text-sm text-slate-500 shrink-0">{row.label}</dt>
              <dd className={`text-sm font-medium text-slate-900 text-right break-all ${row.mono ? 'font-mono text-xs' : ''}`}>{row.value}</dd>
            </div>
          ))}
        </dl>
      </Card>
    )
  }

  function renderAbout() {
    const rows = [
      { label: LABELS.SETTINGS.ABOUT_NAME, value: APP.NAME },
      { label: LABELS.SETTINGS.ABOUT_VERSION, value: appInfo?.version ?? '—' },
      { label: LABELS.SETTINGS.ABOUT_COPYRIGHT, value: `© ${new Date().getFullYear()} ${APP.NAME}` },
      { label: LABELS.SETTINGS.ABOUT_DEVELOPER, value: 'Ryza Arshavin' },
    ]
    return (
      <Card title={LABELS.SETTINGS.TAB_ABOUT} subtitle={LABELS.SETTINGS.ABOUT_SUBTITLE}>
        <dl className="divide-y divide-slate-100">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-4 py-3">
              <dt className="text-sm text-slate-500">{row.label}</dt>
              <dd className="text-sm font-medium text-slate-800">{row.value}</dd>
            </div>
          ))}
        </dl>
      </Card>
    )
  }
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
      <h2 className="text-base font-semibold text-slate-800">{title}</h2>
      {subtitle && <p className="text-sm text-slate-500 mt-1 mb-4">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </section>
  )
}

function ActionCard({
  icon: Icon,
  title,
  desc,
  actionLabel,
  onAction,
  badge,
  loading,
}: {
  icon: LucideIcon
  title: string
  desc: string
  actionLabel: string
  onAction: () => void
  badge?: string
  loading?: boolean
}) {
  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-slate-50/60 p-5">
      <div className="flex items-start justify-between gap-2">
        <span className="p-2.5 rounded-lg bg-blue-50 text-blue-600">
          <Icon size={20} />
        </span>
        {badge && (
          <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-[11px] font-semibold">{badge}</span>
        )}
      </div>
      <h3 className="mt-3 text-sm font-semibold text-slate-800">{title}</h3>
      <p className="mt-1 text-xs text-slate-500 leading-relaxed flex-1">{desc}</p>
      <button
        onClick={onAction}
        disabled={loading}
        className="mt-4 w-full py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? <Loader2 size={14} className="inline-block animate-spin mr-1.5 -mt-0.5" /> : null}
        {actionLabel}
      </button>
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
