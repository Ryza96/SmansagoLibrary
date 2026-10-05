// Ringkasan denda untuk bukti pengembalian (murni, tanpa DB).
import { FINE_TYPE_LABELS, FINE_STATUS_LABELS } from '../config/fine'

export interface ReceiptFineInput {
  type: string
  amount: number
  status: string
  borrowDetailId: string | null
  lateDays?: number | null
  ratePerDay?: number | null
}

export interface ReceiptFineItem {
  type: string
  label: string
  amount: number
  status: string
  lateDays?: number
  ratePerDay?: number
}

export interface ReceiptFineSummary {
  items: ReceiptFineItem[]
  totalUnpaid: number
}

export function summarizeReceiptFines(
  fines: ReceiptFineInput[],
  detailIds?: Set<string> | string[]
): ReceiptFineSummary {
  const idSet = detailIds ? new Set(detailIds) : null
  const items: ReceiptFineItem[] = []
  let totalUnpaid = 0

  for (const fine of fines) {
    const inScope = !idSet || fine.borrowDetailId === null || idSet.has(fine.borrowDetailId)
    if (!inScope) continue

    items.push({
      type: fine.type,
      label: FINE_TYPE_LABELS[fine.type] ?? fine.type,
      amount: fine.amount,
      status: fine.status,
      ...(fine.lateDays != null ? { lateDays: fine.lateDays } : {}),
      ...(fine.ratePerDay != null ? { ratePerDay: fine.ratePerDay } : {})
    })

    if (fine.status === 'UNPAID') {
      totalUnpaid += fine.amount
    }
  }

  return { items, totalUnpaid }
}
