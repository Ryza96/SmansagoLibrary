export interface ReceiptItemData {
  barcode: string
  inventoryNumber: string
  bookTitle: string
  condition?: string
}

export interface BorrowReceiptData {
  libraryName: string
  borrowingNumber: string
  memberName: string
  memberNumber: string
  borrowDate: string
  dueDate: string
  items: ReceiptItemData[]
  totalItems: number
}

export interface ReturnReceiptData {
  libraryName: string
  borrowingNumber: string
  memberName: string
  memberNumber: string
  returnDate: string
  items: ReceiptItemData[]
  totalItems: number
}

export interface BookLabelItemData {
  barcode: string
  inventoryNumber: string
  shelfLocation: string
}

export interface BookLabelData {
  libraryName?: string
  bookTitle: string
  items: BookLabelItemData[]
}

// Daftar printer untuk UI Settings (pemilih printer kartu peminjaman).
// Dipetakan dari Electron.PrinterInfo di PrintService.listPrinters().
export interface PrinterInfoDTO {
  name: string
  displayName?: string
  description?: string
  isDefault: boolean
  status: number
}
