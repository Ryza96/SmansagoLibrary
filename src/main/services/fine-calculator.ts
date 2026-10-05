// Kalkulator denda — fungsi murni, tanpa akses database.
import { DEFAULT_BOOK_VALUE } from '../../shared/config/fine'

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function calculateLateFine(input: {
  dueDate: Date
  returnedAt: Date
  ratePerDay: number
}): { lateDays: number; amount: number } | null {
  const ms = startOfDay(input.returnedAt).getTime() - startOfDay(input.dueDate).getTime()
  const lateDays = Math.floor(ms / 86_400_000)
  if (lateDays <= 0) return null
  return { lateDays, amount: lateDays * input.ratePerDay }
}

export function resolveBookValue(acquisitionCost: number | null | undefined): number {
  if (acquisitionCost === null || acquisitionCost === undefined || acquisitionCost <= 0) {
    return DEFAULT_BOOK_VALUE
  }
  return acquisitionCost
}

export function lateFineDedupeKey(borrowId: string): string {
  return `LATE:${borrowId}`
}

export function detailFineDedupeKey(borrowDetailId: string): string {
  return `DETAIL:${borrowDetailId}`
}
