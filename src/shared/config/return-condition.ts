// Kondisi pengembalian buku (conditionBack di BorrowDetail).
// Satu otoritas untuk UI (ReturnsPage), DTO (ReturnCondition), dan validasi Service.
// Legacy: nilai lama 'RUSAK' masih ada di DB (snapshot pengembalian sebelum migrasi
// kosakata) — label legacy dipetakan agar tetap tampil rapi, TIDAK untuk input baru.
// Leaf node (nol import) — pola config F1.

export const RETURN_CONDITION = {
  BAIK: 'BAIK',
  RUSAK_RINGAN: 'RUSAK_RINGAN',
  RUSAK_BERAT: 'RUSAK_BERAT',
  HILANG: 'HILANG'
} as const satisfies Record<string, string>

export type ReturnConditionCode = (typeof RETURN_CONDITION)[keyof typeof RETURN_CONDITION]

export const RETURN_CONDITION_VALUES: ReturnConditionCode[] = [
  RETURN_CONDITION.BAIK,
  RETURN_CONDITION.RUSAK_RINGAN,
  RETURN_CONDITION.RUSAK_BERAT,
  RETURN_CONDITION.HILANG
]

const RETURN_CONDITION_SET: ReadonlySet<string> = new Set(RETURN_CONDITION_VALUES)

export function isReturnCondition(value: unknown): value is ReturnConditionCode {
  return typeof value === 'string' && RETURN_CONDITION_SET.has(value)
}

// Label tampilan bahasa Indonesia.
// 'RUSAK' (legacy) dipetakan ke "Rusak Ringan" agar data lama tetap terbaca.
export const RETURN_CONDITION_LABELS: Record<string, string> = {
  [RETURN_CONDITION.BAIK]: 'Baik',
  [RETURN_CONDITION.RUSAK_RINGAN]: 'Rusak Ringan',
  [RETURN_CONDITION.RUSAK_BERAT]: 'Rusak Berat',
  [RETURN_CONDITION.HILANG]: 'Hilang',
  // Legacy snapshot (bukan input valid):
  RUSAK: 'Rusak Ringan'
}
