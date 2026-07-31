export const BorrowingStatus = {
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
} as const

export type BorrowingStatus = (typeof BorrowingStatus)[keyof typeof BorrowingStatus]

export const BorrowingItemStatus = {
  BORROWED: 'BORROWED',
  RETURNED: 'RETURNED',
  LATE: 'LATE',
  DAMAGED: 'DAMAGED',
  LOST: 'LOST',
} as const

export type BorrowingItemStatus = (typeof BorrowingItemStatus)[keyof typeof BorrowingItemStatus]

export const MemberStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
} as const

export type MemberStatus = (typeof MemberStatus)[keyof typeof MemberStatus]
