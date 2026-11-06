// Kartu Peminjaman Kolektif A4 — data contract.
// Seluruh data disiapkan service (string sudah diformat, QR sudah di-generate).
// Template TIDAK boleh membaca database — hanya menerima DTO → HTML.

export interface CollectiveCardSchoolData {
  libraryName: string
  schoolName: string
  address: string
  logo: string
}

export interface CollectiveCardTeacherData {
  fullName: string
  memberNumber: string
  /** NIP, atau NUPTK bila NIP kosong, atau nomor anggota bila keduanya kosong. */
  identityNumber: string
}

export interface CollectiveCardBorrowData {
  borrowId: string
  borrowNumber: string
  borrowDate: string
  dueDate: string
  purpose: string
  collectiveClassName: string | null
  notes: string | null
}

export interface CollectiveCardCopyData {
  sequence: number
  inventoryNumber: string
  barcode: string | null
  bookTitle: string
  /** Tanggal kembali terformat, atau '' bila belum kembali (diisi manual). */
  returnedDate: string
  status: 'RETURNED' | 'BORROWED'
}

export interface CollectiveCardSummaryData {
  totalCopies: number
  returnedCount: number
  outstandingCount: number
}

export interface CollectiveCardData {
  school: CollectiveCardSchoolData
  teacher: CollectiveCardTeacherData
  borrow: CollectiveCardBorrowData
  copies: CollectiveCardCopyData[]
  summary: CollectiveCardSummaryData
  qrSvg: string
  printedAt: string
}
