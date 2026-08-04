export interface DashboardSummaryDTO {
  totalBooks: number
  totalInventories: number
  totalMembers: number
  activeBorrowings: number
}

export interface DashboardTodayDTO {
  borrowed: number
  returned: number
  overdue: number
  dueToday: number
}

export type DashboardActivityType = 'BORROW' | 'RETURN'

export interface DashboardRecentActivityDTO {
  id: string
  type: DashboardActivityType
  message: string
  occurredAt: string
}

export type DashboardAlertSeverity = 'danger' | 'warning'

export interface DashboardAlertDTO {
  id: string
  severity: DashboardAlertSeverity
  type: string
  message: string
}

export interface DashboardOverviewDTO {
  summary: DashboardSummaryDTO
  today: DashboardTodayDTO
  recentActivity: DashboardRecentActivityDTO[]
  alerts: DashboardAlertDTO[]
}
