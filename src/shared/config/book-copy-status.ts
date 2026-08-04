// IT-1 — Single authority untuk transisi status BookCopy.
// Satu-satunya tempat yang mendefinisikan status + transisi legal.
// Borrow, Return, dan Decommission WAJIB memakai aturan ini.
// Leaf node (nol import) — pola config F1.

export const BOOK_COPY_STATUS = {
  AVAILABLE: 'AVAILABLE',
  BORROWED: 'BORROWED',
  LOST: 'LOST',
  REMOVED: 'REMOVED'
} as const satisfies Record<string, string>

export type BookCopyStatusCode = (typeof BOOK_COPY_STATUS)[keyof typeof BOOK_COPY_STATUS]

// Keputusan PO (IT-1): BORROWED TIDAK BOLEH menuju REMOVED
// (decommission eksemplar yang sedang dipinjam wajib ditolak).
export const ALLOWED_STATUS_TRANSITIONS: Record<BookCopyStatusCode, BookCopyStatusCode[]> = {
  [BOOK_COPY_STATUS.AVAILABLE]: [BOOK_COPY_STATUS.BORROWED, BOOK_COPY_STATUS.LOST, BOOK_COPY_STATUS.REMOVED],
  [BOOK_COPY_STATUS.BORROWED]: [BOOK_COPY_STATUS.AVAILABLE, BOOK_COPY_STATUS.LOST],
  [BOOK_COPY_STATUS.LOST]: [BOOK_COPY_STATUS.REMOVED],
  [BOOK_COPY_STATUS.REMOVED]: []
}

const TRANSITION_KEYS = new Set<string>(Object.keys(ALLOWED_STATUS_TRANSITIONS))

export function canTransitionStatus(currentStatus: string, newStatus: string): boolean {
  if (currentStatus === newStatus) return true
  if (!TRANSITION_KEYS.has(currentStatus)) return false
  return ALLOWED_STATUS_TRANSITIONS[currentStatus as BookCopyStatusCode].includes(newStatus as BookCopyStatusCode)
}
