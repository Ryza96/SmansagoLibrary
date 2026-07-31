import { ipcRenderer } from 'electron'

export const assetEventAPI = {
  assetEvents: {
    findByBookCopyId: (bookCopyId: string) =>
      ipcRenderer.invoke('assetEvents:findByBookCopyId', bookCopyId)
  }
}
