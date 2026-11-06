// DTO peminjaman kolektif Fase 1 — guru meminjam banyak eksemplar sekaligus.
// Renderer hanya menampilkan; seluruh validasi & status turunan dihitung di service.

import type { BorrowingDTO } from './borrowing'

export interface CollectiveTitleQuantityInput {
  bookId: string
  quantity: number
}

export interface CreateCollectiveBorrowingInput {
  memberId: string
  purpose: string
  dueDate?: string
  collectiveClassId?: string | null
  notes?: string
  /** Mode "judul + jumlah": sistem memilih eksemplar AVAILABLE (urut inventoryNumber). */
  titleQuantities?: CollectiveTitleQuantityInput[]
  /** Mode "scan barcode": copyId eksemplar (sudah di-resolve dari barcode di renderer/service). */
  bookCopyIds?: string[]
  /** Alternatif mode scan: barcode mentah, di-resolve di service. */
  barcodes?: string[]
}

export type PreviewCollectiveBorrowingInput = CreateCollectiveBorrowingInput

export interface CollectivePreviewCopyDTO {
  bookCopyId: string
  bookId: string
  bookTitle: string
  barcode: string | null
  inventoryNumber: string
}

export interface CollectivePreviewDTO {
  copies: CollectivePreviewCopyDTO[]
  totalCopies: number
  memberId: string
  memberName: string
  memberNumber: string
  purpose: string
  collectiveClassId: string | null
  collectiveClassName: string | null
  dueDate: string
}

export interface CollectiveBorrowingResultDTO extends BorrowingDTO {}

export interface OutstandingCopyDTO {
  borrowDetailId: string
  bookCopyId: string
  bookTitle: string
  barcode: string | null
  inventoryNumber: string
  dueDate: string
  status: 'BORROWED' | 'OVERDUE'
  overdueDays: number
}

export interface OutstandingCopiesResultDTO {
  borrowingId: string
  borrowingNumber: string
  borrowType: string
  totalOutstanding: number
  copies: OutstandingCopyDTO[]
}
