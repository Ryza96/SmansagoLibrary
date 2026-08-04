import { ipcMain } from 'electron'
import type { DashboardService } from '../../src/main/services/dashboard.service'

export function registerDashboardHandlers(dashboardService: DashboardService): void {
  ipcMain.handle('dashboard:overview', async () => dashboardService.getOverview())
}
