import { ipcRenderer } from 'electron'

export const printAPI = {
  print: {
    borrowReceipt: (borrowingId: string) => ipcRenderer.invoke('printing:borrowReceipt', borrowingId),
    returnReceipt: (borrowingId: string) => ipcRenderer.invoke('printing:returnReceipt', borrowingId)
  }
}
