export interface FineListItemDTO {
  id: string
  type: string
  typeLabel: string
  amount: number
  status: string
  statusLabel: string
  lateDays?: number | null
  ratePerDay?: number | null
  waivedReason?: string | null
  paidAt?: string | null
  createdAt: string
  borrowId: string
  borrowNumber: string
  memberName: string
  memberNumber: string
  bookTitle?: string | null
}

export interface FineListFilter {
  status?: 'UNPAID' | 'PAID' | 'WAIVED'
  search?: string
}
