export const BookCopyStatus = {
  AVAILABLE: 'AVAILABLE',
  BORROWED: 'BORROWED',
  LOST: 'LOST',
  REMOVED: 'REMOVED',
} as const

export type BookCopyStatus = (typeof BookCopyStatus)[keyof typeof BookCopyStatus]
