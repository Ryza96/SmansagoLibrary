// Jenis transaksi peminjaman: INDIVIDUAL (satu anggota, buku pilihan)
// vs COLLECTIVE (guru meminjam banyak eksemplar sekaligus, mis. untuk bimbel).
// Leaf node (nol import) — pola config F1 (ikuti borrow-status.ts).
// Tanpa enum DB — nilai disimpan sebagai string bebas, validasi di service layer.

export const BORROW_TYPES = {
  INDIVIDUAL: { code: 'INDIVIDUAL', label: 'Individu' },
  COLLECTIVE: { code: 'COLLECTIVE', label: 'Kolektif' }
} as const

export type BorrowTypeCode = keyof typeof BORROW_TYPES

const BORROW_TYPE_SET: ReadonlySet<string> = new Set(Object.keys(BORROW_TYPES))

export function isBorrowTypeCode(value: string): value is BorrowTypeCode {
  return BORROW_TYPE_SET.has(value)
}

export function borrowTypeLabel(value?: string | null): string {
  if (value && isBorrowTypeCode(value)) return BORROW_TYPES[value].label
  return value ?? ''
}

// Fase 1 memakai konstanta default (pengaturan via Settings = Fase 2).
export const COLLECTIVE_DEFAULT_LOAN_DAYS = 14
export const COLLECTIVE_MAX_COPIES = 50
