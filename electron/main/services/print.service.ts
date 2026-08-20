import { BrowserWindow, app, dialog } from 'electron'
import { readFile, writeFile, unlink } from 'fs/promises'
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
//
// `timeoutMs` (opsional) adalah batas waktu maksimal SELURUH operasi cetak
// (P0-1). Default PRINT_HTML_TIMEOUT_MS (120 s) dipakai bila tidak diisi; nilai
// khusus (mis. 300) dipakai smoke untuk menguji jalur timeout tanpa menunggu
// 120 detik. Field ini TIDAK diteruskan ke webContents.print (di-strip di
// resolvePrintOptions) agar tidak bocor ke dialog/driver.
type PrintHtmlOptions = Electron.WebContentsPrintOptions & {
  resolveA6DeviceName?: boolean
  preferredDeviceName?: string
  timeoutMs?: number
}

// P0-1 — batas waktu cetak (ms). Nilai sengaja lapang (120 s): alur cetak
// memakai dialog OS non-silent dan operator bisa memerlukan waktu untuk memilih
// printer/kertas/mengklik Cetak pada perangkat lambat. Fungsi timeout adalah
// mengikat hang yang TIDAK PERNAH selesai (callback webContents.print tidak
// datang / dialog tersembunyi), bukan menagih operator yang wajar. Bila dialog
// dipakai normal, 120 s praktis tidak akan tercapai.
const PRINT_HTML_TIMEOUT_MS = 120_000

export class PrintService {
  constructor(
    private borrowRepository: BorrowRepository,
    private settingService: SettingService,
    private assetRoot: string = ''
  ) {}

  // Electron's webContents.print() fires callback with success=false when the
  // user cancels the print dialog. The failureReason is "Print job canceled"
  // (Electron docs, v26+). This is a normal user action, not a real failure.
  // Exact match — NOT .includes("cancel") — to avoid swallowing real errors.
  private static isPrintCancelled(failureReason?: string | null): boolean {
    return failureReason === 'Print job canceled'
  }

  // WO-LABEL — isi ulang data label dari Settings (libraryName/schoolName) dan
  // logo (data URI) persis pola buildBorrowCardHtml: resolveAssetPath adalah
  // SATU-SATUNYA pembaca logoPath (RFC §12). Logo tidak terbaca → string kosong
  // → template memakai fallback monogram. Renderer cukup mengirim items/author;
  // libraryName renderer dipertahankan bila diisi, selebihnya dari Settings.
  private async enrichLabelData(data: BookLabelData): Promise<BookLabelData> {
    const settings = await this.settingService.get()
    const resolvedLogoPath = resolveAssetPath(settings.logoPath, this.assetRoot)
    const logo = resolvedLogoPath ? await this.readFileAsDataUri(resolvedLogoPath) : null
    return {
      ...data,
      libraryName: data.libraryName ?? settings.libraryName,
      schoolName: settings.schoolName,
      logo: logo ?? '',
      barcodeFormat: data.barcodeFormat ?? settings.barcodeFormat
    }
  }

  async getLabelPreviewHtml(data: BookLabelData): Promise<string> {
    return generateLabelsHtml(await this.enrichLabelData(data))
  }

  async printBookLabels(data: BookLabelData): Promise<void> {
    const html = generateLabelsHtml(await this.enrichLabelData(data))
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

  async buildBorrowCardHtml(borrowingId: string, options?: { activeOnly?: boolean }): Promise<string> {
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
      },
      options
    )
    return generateBorrowCardHtml(data)
  }

  async getBorrowCardPreviewHtml(borrowingId: string, options?: { activeOnly?: boolean }): Promise<string> {
    return this.buildBorrowCardHtml(borrowingId, options)
  }

  async printBorrowCard(borrowingId: string, options?: { silent?: boolean; activeOnly?: boolean }): Promise<void> {
    const [html, settings] = await Promise.all([
      this.buildBorrowCardHtml(borrowingId, { activeOnly: options?.activeOnly }),
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

  async saveBorrowCardPdf(borrowingId: string, options?: { activeOnly?: boolean }): Promise<{ saved: boolean; filePath?: string }> {
    const [borrowing, html] = await Promise.all([
      this.borrowRepository.findById(borrowingId),
      this.buildBorrowCardHtml(borrowingId, { activeOnly: options?.activeOnly })
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

  private async renderPdf(html: string): Promise<Buffer> {
    // Same temp-file pattern as printHtml to avoid data: URL length limit.
    const tmpFile = join(
      app.getPath('temp'),
      `aplibrary-pdf-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.html`
    )
    await writeFile(tmpFile, html, 'utf-8')
    const fileUrl = `file:///${tmpFile.replace(/\\/g, '/')}`

    try {
      return await new Promise<Buffer>((resolve, reject) => {
        const printWindow = new BrowserWindow({
          width: 800,
          height: 600,
          show: false,
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false
          }
        })

        printWindow.loadURL(fileUrl)

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
    } finally {
      try { await unlink(tmpFile) } catch { /* best-effort cleanup */ }
    }
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

  /**
   * Return receipt preview HTML — scoped to specific returned detail IDs.
   * When detailIds is provided, only those items are shown (event-scoped receipt).
   * When detailIds is omitted, shows ALL returned items (legacy behavior).
   */
  async getReturnReceiptPreviewHtml(borrowingId: string, detailIds?: string[]): Promise<string> {
    const [borrowing, settings] = await Promise.all([
      this.borrowRepository.findById(borrowingId),
      this.settingService.get()
    ])
    if (!borrowing) {
      throw new AppError(404, 'Not Found', 'Data peminjaman tidak ditemukan.')
    }

    const idSet = detailIds && detailIds.length > 0 ? new Set(detailIds) : null
    const returnedItems = borrowing.details.filter((detail: any) => {
      if (detail.returnedAt === null) return false
      if (idSet && !idSet.has(detail.id)) return false
      return true
    })

    const data: ReturnReceiptData = {
      libraryName: settings.libraryName,
      borrowingNumber: borrowing.borrowNumber,
      memberName: borrowing.member?.fullName ?? borrowing.memberName ?? '',
      memberNumber: borrowing.member?.memberNumber ?? borrowing.memberNumber ?? '',
      returnDate: returnedItems.length > 0 && returnedItems[0].returnedAt
        ? returnedItems[0].returnedAt.toISOString()
        : new Date().toISOString(),
      items: returnedItems.map((detail: any) => ({
        barcode: detail.bookCopy?.barcode ?? '',
        inventoryNumber: detail.bookCopy?.inventoryNumber ?? '',
        bookTitle: detail.bookCopy?.book?.title ?? '',
        condition: detail.conditionBack ?? undefined
      })),
      totalItems: returnedItems.length
    }

    return this.generateReceiptHtml(data, 'PENGEMBALIAN')
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

  // P0-1 — printHtml fail-safe. Kontrak lama (resolve/reject) tidak berubah;
  // seluruh hardening bersifat aditif di dalam implementasi:
  //  - TIMEOUT menyeluruh (default PRINT_HTML_TIMEOUT_MS, override via
  //    printOptions.timeoutMs) → operasi cetak TIDAK bisa menggantung selamanya
  //    bila callback webContents.print tidak pernah datang.
  //  - CLEANUP DIJAMIN — BrowserWindow selalu ditutup tepat satu kali setelah
  //    sukses / error / timeout (settlement tunggal + teardown terpusat di
  //    `finish`; event listener dilepas sebelum close).
  //  - loadURL di-await; rejection ditangani. did-fail-load dipertahankan
  //    sebagai sumber detail error (errorCode/errorDescription).
  //  - DUA JALUR error (callback gagal, did-fail-load, loadURL reject, timeout,
  //    close) TIDAK bisa resolve/reject dua kali (guard `settled`).
  //  - Logging [Print] tahap per-tahap untuk diagnosis (mulai / loadURL /
  //    print invoked / callback / timeout / cleanup).
  private async printHtml(html: string, printOptions?: PrintHtmlOptions): Promise<void> {
    // --- FIX: write HTML to temp file to avoid Chromium data: URL length limit ---
    // Chromium kMaxURLChars = 2,097,152 chars. data:text/html URLs for large
    // label print jobs (Code39, 100+ labels) exceeded this limit causing
    // ERR_INVALID_URL. file:// URLs have no such limit.
    const tmpFile = join(
      app.getPath('temp'),
      `aplibrary-print-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.html`
    )
    await writeFile(tmpFile, html, 'utf-8')
    const fileUrl = `file:///${tmpFile.replace(/\\/g, '/')}`

    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false
        let timer: NodeJS.Timeout | null = null

        const printWindow = new BrowserWindow({
          width: 800,
          height: 600,
          show: false,
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false
          }
        })

        const timeoutMs = printOptions?.timeoutMs ?? PRINT_HTML_TIMEOUT_MS
        console.log(`[Print] printHtml start (timeout=${timeoutMs}ms, via temp file)`)

        // Settlement tunggal + cleanup terpusat. Setelah settled, semua jalur
        // (event, callback print, timer) menjadi no-op — mencegah double
        // resolve/reject dan menjamin window ditutup TEPAT SATU KALI.
        const finish = (action: () => void): void => {
          if (settled) return
          settled = true
          if (timer) {
            clearTimeout(timer)
            timer = null
          }
          if (!printWindow.isDestroyed()) {
            // Lepas handler event agar teardown window tidak memicu event
            // did-finish-load / did-fail-load tambahan setelah settlement.
            printWindow.webContents.removeAllListeners('did-finish-load')
            printWindow.webContents.removeAllListeners('did-fail-load')
            try {
              printWindow.close()
            } catch (error) {
              console.warn('[Print] cleanup: gagal menutup window print:', error)
            }
          }
          console.log('[Print] cleanup: window print ditutup')
          action()
        }
        const succeed = (): void => finish(resolve)
        const fail = (error: Error): void => finish(() => reject(error))

        timer = setTimeout(() => {
          console.log(
            `[Print] timeout ${timeoutMs}ms tercapai — proses cetak tidak selesai, dibatalkan`
          )
          fail(
            new Error(
              `Cetak tidak selesai dalam ${timeoutMs} ms — dialog cetak mungkin tersembunyi atau proses native tidak merespons. Silakan coba lagi.`
            )
          )
        }, timeoutMs)

        printWindow.webContents.on('did-finish-load', async () => {
          if (settled) return
          try {
            console.log('[Print] loadURL selesai')
            const options = await this.resolvePrintOptions(printWindow, printOptions)
            if (settled || printWindow.isDestroyed()) return
            console.log(
              `[Print] print invoked (silent=${options.silent}, deviceName=${options.deviceName ?? 'default'})`
            )
            printWindow.webContents.print(options, (success, failureReason) => {
              if (success) {
                console.log('[Print] print callback success')
                succeed()
              } else if (PrintService.isPrintCancelled(failureReason)) {
                console.log('[Print] user cancelled print dialog — treated as normal')
                succeed()
              } else {
                console.log(`[Print] print callback gagal: ${failureReason ?? 'unknown'}`)
                fail(new Error(failureReason ?? 'Gagal mencetak'))
              }
            })
          } catch (error) {
            console.warn('[Print] gagal menyiapkan opsi cetak:', error)
            fail(error instanceof Error ? error : new Error(String(error)))
          }
        })

        printWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
          console.warn(`[Print] did-fail-load (code=${errorCode}): ${errorDescription}`)
          fail(new Error(`Gagal memuat halaman cetak: ${errorDescription}`))
        })

        // loadURL via file:// — unlimited length (no data: URL kMaxURLChars limit).
        void printWindow
          .loadURL(fileUrl)
          .catch((error) => {
            console.warn('[Print] loadURL gagal:', error)
            fail(
              error instanceof Error
                ? error
                : new Error(`Gagal memuat halaman cetak: ${String(error)}`)
            )
          })
      })
    } finally {
      try { await unlink(tmpFile) } catch { /* best-effort cleanup */ }
    }
  }

  private async resolvePrintOptions(
    printWindow: BrowserWindow,
    printOptions?: PrintHtmlOptions
  ): Promise<Electron.WebContentsPrintOptions> {
    const { resolveA6DeviceName, preferredDeviceName, ...rest } = printOptions ?? {}

    // P0-1 — timeoutMs adalah opsi INTERNAL printHtml (batas waktu), bukan opsi
    // native webContents.print. Dihapus di sini agar tidak bocor ke dialog/driver
    // (mencegah TypeScript/Electron melempar pada properti tak dikenal).
    delete rest.timeoutMs

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
