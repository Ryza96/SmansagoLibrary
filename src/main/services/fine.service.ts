import { FineRepository } from '../repositories/fine.repository'
import { runTransaction } from '../repositories/base/transaction'
import { getPrisma } from '../repositories/base/prisma'
import { AppError } from '../../../electron/main/errorHandler'
import { FINE_TYPE_LABELS, FINE_STATUS_LABELS } from '../../shared/config/fine'
import type { FineListFilter, FineListItemDTO } from '../../shared/dto/fine'

export class FineService {
  constructor(private fineRepository: FineRepository = new FineRepository()) {}

  async list(filter?: FineListFilter): Promise<FineListItemDTO[]> {
    const rows = await this.fineRepository.findAll(filter)
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      typeLabel: FINE_TYPE_LABELS[row.type] ?? row.type,
      amount: row.amount,
      status: row.status,
      statusLabel: FINE_STATUS_LABELS[row.status] ?? row.status,
      lateDays: row.lateDays ?? null,
      ratePerDay: row.ratePerDay ?? null,
      waivedReason: row.waivedReason ?? null,
      paidAt: row.paidAt ? row.paidAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      borrowId: row.borrowId,
      borrowNumber: row.borrow?.borrowNumber ?? '',
      memberName: row.borrow?.memberName ?? '',
      memberNumber: row.borrow?.memberNumber ?? '',
      bookTitle: row.borrowDetail?.bookTitle ?? null
    }))
  }

  async markPaid(id: string): Promise<FineListItemDTO> {
    return runTransaction(getPrisma(), async (tx) => {
      const fine = await tx.fine.findUnique({ where: { id } })
      if (!fine) {
        throw new AppError(404, 'Not Found', 'Denda tidak ditemukan.')
      }
      if (fine.status !== 'UNPAID') {
        throw new AppError(400, 'Validation Error', `Denda sudah berstatus ${FINE_STATUS_LABELS[fine.status] ?? fine.status}.`)
      }
      const updated = await tx.fine.update({
        where: { id },
        data: { status: 'PAID', paidAt: new Date() }
      })
      return this.toDTO(updated)
    })
  }

  async waive(id: string, reason: string): Promise<FineListItemDTO> {
    const trimmed = reason.trim()
    if (!trimmed) {
      throw new AppError(400, 'Validation Error', 'Alasan pembebasan denda wajib diisi.')
    }
    return runTransaction(getPrisma(), async (tx) => {
      const fine = await tx.fine.findUnique({ where: { id } })
      if (!fine) {
        throw new AppError(404, 'Not Found', 'Denda tidak ditemukan.')
      }
      if (fine.status !== 'UNPAID') {
        throw new AppError(400, 'Validation Error', `Denda sudah berstatus ${FINE_STATUS_LABELS[fine.status] ?? fine.status}.`)
      }
      const updated = await tx.fine.update({
        where: { id },
        data: { status: 'WAIVED', waivedReason: trimmed }
      })
      return this.toDTO(updated)
    })
  }

  private toDTO(fine: any): FineListItemDTO {
    return {
      id: fine.id,
      type: fine.type,
      typeLabel: FINE_TYPE_LABELS[fine.type] ?? fine.type,
      amount: fine.amount,
      status: fine.status,
      statusLabel: FINE_STATUS_LABELS[fine.status] ?? fine.status,
      lateDays: fine.lateDays ?? null,
      ratePerDay: fine.ratePerDay ?? null,
      waivedReason: fine.waivedReason ?? null,
      paidAt: fine.paidAt ? fine.paidAt.toISOString() : null,
      createdAt: fine.createdAt.toISOString(),
      borrowId: fine.borrowId,
      borrowNumber: '',
      memberName: '',
      memberNumber: '',
      bookTitle: null
    }
  }
}
