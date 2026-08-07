import { Prisma } from '@prisma/client'
import { getPrisma } from '../repositories/base/prisma'
import { runTransaction } from '../repositories/base/transaction'

// WBS/SETTINGS DB RESET — Reset Database: kembalikan database ke kondisi awal
// dengan MENGHAPUS SELURUH data transaksional & katalog (Borrow, Return, Member,
// Enrollment, Promotion, Book, BookCopy, Author, Publisher, Category, AssetEvent)
// sambil MEMPERTAHANKAN data master yang aman (AcademicYear, Curriculum, Class),
// konfigurasi (Setting), dan keamanan (Admin, AdminSession).
//
// Seluruh DELETE berjalan dalam SATU prisma.$transaction — bila salah satu
// operasi gagal, Prisma me-rollback seluruh transaksi (all-or-nothing), sehingga
// tidak pernah ada kondisi "database setengah di-reset".
//
// `performResetTx` diekspos terpisah agar orkestrasi transaksi hidup di
// `resetDatabase` dan seluruh langkah bisa diuji/overridden (smoke rollback).

export class ResetDatabaseService {
  async resetDatabase(): Promise<void> {
    await runTransaction(getPrisma(), async (tx) => {
      await this.performResetTx(tx)
    })
  }

  async performResetTx(tx: Prisma.TransactionClient): Promise<void> {
    await tx.borrowDetail.deleteMany()
    await tx.borrow.deleteMany()
    await tx.assetEvent.deleteMany()
    await tx.promotionRunItem.deleteMany()
    await tx.promotionRun.deleteMany()
    await tx.memberEnrollment.deleteMany()
    await tx.member.deleteMany()
    await tx.bookCopy.deleteMany()
    await tx.book.deleteMany()
    await tx.author.deleteMany()
    await tx.publisher.deleteMany()
    await tx.category.deleteMany()

    await tx.inventorySequence.upsert({
      where: { id: 'default' },
      create: { id: 'default', prefix: 'INV', lastNumber: 0 },
      update: { lastNumber: 0 },
    })
  }
}
