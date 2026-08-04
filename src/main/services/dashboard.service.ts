import type { DashboardRepository } from '../repositories/dashboard.repository'
import type { DueBorrowRow, RecentBorrowRow, RecentReturnRow, LostCopyRow } from '../repositories/dashboard.repository'
import type {
  DashboardSummaryDTO,
  DashboardTodayDTO,
  DashboardRecentActivityDTO,
  DashboardAlertDTO,
  DashboardOverviewDTO
} from '../../shared/dto/dashboard'

export const RECENT_ACTIVITY_LIMIT = 8
export const MAX_ALERTS_PER_CATEGORY = 50

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

function formatDueDate(d: Date): string {
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
}

export class DashboardService {
  constructor(private readonly dashboardRepository: DashboardRepository) {}

  async getOverview(): Promise<DashboardOverviewDTO> {
    const now = new Date()
    const dayStart = startOfDay(now)
    const dayEnd = endOfDay(now)

    const [summary, today, recentBorrows, recentReturns, overdueBorrows, dueTodayBorrows, lostCopies] = await Promise.all([
      this.getSummary(),
      this.getTodayCounts(dayStart, dayEnd),
      this.dashboardRepository.findRecentBorrows(RECENT_ACTIVITY_LIMIT),
      this.dashboardRepository.findRecentReturns(RECENT_ACTIVITY_LIMIT),
      this.dashboardRepository.findOverdueBorrows(dayStart, MAX_ALERTS_PER_CATEGORY),
      this.dashboardRepository.findDueTodayBorrows(dayStart, dayEnd, MAX_ALERTS_PER_CATEGORY),
      this.dashboardRepository.findLostCopies(MAX_ALERTS_PER_CATEGORY)
    ])

    return {
      summary,
      today,
      recentActivity: this.buildRecentActivity(recentBorrows, recentReturns),
      alerts: this.buildAlerts(overdueBorrows, dueTodayBorrows, lostCopies)
    }
  }

  private async getSummary(): Promise<DashboardSummaryDTO> {
    const [totalBooks, totalInventories, totalMembers, activeBorrowings] = await Promise.all([
      this.dashboardRepository.countBooks(),
      this.dashboardRepository.countBookCopies(),
      this.dashboardRepository.countMembers(),
      this.dashboardRepository.countActiveBorrows()
    ])
    return { totalBooks, totalInventories, totalMembers, activeBorrowings }
  }

  private async getTodayCounts(dayStart: Date, dayEnd: Date): Promise<DashboardTodayDTO> {
    const [borrowed, returned, overdue, dueToday] = await Promise.all([
      this.dashboardRepository.countBorrowedBetween(dayStart, dayEnd),
      this.dashboardRepository.countReturnedBetween(dayStart, dayEnd),
      this.dashboardRepository.countOverdueBefore(dayStart),
      this.dashboardRepository.countDueBetween(dayStart, dayEnd)
    ])
    return { borrowed, returned, overdue, dueToday }
  }

  private buildRecentActivity(borrows: RecentBorrowRow[], returns: RecentReturnRow[]): DashboardRecentActivityDTO[] {
    const items: DashboardRecentActivityDTO[] = []
    for (const b of borrows) {
      items.push({
        id: `borrow-${b.id}`,
        type: 'BORROW',
        message: `${b.memberName} meminjam ${b.totalItems} buku (${b.borrowNumber})`,
        occurredAt: b.borrowDate.toISOString()
      })
    }
    for (const r of returns) {
      items.push({
        id: `return-${r.id}`,
        type: 'RETURN',
        message: `${r.borrow?.memberName ?? ''} mengembalikan ${r.bookTitle} (${r.borrow?.borrowNumber ?? ''})`,
        occurredAt: r.returnedAt.toISOString()
      })
    }
    items.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
    return items.slice(0, RECENT_ACTIVITY_LIMIT)
  }

  private buildAlerts(overdue: DueBorrowRow[], dueToday: DueBorrowRow[], lostCopies: LostCopyRow[]): DashboardAlertDTO[] {
    const alerts: DashboardAlertDTO[] = []
    for (const b of overdue) {
      alerts.push({
        id: `overdue-${b.id}`,
        severity: 'danger',
        type: 'OVERDUE',
        message: `Peminjaman ${b.borrowNumber} (${b.memberName}) terlambat — jatuh tempo ${formatDueDate(b.dueDate)}`
      })
    }
    for (const b of dueToday) {
      alerts.push({
        id: `due-today-${b.id}`,
        severity: 'warning',
        type: 'DUE_TODAY',
        message: `Peminjaman ${b.borrowNumber} (${b.memberName}) jatuh tempo hari ini`
      })
    }
    for (const c of lostCopies) {
      alerts.push({
        id: `lost-${c.id}`,
        severity: 'warning',
        type: 'COPY_LOST',
        message: `Eksemplar ${c.inventoryNumber} — ${c.title} berstatus Hilang`
      })
    }
    return alerts
  }
}
