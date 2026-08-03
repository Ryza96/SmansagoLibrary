import { ipcRenderer } from 'electron'

export const enrollmentAPI = {
  enrollments: {
    enroll: (input: Record<string, unknown>) =>
      ipcRenderer.invoke('enrollments:enroll', input),
    close: (enrollmentId: string, input: Record<string, unknown>) =>
      ipcRenderer.invoke('enrollments:close', enrollmentId, input),
    repoint: (enrollmentId: string, input: Record<string, unknown>) =>
      ipcRenderer.invoke('enrollments:repoint', enrollmentId, input),
    findActiveByMember: (memberId: string) =>
      ipcRenderer.invoke('enrollments:findActiveByMember', memberId),
    historyByMember: (memberId: string) =>
      ipcRenderer.invoke('enrollments:historyByMember', memberId)
  }
}
