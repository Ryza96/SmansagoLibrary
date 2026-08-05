import { BrowserWindow, app, dialog } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { AppError } from '../errorHandler'
import { BorrowRepository } from '../../../src/main/repositories/borrow.repository'
import { SettingService } from './setting.service'
import { generateLabelsHtml } from '../../../src/main/services/label.service'
import { buildBorrowCardData, generateBorrowCardHtml } from '../../../src/main/services/borrow-card.service'
import type { BorrowReceiptData, ReturnReceiptData, BookLabelData } from '../../../src/shared/dto/print'

// WO-2 — nama file PDF Kartu Peminjaman (FINAL PREVIEW DESIGN DECISION F5).
// Format: "Kartu Peminjaman - <borrowNumber> - <Nama Anggota>.pdf".
// Murni (tanpa Electron) agar dapat diuji smoke; sanitasi aman Windows.
export function buildBorrowCardPdfFilename(borrowing: { borrowNumber: string; memberName: string }): string {
  const sanitize = (value: string): string =>
    value
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()

  const number = sanitize(borrowing.borrowNumber) || 'PEMINJAMAN'
  const member = sanitize(borrowing.memberName).slice(0, 40) || 'Anggota'
  return `Kartu Peminjaman - ${number} - ${member}.pdf`
}

const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon'
}

export class PrintService {
  constructor(
    private borrowRepository: BorrowRepository,
    private settingService: SettingService
  ) {}

  getLabelPreviewHtml(data: BookLabelData): string {
    return generateLabelsHtml(data)
  }

  async printBookLabels(data: BookLabelData): Promise<void> {
    const html = generateLabelsHtml(data)
    await this.printHtml(html, { margins: { marginType: 'none' } })
  }

  // ---------------------------------------------------------------------------
  // WO-2 — Kartu Peminjaman: Preview / Cetak / Simpan PDF (FINAL PREVIEW DESIGN
  // DECISION). Seluruh aksi memakai SATU template (generateBorrowCardHtml) dan
  // SATU assembler (buildBorrowCardData) dari BorrowCardService (WO-1) —
  // BorrowCardService TIDAK dimodifikasi.
  // ---------------------------------------------------------------------------

  private async readFileAsDataUri(filePath: string): Promise<string | null> {
    try {
      const ext = filePath.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? ''
      const mime = IMAGE_MIME[ext]
      if (!mime) return null
      const buffer = await readFile(filePath)
      return `data:${mime};base64,${buffer.toString('base64')}`
    } catch {
      return null
    }
  }

  async buildBorrowCardHtml(borrowingId: string): Promise<string> {
    const [borrowing, settings] = await Promise.all([
      this.borrowRepository.findById(borrowingId),
      this.settingService.get()
    ])
    if (!borrowing) {
      throw new AppError(404, 'Not Found', 'Data peminjaman tidak ditemukan.')
    }
    const data = await buildBorrowCardData(borrowing, settings, {
      readFileAsDataUri: this.readFileAsDataUri.bind(this)
    })
    return generateBorrowCardHtml(data)
  }

  async getBorrowCardPreviewHtml(borrowingId: string): Promise<string> {
    return this.buildBorrowCardHtml(borrowingId)
  }

  async printBorrowCard(borrowingId: string): Promise<void> {
    const html = await this.buildBorrowCardHtml(borrowingId)
    await this.printHtml(html, { margins: { marginType: 'none' } })
  }

  async saveBorrowCardPdf(borrowingId: string): Promise<{ saved: boolean; filePath?: string }> {
    const [borrowing, html] = await Promise.all([
      this.borrowRepository.findById(borrowingId),
      this.buildBorrowCardHtml(borrowingId)
    ])
    if (!borrowing) {
      throw new AppError(404, 'Not Found', 'Data peminjaman tidak ditemukan.')
    }

    const pdf = await this.renderPdf(html)
    const filename = buildBorrowCardPdfFilename(borrowing)

    const result = await dialog.showSaveDialog({
      title: 'Simpan Kartu Peminjaman PDF',
      defaultPath: join(app.getPath('documents'), filename),
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })

    if (result.canceled || !result.filePath) {
      return { saved: false }
    }

    await writeFile(result.filePath, pdf)
    return { saved: true, filePath: result.filePath }
  }

  private renderPdf(html: string): Promise<Buffer> {
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

      printWindow.webContents.on('did-finish-load', async () => {
        try {
          const pdf = await printWindow.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true })
          resolve(pdf)
        } catch (error) {
          reject(error)
        } finally {
          if (!printWindow.isDestroyed()) printWindow.close()
        }
      })

      printWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
        if (!printWindow.isDestroyed()) printWindow.close()
        reject(new Error(`Gagal memuat halaman PDF: ${errorDescription}`))
      })
    })
  }

  async printBorrowReceipt(borrowingId: string): Promise<void> {
    const [borrowing, settings] = await Promise.all([
      this.borrowRepository.findById(borrowingId),
      this.settingService.get()
    ])
    if (!borrowing) {
      throw new AppError(404, 'Not Found', 'Data peminjaman tidak ditemukan.')
    }

    const data: BorrowReceiptData = {
      libraryName: settings.libraryName,
      borrowingNumber: borrowing.borrowNumber,
      memberName: borrowing.member?.fullName ?? borrowing.memberName ?? '',
      memberNumber: borrowing.member?.memberNumber ?? borrowing.memberNumber ?? '',
      borrowDate: borrowing.borrowDate.toISOString(),
      dueDate: borrowing.dueDate.toISOString(),
      items: borrowing.details.map((detail: any) => ({
        barcode: detail.bookCopy?.barcode ?? '',
        inventoryNumber: detail.bookCopy?.inventoryNumber ?? '',
        bookTitle: detail.bookCopy?.book?.title ?? ''
      })),
      totalItems: borrowing.details.length
    }

    const html = this.generateReceiptHtml(data, 'PEMINJAMAN')
    await this.printHtml(html)
  }

  async printReturnReceipt(borrowingId: string): Promise<void> {
    const [borrowing, settings] = await Promise.all([
      this.borrowRepository.findById(borrowingId),
      this.settingService.get()
    ])
    if (!borrowing) {
      throw new AppError(404, 'Not Found', 'Data peminjaman tidak ditemukan.')
    }

    const returnedItems = borrowing.details.filter((detail: any) => detail.returnedAt !== null)

    const data: ReturnReceiptData = {
      libraryName: settings.libraryName,
      borrowingNumber: borrowing.borrowNumber,
      memberName: borrowing.member?.fullName ?? borrowing.memberName ?? '',
      memberNumber: borrowing.member?.memberNumber ?? borrowing.memberNumber ?? '',
      returnDate: new Date().toISOString(),
      items: returnedItems.map((detail: any) => ({
        barcode: detail.bookCopy?.barcode ?? '',
        inventoryNumber: detail.bookCopy?.inventoryNumber ?? '',
        bookTitle: detail.bookCopy?.book?.title ?? '',
        condition: detail.conditionBack ?? undefined
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

  private printHtml(html: string, printOptions?: Electron.WebContentsPrintOptions): Promise<void> {
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
          { margins: { marginType: 'default' }, printBackground: true, ...printOptions },
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
