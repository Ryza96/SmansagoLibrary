// Borrow Card — status transaksi peminjaman (keputusan desain R3 / D9).
// Satu-satunya sumber label + kelas badge untuk kartu peminjaman.
// Scalability rule: status baru = tambah entri config + satu aturan CSS `.badge-<code>`
// + perluas fungsi derivasi. Template TIDAK berubah dan TIDAK punya label hardcoded.
// Leaf node (nol import) — pola config F1.

export const BORROW_STATUS = {
  ACTIVE: { code: 'ACTIVE', label: 'AKTIF', className: 'badge-active' },
  RETURNED: { code: 'RETURNED', label: 'DIKEMBALIKAN', className: 'badge-returned' },
  OVERDUE: { code: 'OVERDUE', label: 'TERLAMBAT', className: 'badge-overdue' }
} as const

export type BorrowStatusCode = keyof typeof BORROW_STATUS
export type BorrowStatusConfig = (typeof BORROW_STATUS)[BorrowStatusCode]

const BORROW_STATUS_SET: ReadonlySet<string> = new Set(Object.keys(BORROW_STATUS))

export function isBorrowStatusCode(value: string): value is BorrowStatusCode {
  return BORROW_STATUS_SET.has(value)
}

// Lookup aman utk template: status tak dikenal memakai label = kode mentah
// dan kelas netral (bukan label hardcoded di template).
export function borrowStatusConfig(status: string): { code: string; label: string; className: string } {
  if (isBorrowStatusCode(status)) return BORROW_STATUS[status]
  return { code: status, label: status, className: 'badge-neutral' }
}

// Derivasi status (pure function) — R3:
//   AKTIF       → returnDate null dan dueDate >= now
//   TERLAMBAT   → returnDate null dan dueDate < now
//   DIKEMBALIKAN→ returnDate !== null
export function deriveBorrowStatus(returnDate: Date | null, dueDate: Date, now: Date = new Date()): BorrowStatusCode {
  if (returnDate !== null) return 'RETURNED'
  return dueDate.getTime() < now.getTime() ? 'OVERDUE' : 'ACTIVE'
}
