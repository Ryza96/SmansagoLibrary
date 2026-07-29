import { BrowserWindow } from 'electron'
import { AppError } from '../errorHandler'
import { BorrowingRepository } from '../repositories/borrowing.repository'
import type { BorrowReceiptData, ReturnReceiptData } from '../../shared/dto/print'

export class PrintService {
  constructor(private borrowingRepository: BorrowingRepository) {}

  async printBorrowReceipt(borrowingId: string): Promise<void> {
    const borrowing = await this.borrowingRepository.findById(borrowingId)
    if (!borrowing) {
      throw new AppError(404, 'Not Found', 'Data peminjaman tidak ditemukan.')
    }

    const data: BorrowReceiptData = {
      libraryName: 'APLibrary',
      borrowingNumber: borrowing.borrowingNumber,
      memberName: borrowing.member?.fullName ?? '',
      memberNumber: borrowing.member?.number ?? '',
      borrowDate: borrowing.borrowDate.toISOString(),
      dueDate: borrowing.dueDate.toISOString(),
      items: borrowing.items.map((item: any) => ({
        barcode: item.bookCopy?.barcode ?? '',
        inventoryNumber: item.bookCopy?.inventoryNumber ?? '',
        bookTitle: item.bookCopy?.book?.title ?? ''
      })),
      totalItems: borrowing.totalItems
    }

    const html = this.generateReceiptHtml(data, 'PEMINJAMAN')
    await this.printHtml(html)
  }

  async printReturnReceipt(borrowingId: string): Promise<void> {
    const borrowing = await this.borrowingRepository.findById(borrowingId)
    if (!borrowing) {
      throw new AppError(404, 'Not Found', 'Data peminjaman tidak ditemukan.')
    }

    const returnedItems = borrowing.items.filter((item: any) => item.status === 'RETURNED')

    const data: ReturnReceiptData = {
      libraryName: 'APLibrary',
      borrowingNumber: borrowing.borrowingNumber,
      memberName: borrowing.member?.fullName ?? '',
      memberNumber: borrowing.member?.number ?? '',
      returnDate: new Date().toISOString(),
      items: returnedItems.map((item: any) => ({
        barcode: item.bookCopy?.barcode ?? '',
        inventoryNumber: item.bookCopy?.inventoryNumber ?? '',
        bookTitle: item.bookCopy?.book?.title ?? '',
        condition: item.condition ?? undefined
      })),
      totalItems: returnedItems.length
    }

    const html = this.generateReceiptHtml(data, 'PENGEMBALIAN')
    await this.printHtml(html)
  }

  private generateReceiptHtml(data: any, title: string): string {
    const itemsHtml = data.items
      .map(
        (item: any, i: number) =>
          `<tr>
            <td style="padding:6px 8px;border:1px solid #d1d5db;text-align:center">${i + 1}</td>
            <td style="padding:6px 8px;border:1px solid #d1d5db">${item.barcode}</td>
            <td style="padding:6px 8px;border:1px solid #d1d5db">${item.inventoryNumber}</td>
            <td style="padding:6px 8px;border:1px solid #d1d5db">${item.bookTitle}</td>
            ${item.condition ? `<td style="padding:6px 8px;border:1px solid #d1d5db;text-align:center">${item.condition}</td>` : ''}
          </tr>`
      )
      .join('')

    const hasCondition = data.items.some((item: any) => item.condition)
    const conditionHeader = hasCondition ? '<th style="padding:8px;border:1px solid #d1d5db;background:#f3f4f6;font-size:12px;text-align:center">KONDISI</th>' : ''

    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Bukti ${title}</title></head>
<body style="font-family:'Courier New',monospace;font-size:14px;margin:0;padding:20px;color:#1f2937">
  <div style="max-width:700px;margin:0 auto">
    <div style="text-align:center;margin-bottom:20px;padding-bottom:12px;border-bottom:2px solid #374151">
      <h1 style="font-size:22px;margin:0;letter-spacing:2px">${data.libraryName}</h1>
      <h2 style="font-size:16px;margin:8px 0 0;font-weight:normal">BUKTI ${title}</h2>
    </div>
    <div style="margin-bottom:16px;font-size:13px">
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:2px 0;color:#6b7280">No. Peminjaman</td><td style="padding:2px 0">: ${data.borrowingNumber}</td></tr>
        <tr><td style="padding:2px 0;color:#6b7280">Nama Anggota</td><td style="padding:2px 0">: ${data.memberName}</td></tr>
        <tr><td style="padding:2px 0;color:#6b7280">No. Anggota</td><td style="padding:2px 0">: ${data.memberNumber}</td></tr>
        <tr><td style="padding:2px 0;color:#6b7280">Tanggal Pinjam</td><td style="padding:2px 0">: ${new Date(data.borrowDate).toLocaleDateString('id-ID')}</td></tr>
        ${data.dueDate ? `<tr><td style="padding:2px 0;color:#6b7280">Tenggat Waktu</td><td style="padding:2px 0">: ${new Date(data.dueDate).toLocaleDateString('id-ID')}</td></tr>` : ''}
        ${data.returnDate ? `<tr><td style="padding:2px 0;color:#6b7280">Tanggal Kembali</td><td style="padding:2px 0">: ${new Date(data.returnDate).toLocaleDateString('id-ID')}</td></tr>` : ''}
      </table>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>
        <tr>
          <th style="padding:8px;border:1px solid #d1d5db;background:#f3f4f6;text-align:center;width:36px">NO</th>
          <th style="padding:8px;border:1px solid #d1d5db;background:#f3f4f6;text-align:left">BARCODE</th>
          <th style="padding:8px;border:1px solid #d1d5db;background:#f3f4f6;text-align:left">INVENTARIS</th>
          <th style="padding:8px;border:1px solid #d1d5db;background:#f3f4f6;text-align:left">JUDUL BUKU</th>
          ${conditionHeader}
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>
    <div style="margin-top:12px;font-size:13px;color:#6b7280">Total Buku: ${data.totalItems}</div>
    <div style="margin-top:32px;text-align:center;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:12px">${data.libraryName} - Dokumen ini dicetak secara otomatis</div>
  </div>
</body></html>`
  }

  private printHtml(html: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const printWindow = new BrowserWindow({
        width: 800,
        height: 600,
        show: false,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false
        }
      })

      printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

      printWindow.webContents.on('did-finish-load', () => {
        printWindow.webContents.print(
          { margins: { marginType: 'default' }, printBackground: true },
          (success, failureReason) => {
            if (!printWindow.isDestroyed()) printWindow.close()
            if (success) {
              resolve()
            } else {
              reject(new Error(failureReason ?? 'Gagal mencetak'))
            }
          }
        )
      })

      printWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
        if (!printWindow.isDestroyed()) printWindow.close()
        reject(new Error(`Gagal memuat halaman cetak: ${errorDescription}`))
      })
    })
  }
}
