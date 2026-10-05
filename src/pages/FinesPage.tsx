import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNotification } from '../notification/NotificationContext'
import { cleanAuthErrorMessage } from '../auth/auth-error'
import { formatRupiah } from '../shared/utils/format-rupiah'
import type { FineListItemDTO } from '../shared/dto/fine'
import { LABELS } from '../utils/labels'

type StatusFilter = '' | 'UNPAID' | 'PAID' | 'WAIVED'

export default function FinesPage() {
  const { notify } = useNotification()
  const [rows, setRows] = useState<FineListItemDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [status, setStatus] = useState<StatusFilter>('UNPAID')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmRow, setConfirmRow] = useState<FineListItemDTO | null>(null)
  const [waiveRow, setWaiveRow] = useState<FineListItemDTO | null>(null)
  const [waiveReason, setWaiveReason] = useState('')
  const debounceRef = useRef<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const filter: any = {}
      if (status) filter.status = status
      if (debouncedSearch.trim()) filter.search = debouncedSearch.trim()
      const data = await window.electronAPI.fines.list(filter)
      setRows(data)
    } catch (err: unknown) {
      setLoadError(cleanAuthErrorMessage(err instanceof Error ? err.message : 'Gagal memuat denda.'))
    } finally {
      setLoading(false)
    }
  }, [status, debouncedSearch])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => setDebouncedSearch(search), 300)
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [search])

  const totalUnpaid = useMemo(
    () => rows.filter((r) => r.status === 'UNPAID').reduce((sum, r) => sum + r.amount, 0),
    [rows]
  )

  async function handleMarkPaid() {
    if (!confirmRow || busyId) return
    setBusyId(confirmRow.id)
    try {
      await window.electronAPI.fines.markPaid(confirmRow.id)
      notify.success(LABELS.FINES.PAID_SUCCESS)
      setConfirmRow(null)
      await load()
    } catch (err: unknown) {
      notify.error(cleanAuthErrorMessage(err instanceof Error ? err.message : LABELS.FINES.PAID_ERROR))
      await load()
    } finally {
      setBusyId(null)
    }
  }

  async function handleWaive() {
    if (!waiveRow || busyId) return
    if (!waiveReason.trim()) return
    setBusyId(waiveRow.id)
    try {
      await window.electronAPI.fines.waive(waiveRow.id, waiveReason.trim())
      notify.success(LABELS.FINES.WAIVE_SUCCESS)
      setWaiveRow(null)
      setWaiveReason('')
      await load()
    } catch (err: unknown) {
      notify.error(cleanAuthErrorMessage(err instanceof Error ? err.message : LABELS.FINES.WAIVE_ERROR))
      await load()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-4">{LABELS.FINES.TITLE}</h1>

      <div className="mb-4 p-4 bg-white border border-slate-200 rounded-lg">
        <p className="text-sm text-slate-600">
          {LABELS.FINES.TOTAL_UNPAID}: <span className="font-semibold text-slate-800">{formatRupiah(totalUnpaid)}</span>
        </p>
      </div>

      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
        >
          <option value="">{LABELS.FINES.FILTER_ALL}</option>
          <option value="UNPAID">{LABELS.FINES.FILTER_UNPAID}</option>
          <option value="PAID">{LABELS.FINES.FILTER_PAID}</option>
          <option value="WAIVED">{LABELS.FINES.FILTER_WAIVED}</option>
        </select>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={LABELS.FINES.SEARCH_PLACEHOLDER}
          className="flex-1 min-w-[220px] px-3 py-2 border border-slate-300 rounded-lg text-sm"
        />
      </div>

      {loading && <p className="text-slate-400 text-sm">{LABELS.FINES.LOADING}</p>}
      {loadError && <p role="alert" className="text-red-600 text-sm mb-3">{loadError}</p>}
      {!loading && !loadError && rows.length === 0 && (
        <p className="text-slate-400 text-sm">{LABELS.FINES.EMPTY}</p>
      )}

      {!loading && !loadError && rows.length > 0 && (
        <div className="overflow-x-auto bg-white border border-slate-200 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="text-left p-3">{LABELS.FINES.COL_DATE}</th>
                <th className="text-left p-3">{LABELS.FINES.COL_BORROW_NUMBER}</th>
                <th className="text-left p-3">{LABELS.FINES.COL_MEMBER}</th>
                <th className="text-left p-3">{LABELS.FINES.COL_TYPE}</th>
                <th className="text-right p-3">{LABELS.FINES.COL_AMOUNT}</th>
                <th className="text-left p-3">{LABELS.FINES.COL_STATUS}</th>
                <th className="text-left p-3">{LABELS.FINES.COL_ACTIONS}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-0">
                  <td className="p-3">{new Date(row.createdAt).toLocaleDateString('id-ID')}</td>
                  <td className="p-3">{row.borrowNumber}</td>
                  <td className="p-3">
                    {row.memberName}
                    <span className="block text-xs text-slate-400">{row.memberNumber}</span>
                  </td>
                  <td className="p-3">
                    {row.typeLabel}
                    {row.type === 'LATE' && row.lateDays != null && row.ratePerDay != null && (
                      <span className="block text-xs text-slate-500">
                        {row.lateDays} {LABELS.FINES.DAYS} x {formatRupiah(row.ratePerDay)}
                      </span>
                    )}
                    {(row.type === 'HEAVY_DAMAGE' || row.type === 'LOST') && row.bookTitle && (
                      <span className="block text-xs text-slate-500">{row.bookTitle}</span>
                    )}
                  </td>
                  <td className="p-3 text-right">{formatRupiah(row.amount)}</td>
                  <td className="p-3">
                    {row.statusLabel}
                    {row.status === 'WAIVED' && row.waivedReason && (
                      <span className="block text-xs text-slate-500">{row.waivedReason}</span>
                    )}
                    {row.status === 'PAID' && row.paidAt && (
                      <span className="block text-xs text-slate-500">
                        {new Date(row.paidAt).toLocaleDateString('id-ID')}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    {row.status === 'UNPAID' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConfirmRow(row)}
                          disabled={busyId === row.id}
                          className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg disabled:opacity-50"
                        >
                          {LABELS.FINES.ACTION_PAID}
                        </button>
                        <button
                          onClick={() => { setWaiveRow(row); setWaiveReason('') }}
                          disabled={busyId === row.id}
                          className="px-3 py-1.5 text-xs bg-slate-200 text-slate-700 rounded-lg disabled:opacity-50"
                        >
                          {LABELS.FINES.ACTION_WAIVE}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmRow && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <p className="text-sm text-slate-700 mb-4">
              {LABELS.FINES.PAID_CONFIRM
                .replace('{amount}', formatRupiah(confirmRow.amount))
                .replace('{name}', confirmRow.memberName)}
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmRow(null)} className="px-4 py-2 text-sm border border-slate-300 rounded-lg">
                {LABELS.FINES.CANCEL}
              </button>
              <button
                onClick={handleMarkPaid}
                disabled={busyId === confirmRow.id}
                className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg disabled:opacity-50"
              >
                {LABELS.FINES.PAID_CONFIRM_YES}
              </button>
            </div>
          </div>
        </div>
      )}

      {waiveRow && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-base font-semibold text-slate-800 mb-3">{LABELS.FINES.WAIVE_TITLE}</h3>
            <label className="block text-sm text-slate-700 mb-1">{LABELS.FINES.WAIVE_REASON_LABEL}</label>
            <textarea
              value={waiveReason}
              onChange={(e) => setWaiveReason(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-4"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => { setWaiveRow(null); setWaiveReason('') }} className="px-4 py-2 text-sm border border-slate-300 rounded-lg">
                {LABELS.FINES.CANCEL}
              </button>
              <button
                onClick={handleWaive}
                disabled={busyId === waiveRow.id || !waiveReason.trim()}
                className="px-4 py-2 text-sm bg-slate-700 text-white rounded-lg disabled:opacity-50"
              >
                {LABELS.FINES.WAIVE_SAVE}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
