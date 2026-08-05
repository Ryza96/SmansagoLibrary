import { ipcRenderer } from 'electron'
import type {
  BorrowReportFilter,
  CollectionReportFilter,
  MemberReportFilter,
  OverdueReportFilter,
  ReturnReportFilter
} from '../../src/shared/dto/report'

export const reportAPI = {
  reports: {
    borrowings: (filter: BorrowReportFilter) => ipcRenderer.invoke('reports:borrowings', filter),
    returns: (filter: ReturnReportFilter) => ipcRenderer.invoke('reports:returns', filter),
    overdues: (filter: OverdueReportFilter) => ipcRenderer.invoke('reports:overdues', filter),
    members: (filter: MemberReportFilter) => ipcRenderer.invoke('reports:members', filter),
    collections: (filter: CollectionReportFilter) => ipcRenderer.invoke('reports:collections', filter)
  }
}
