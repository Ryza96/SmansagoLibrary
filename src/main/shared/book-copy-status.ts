export const BookCopyStatus = {
  AVAILABLE: 'AVAILABLE',
  BORROWED: 'BORROWED',
  RESERVED: 'RESERVED',
  LOST: 'LOST',
  DAMAGED: 'DAMAGED',
  REPAIR: 'REPAIR',
  WITHDRAWN: 'WITHDRAWN',
} as const

export type BookCopyStatus = (typeof BookCopyStatus)[keyof typeof BookCopyStatus]
