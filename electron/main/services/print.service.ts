import { BrowserWindow, app, dialog } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { AppError } from '../errorHandler'
import { BorrowRepository } from '../../../src/main/repositories/borrow.repository'
import { SettingService } from './setting.service'
import { generateLabelsHtml } from '../../../src/main/services/label.service'
import { BORROW_CARD_LAYOUT, buildBorrowCardData, generateBorrowCardHtml } from '../../../src/main/services/borrow-card.service'
import { resolveAssetPath } from '../../../src/main/infrastructure/asset/asset-resolver'
import type { BorrowReceiptData, ReturnReceiptData, BookLabelData, PrinterInfoDTO } from '../../../src/shared/dto/print'

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

// A6 fisik = 105×148 mm; nilai SSOT dimensi kartu = BORROW_CARD_LAYOUT (105×148mm).
// Petunjuk nama untuk mendeteksi printer kartu/A6. Electron 33 tidak mengekspos
// PrinterInfo.pageSizes / supportsCustomPageSizes (keduanya baru ada di Electron
// ≥34), jadi deteksi ini bersifat heuristic berbasis nama (lihat resolveA6Printer).
const A6_PRINTER_NAME_HINTS: ReadonlyArray<string> = [
  'a6',
  'kartu',
  'card',
  'label',
  'ql-',
  'ql ',
  '105x148',
  '105×148'
]

// Opsi internal printHtml — perluasan dari WebContentsPrintOptions. `silent` dan
// field lain sudah ada di tipe bawaan Electron; `resolveA6DeviceName` meminta
// printHtml memilih printer A6 secara eksplisit via getPrintersAsync();
// `preferredDeviceName` (dari Settings → borrowCardPrinter) DIUTAMAKAN daripada
// heuristik nama.
type PrintHtmlOptions = Electron.WebContentsPrintOptions & {
  resolveA6DeviceName?: boolean
  preferredDeviceName?: string
}

export class PrintService {
  constructor(
    private borrowRepository: BorrowRepository,
    private settingService: SettingService,
    private assetRoot: string = ''
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
    // WO-1 (LOGO MANAGEMENT — FOUNDATION) — resolveAssetPath adalah SATU-SATUNYA
    // pembaca logoPath (RFC §12). Relatif baru / absolut lama di-resolve ke path
    // absolut (atau null → logo kosong → fallback monogram). buildBorrowCardData
    // TIDAK berubah — resolver di-inject di titik readFileAsDataUri.
    const resolvedLogoPath = resolveAssetPath(settings.logoPath, this.assetRoot)
    const data = await buildBorrowCardData(
      borrowing,
      { ...settings, logoPath: resolvedLogoPath ?? '' },
      {
        readFileAsDataUri: this.readFileAsDataUri.bind(this)
      }
    )
    return generateBorrowCardHtml(data)
  }

  async getBorrowCardPreviewHtml(borrowingId: string): Promise<string> {
    return this.buildBorrowCardHtml(borrowingId)
  }

  async printBorrowCard(borrowingId: string, options?: { silent?: boolean }): Promise<void> {
    const [html, settings] = await Promise.all([
      this.buildBorrowCardHtml(borrowingId),
      this.settingService.get()
    ])

    // Printer pilihan user (Settings → borrowCardPrinter) lebih diutamakan
    // daripada heuristik nama A6 — pemilik printer kartu tahu printer mana yang
    // benar; heuristik hanya jadi fallback bila nilai belum diisi ('').
    const preferredDeviceName = settings.borrowCardPrinter?.trim() || undefined

    await this.printHtml(html, {
      margins: { marginType: 'none' },
      // Kartu cetak A6 105×148mm (bukan lagi 110×60mm). Satuan Size = mikron
      // (105mm=105000, 148mm=148000). Nilai diambil dari BORROW_CARD_LAYOUT agar
      // SSOT dimensi kartu tetap 1 tempat.
      pageSize: {
        width: BORROW_CARD_LAYOUT.pageWidthMm * 1000,
        height: BORROW_CARD_LAYOUT.pageHeightMm * 1000
      },
      // silent:true → cetak langsung tanpa dialog OS, pakai deviceName + pageSize
      // yang sudah dipastikan A6 (tanpa risiko user/driver mengganti ukuran kertas).
      // silent:false (default) → dialog cetak OS tetap muncul; hasil bergantung
      // pilihan kertas di dialog tersebut.
      silent: options?.silent === true,
      // Minta printHtml memilih printer A6 secara eksplisit via getPrintersAsync()
      // bila user belum memilih printer tetap (preferredDeviceName kosong).
      resolveA6DeviceName: true,
      preferredDeviceName
    })
  }

  // Daftar printer sistem untuk UI Settings (pemilih printer kartu peminjaman).
  // getPrintersAsync hanya tersedia via webContents → butuh BrowserWindow tersembunyi.
  async listPrinters(): Promise<PrinterInfoDTO[]> {
    const window = new BrowserWindow({
      width: 800,
      height: 600,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    try {
      const printers = await window.webContents.getPrintersAsync()
      return printers.map((p) => ({
        name: p.name,
        displayName: p.displayName,
        description: p.description,
        isDefault: p.isDefault,
        status: p.status
      }))
    } finally {
      if (!window.isDestroyed()) window.close()
    }
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

  private printHtml(html: string, printOptions?: PrintHtmlOptions): Promise<void> {
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
          const options = await this.resolvePrintOptions(printWindow, printOptions)
          printWindow.webContents.print(options, (success, failureReason) => {
            if (!printWindow.isDestroyed()) printWindow.close()
            if (success) {
              resolve()
            } else {
              reject(new Error(failureReason ?? 'Gagal mencetak'))
            }
          })
        } catch (error) {
          if (!printWindow.isDestroyed()) printWindow.close()
          reject(error instanceof Error ? error : new Error(String(error)))
        }
      })

      printWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
        if (!printWindow.isDestroyed()) printWindow.close()
        reject(new Error(`Gagal memuat halaman cetak: ${errorDescription}`))
      })
    })
  }

  private async resolvePrintOptions(
    printWindow: BrowserWindow,
    printOptions?: PrintHtmlOptions
  ): Promise<Electron.WebContentsPrintOptions> {
    const { resolveA6DeviceName, preferredDeviceName, ...rest } = printOptions ?? {}

    // Base opsi DIEKSPLISITKAN (tidak mengandalkan default Chromium) agar driver
    // tidak menerapkan orientasi/scaling sendiri:
    //  - landscape: false → portrait eksplisit (cegah sisa setting kartu 110×60 lama)
    //  - scaleFactor: 1   → skala 100% eksplisit. CATATAN: scaleFactor adalah
    //    FAKTOR (1 = 100%), BUKAN persen — nilai 100 justru = 100× zoom.
    //  - silent: false    → dialog cetak OS muncul (perilaku lama)
    const options: Electron.WebContentsPrintOptions = {
      margins: { marginType: 'default' },
      printBackground: true,
      landscape: false,
      scaleFactor: 1,
      silent: false,
      ...rest
    }

    // Prioritas deviceName: (1) deviceName eksplisit, (2) preferredDeviceName dari
    // Settings (borrowCardPrinter), (3) heuristik nama A6. deviceName eksplisit
    // (dikirim pemanggil) tetap menang; heuristik hanya bila keduanya kosong.
    if (!options.deviceName && preferredDeviceName) {
      options.deviceName = preferredDeviceName
      console.log(`[Print] deviceName dipakai dari Settings: "${preferredDeviceName}"`)
    }

    if (resolveA6DeviceName && !options.deviceName) {
      const target = await this.resolveA6Printer(printWindow)
      if (target) {
        options.deviceName = target.name
        console.log(`[Print] deviceName dipaksa ke printer A6: "${target.displayName ?? target.name}"`)
      }
    }

    return options
  }

  private async resolveA6Printer(printWindow: BrowserWindow): Promise<Electron.PrinterInfo | null> {
    let printers: Electron.PrinterInfo[]
    try {
      printers = await printWindow.webContents.getPrintersAsync()
    } catch (error) {
      console.warn('[Print] getPrintersAsync() gagal — fallback ke printer default sistem:', error)
      return null
    }

    if (!printers.length) {
      console.warn('[Print] Tidak ada printer terdeteksi — fallback ke printer default sistem.')
      return null
    }

    const defaultPrinter = printers.find((p) => p.isDefault) ?? printers[0]
    console.log(`[Print] Printer default: "${defaultPrinter.displayName ?? defaultPrinter.name}" (status: ${defaultPrinter.status})`)
    console.log(
      '[Print] Daftar printer: ' +
        printers.map((p) => `"${p.displayName ?? p.name}"${p.isDefault ? ' [default]' : ''}`).join(', ')
    )

    const matchesHint = (p: Electron.PrinterInfo): boolean =>
      A6_PRINTER_NAME_HINTS.some((hint) =>
        `${p.name} ${p.displayName} ${p.description}`.toLowerCase().includes(hint)
      )

    const candidates = printers.filter(matchesHint)
    if (!candidates.length) {
      console.warn(
        '[Print] Tidak ada printer A6/kartu terdeteksi dari nama printer — deviceName dibiarkan ' +
          'default sistem; pastikan kertas A6 (105×148mm) dipilih di dialog cetak OS.'
      )
      return null
    }

    const target = candidates.find((p) => p.isDefault) ?? candidates[0]
    console.log(
      `[Print] Printer A6/kartu terdeteksi: "${target.displayName ?? target.name}"${target.isDefault ? ' (default)' : ''}`
    )
    return target
  }
}
