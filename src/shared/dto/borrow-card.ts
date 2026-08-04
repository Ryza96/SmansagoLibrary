// Borrow Card — data contract (WO-1 Borrow Card Template & Data Contract).
// Seluruh data yang dibutuhkan template sudah dipersiapkan di sini (data murni):
// string sudah diformat, SVG (QR/avatar/logo fallback) sudah di-generate.
// Template TIDAK boleh membaca database — hanya menerima BorrowCardData → HTML.
// Sumber truth desain: BORROW_RECEIPT_DESIGN_AMENDMENT.md (FINAL DESIGN DECISION).

export interface BorrowCardHeaderData {
  logo: string
  schoolName: string
  libraryName: string
}

export interface BorrowCardMemberData {
  memberNumber: string
  fullName: string
  memberType: string
  className: string | null
  avatarPlaceholder: string
}

export interface BorrowCardBorrowData {
  borrowId: string
  borrowNumber: string
  borrowDate: string
  dueDate: string
}

export interface BorrowCardBookData {
  inventoryNumber: string
  title: string
}

export interface BorrowCardFooterData {
  totalBooks: number
  borrowStatus: string
  qrSvg: string
  officerName: string
}

export interface BorrowCardData {
  header: BorrowCardHeaderData
  member: BorrowCardMemberData
  borrow: BorrowCardBorrowData
  books: BorrowCardBookData[]
  footer: BorrowCardFooterData
}
