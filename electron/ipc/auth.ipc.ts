import { ipcMain } from 'electron'
import type { AuthService } from '../../src/main/services/auth.service'
import type { ChangePasswordDTO, LoginAdminDTO, SetupAdminDTO } from '../../src/shared/dto/auth'

// RFC_AUTH_ARCHITECTURE.md §4.1 — handler pass-through tipis: seluruh guard &
// validasi di AuthService (Main = penegak keamanan, renderer hanya UX).
// Error (AppError) sengaja tidak di-catch — lolos ke wrapper Electron dan
// renderer menerima `Error` dengan message dari service.
export function registerAuthHandlers(service: AuthService): void {
  ipcMain.handle('auth:status', async () => service.status())
  ipcMain.handle('auth:setup', async (_event, input: SetupAdminDTO) => service.setup(input))
  ipcMain.handle('auth:login', async (_event, input: LoginAdminDTO) => service.login(input))
  ipcMain.handle('auth:logout', async () => service.logout())
  ipcMain.handle('auth:changePassword', async (_event, input: ChangePasswordDTO) => service.changePassword(input))
  ipcMain.handle('auth:issueRecoveryCode', async (_event, currentPassword: string) => {
    if (typeof currentPassword !== 'string') throw new Error('Password tidak valid.')
    return service.issueRecoveryCode(currentPassword)
  })
  ipcMain.handle('auth:resetWithRecoveryCode', async (_event, input: { code: string; newPassword: string }) => {
    if (typeof input?.code !== 'string' || typeof input?.newPassword !== 'string') {
      throw new Error('Input tidak valid.')
    }
    return service.resetPasswordWithRecoveryCode(input)
  })
}
