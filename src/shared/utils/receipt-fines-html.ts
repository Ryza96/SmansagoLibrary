// Blok denda untuk bukti PENGEMBALIAN — fungsi murni.
import { FINE_STATUS_LABELS } from '../config/fine'
import { formatRupiah } from './format-rupiah'

export interface ReceiptFineHtmlItem {
  type: string
  label: string
  amount: number
  status: string
  lateDays?: number
  ratePerDay?: number
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function renderFinesBlockHtml(
  fines: ReceiptFineHtmlItem[] | undefined,
  totalUnpaid: number | undefined
): string {
  if (!fines || fines.length === 0) return ''

  const rows = fines
    .map((fine) => {
      const lateInfo =
        fine.type === 'LATE' && fine.lateDays != null && fine.ratePerDay != null
          ? `${fine.lateDays} hari x ${formatRupiah(fine.ratePerDay)}`
          : ''
      const statusLabel = FINE_STATUS_LABELS[fine.status] ?? fine.status
      return `<tr>
        <td style="padding:4px 8px;border:1px solid #d1d5db">${escapeHtml(fine.label)}${lateInfo ? ` <span style="color:#6b7280">(${escapeHtml(lateInfo)})</span>` : ''}</td>
        <td style="padding:4px 8px;border:1px solid #d1d5db;text-align:right">${escapeHtml(formatRupiah(fine.amount))}</td>
        <td style="padding:4px 8px;border:1px solid #d1d5db;text-align:center">${escapeHtml(statusLabel)}</td>
      </tr>`
    })
    .join('\n')

  const totalLine =
    totalUnpaid && totalUnpaid > 0
      ? `<div style="margin-top:6px;font-weight:bold">Total denda yang harus dibayar: ${escapeHtml(formatRupiah(totalUnpaid))}</div>`
      : `<div style="margin-top:6px;font-weight:bold">Tidak ada denda yang harus dibayar</div>`

  return `<div style="margin-top:16px">
    <h3 style="font-size:14px;margin:0 0 6px;letter-spacing:1px">DENDA</h3>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <tbody>
${rows}
      </tbody>
    </table>
    ${totalLine}
  </div>`
}
