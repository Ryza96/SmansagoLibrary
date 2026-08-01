import { ipcRenderer } from 'electron'
import type { CanonicalRow } from '../../src/types/import'

export const bookImportAPI = {
  imports: {
    match: (canonicalRows: CanonicalRow[]) => ipcRenderer.invoke('imports:match', canonicalRows),
    downloadTemplate: () => ipcRenderer.invoke('imports:downloadTemplate'),
  },
}
