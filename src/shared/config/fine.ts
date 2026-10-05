// Denda — satu otoritas nilai konstanta denda.
// Leaf node (nol import) — pola config F1.

export const FINE_TYPE = {
  LATE: 'LATE',
  HEAVY_DAMAGE: 'HEAVY_DAMAGE',
  LOST: 'LOST'
} as const satisfies Record<string, string>

export type FineTypeCode = (typeof FINE_TYPE)[keyof typeof FINE_TYPE]

export const FINE_STATUS = {
  UNPAID: 'UNPAID',
  PAID: 'PAID',
  WAIVED: 'WAIVED'
} as const satisfies Record<string, string>

export type FineStatusCode = (typeof FINE_STATUS)[keyof typeof FINE_STATUS]

export const DEFAULT_LATE_FEE_PER_DAY = 1000
export const DEFAULT_BOOK_VALUE = 25000

export const FINE_TYPE_LABELS: Record<string, string> = {
  LATE: 'Terlambat',
  HEAVY_DAMAGE: 'Rusak Berat',
  LOST: 'Hilang'
}

export const FINE_STATUS_LABELS: Record<string, string> = {
  UNPAID: 'Belum dibayar',
  PAID: 'Lunas',
  WAIVED: 'Dibebaskan'
}
