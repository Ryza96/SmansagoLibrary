import { ipcRenderer } from 'electron'

export const dashboardAPI = {
  dashboard: {
    overview: () =>
      ipcRenderer.invoke('dashboard:overview')
  }
}
