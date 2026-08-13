import { ipcRenderer } from 'electron'
import type { TeacherImportRowInput } from '../../src/shared/dto/teacher'

export const teacherAPI = {
  teacherImport: {
    downloadTemplate: () => ipcRenderer.invoke('teachers:downloadTemplate'),
    previewCheck: (rows: TeacherImportRowInput[]) =>
      ipcRenderer.invoke('teachers:previewCheck', rows),
    import: (rows: TeacherImportRowInput[]) =>
      ipcRenderer.invoke('teachers:import', rows),
    onProgress: (callback: (stage: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, stage: string) =>
        callback(stage)
      ipcRenderer.on('teachers:importProgress', listener)
      return () => ipcRenderer.removeListener('teachers:importProgress', listener)
    }
  },
}
