import { useState } from 'react'
import { LABELS } from '../../utils/labels'
import { useNotification } from '../../notification/NotificationContext'

interface Props {
  recoveryCode: string
  onContinue: () => void
}

export default function RecoveryCodeDisplay({ recoveryCode, onContinue }: Props) {
  const { notify } = useNotification()
  const [confirmed, setConfirmed] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(recoveryCode)
      notify.success(LABELS.AUTH.RECOVERY_COPIED)
    } catch {
      notify.error(LABELS.AUTH.RECOVERY_COPY_FAILED)
    }
  }

  function handlePrint() {
    window.print()
  }

  return (
    <div className="text-center">
      <style>{`@media print { body * { visibility: hidden; } #recovery-code-text, #recovery-code-text * { visibility: visible; } #recovery-code-text { position: fixed; inset: 0; margin: auto; } }`}</style>
      <h2 className="text-lg font-semibold text-slate-800">{LABELS.AUTH.RECOVERY_TITLE}</h2>
      <p className="mt-2 text-sm text-slate-500">{LABELS.AUTH.RECOVERY_WARNING}</p>
      <p
        id="recovery-code-text"
        className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-3 font-mono text-xl tracking-widest text-emerald-300 print:bg-white print:text-black"
      >
        {recoveryCode}
      </p>
      <div className="mt-4 flex items-center justify-center gap-2 print:hidden">
        <button onClick={handleCopy} type="button" className="px-4 py-2 border border-slate-300 rounded-lg text-sm">
          {LABELS.AUTH.RECOVERY_COPY}
        </button>
        <button onClick={handlePrint} type="button" className="px-4 py-2 border border-slate-300 rounded-lg text-sm">
          {LABELS.AUTH.RECOVERY_PRINT}
        </button>
      </div>
      <label className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-600 print:hidden">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        {LABELS.AUTH.RECOVERY_CONFIRM_SAVED}
      </label>
      <button
        onClick={onContinue}
        disabled={!confirmed}
        className="mt-4 w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 print:hidden"
      >
        {LABELS.AUTH.RECOVERY_CONTINUE}
      </button>
    </div>
  )
}
