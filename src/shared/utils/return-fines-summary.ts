import { FINE_TYPE_LABELS } from '../config/fine'

export interface ReturnFineSummaryItem {
  type: string
  label: string
  amount: number
}

export function summarizeReturnFines(
  fines?: Array<{ type: string; amount: number }>
): { items: ReturnFineSummaryItem[]; total: number } {
  if (!fines || fines.length === 0) return { items: [], total: 0 }
  const items = fines.map((f) => ({
    type: f.type,
    label: FINE_TYPE_LABELS[f.type] ?? f.type,
    amount: f.amount
  }))
  const total = fines.reduce((sum, f) => sum + f.amount, 0)
  return { items, total }
}
