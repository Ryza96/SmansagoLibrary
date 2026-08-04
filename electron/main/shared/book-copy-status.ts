import { BOOK_COPY_STATUS } from '../../../src/shared/config/book-copy-status'

// IT-1 — konstanta status kini berasal dari SATU otoritas di src/shared/config.
// File ini hanya shim backward-compat untuk legacy stack (addCopies).
export const BookCopyStatus = BOOK_COPY_STATUS
export type BookCopyStatus = (typeof BOOK_COPY_STATUS)[keyof typeof BOOK_COPY_STATUS]
