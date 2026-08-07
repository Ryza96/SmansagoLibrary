import { ipcRenderer } from 'electron'
import type { ChangePasswordDTO, LoginAdminDTO, SetupAdminDTO } from '../../src/shared/dto/auth'

// RFC_AUTH_ARCHITECTURE.md §4.4 — authAPI diekspos sebagai
// `window.electronAPI.auth.*` via spread di preload/index.ts.
export const authAPI = {
  auth: {
    status: () => ipcRenderer.invoke('auth:status'),
    setup: (input: SetupAdminDTO) => ipcRenderer.invoke('auth:setup', input),
    login: (input: LoginAdminDTO) => ipcRenderer.invoke('auth:login', input),
    logout: () => ipcRenderer.invoke('auth:logout'),
    changePassword: (input: ChangePasswordDTO) => ipcRenderer.invoke('auth:changePassword', input)
  }
}
