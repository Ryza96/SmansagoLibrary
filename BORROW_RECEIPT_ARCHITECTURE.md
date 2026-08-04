# BORROW RECEIPT REDESIGN — ARCHITECTURE

| | |
|---|---|
| **WO** | Borrow Receipt Redesign — Phase 1 Discovery & Design |
| **Mode** | DISCOVERY ONLY / READ ONLY |
| **Tanggal** | 2026-08-04 |
| **Status** | Menunggu approval Product Owner |

Dokumen ini menjawab pertanyaan PO #6: **usulan arsitektur Preview** yang menjamin **SATU TEMPLATE** untuk Preview / Print / PDF, tanpa mengubah business logic Borrow.

---

## 1. Prinsip Arsitektur (Mandat PO)

1. **SATU template** `generateBorrowCardHtml(data)` — satu-satunya sumber rendering. Preview, print, dan PDF memanggil fungsi yang sama. Dilarang ada HTML kedua.
2. **Template = pure function** `(data) => string HTML`, tanpa akses Electron API / DB — mudah diuji (pola `label.service.ts`, `decide()` P-1).
3. **Data assembly terpisah dari template** — service menyiapkan `BorrowCardData` (termasuk QR svg & logo data URI), template hanya merender.
4. **PrintService = adapter tipis** — fetch data → panggil template → cetak/PDF. Tidak berisi logika HTML.
5. **Tidak mengubah business logic Borrow** — `BorrowService.create()`, repository, schema tidak tersentuh.
6. **Kartu fisik 110mm × 60mm landscape** dipertahankan persis di semua media (preview/print/pdf).

---

## 2. Diagram Alur Target

```
RENDERER  BorrowingsPage.tsx
   │  Klik "SIMPAN TRANSAKSI" → borrowings.create(input)   [TIDAK DIUBAH]
   │  sukses → navigate('/borrowings/:id/receipt-preview')
   ▼
RENDERER  BorrowReceiptPreviewPage.tsx (BARU)
   ├─ mount → api.print.borrowCardPreview(id) ────────────────────────────┐
   │                                                                      │
   │   ┌───────────────────────────────────────────────────────────────┐  │
   │   │ MAIN                                                            │  │
   │   │  printing:borrowCardPreview (IPC, read-only, TANPA window)      │  │
   │   │   PrintService.getBorrowCardPreviewHtml(id)                     │  │
   │   │     ├─ borrowRepository.findById(id)  (read-only)               │  │
   │   │     ├─ settingService.get()                                     │  │
   │   │     └─ buildBorrowCardData(...) → generateBorrowCardHtml(data)  │  │
   │   └───────────────────────────────────────────────────────────────┘  │
   │   └─ HTML string → render di .preview-sheet (dangerouslySetInnerHTML)│
   │                                                                      │
   ├─ Tombol "CETAK"  → api.print.borrowCard(id) ─────────────────────┐   │
   │   printing:borrowCard → printBorrowCard(id)                       │   │
   │     ├─ buildBorrowCardData → generateBorrowCardHtml (SAMA)        │   │
   │     └─ printHtml(html, {pageSize 110x60mm, margin none})          │   │
   │         → hidden BrowserWindow → webContents.print                │   │
   │         → ★ Windows Print Dialog ★ (setelah PREVIEW, bukan otomatis)│  │
   │                                                                   │   │
   └─ Tombol "SIMPAN PDF" → api.print.borrowCardPdf(id) ───────────────┤   │
       printing:borrowCardPdf → saveBorrowCardPdf(id)                  │   │
         ├─ buildBorrowCardData → generateBorrowCardHtml (SAMA)        │   │
         ├─ hidden BrowserWindow → webContents.printToPDF → Buffer     │   │
         └─ dialog.showSaveDialog → fs.writeFile(.pdf)                 │   │
                                                                       │   │
   Tombol "TUTUP" → navigate(-1) kembali ke halaman Peminjaman         │   │
                                                                       │   │
   ┌───────────────────────────────────────────────────────────────────┼──┘
   │  KETIGA JALUR MEMANGGIL generateBorrowCardHtml() YANG SAMA         │
   └────────────────────────────────────────────────────────────────────┘
```

---

## 3. Komponen per Lapisan

### 3.1 Renderer

**File baru:**
- `src/pages/BorrowReceiptPreviewPage.tsx` — halaman preview kartu pinjam.
  - Mount: `const html = await api.print.borrowCardPreview(id)` → `setHtml(html)`.
  - Render: `<div className="preview-sheet" dangerouslySetInnerHTML={{ __html: html }} />` (pola `LabelPreviewPage.tsx:103`).
  - Toolbar: tombol **Cetak**, **Simpan PDF**, **Tutup** (icon `Printer`, `FileDown`, `X` dari lucide-react).
  - State: `loading`, `error`, `html`, `busy` (disable tombol selama proses).
  - Sukses PDF: tampilkan path tersimpan (via alert / teks status).
  - Tidak ada business rule di renderer — hanya memanggil channel dan menampilkan hasil.

**File diubah:**
- `src/pages/BorrowingsPage.tsx` — setelah `create()` sukses (:125-127), ganti `setLastSuccessBorrowingId` + alert menjadi `navigate(receiptPreviewPath(result.id))`. Kotak hijau "CETAK BUKTI" dihapus. **Blok create tidak diubah** — hanya perilaku pasca-sukses.
- `src/routes/index.tsx` — tambah route `borrowings/:id/receipt-preview` → `BorrowReceiptPreviewPage`.
- `src/utils/navigation.ts` — tambah `ROUTES.BORROW_RECEIPT_PREVIEW` + `receiptPreviewPath(id)`.
- `src/utils/labels.ts` — blok label `BORROW_CARD` (PREVIEW_TITLE, PRINT, SAVE_PDF, CLOSE, PRINTING, SAVING, PDF_SAVED, ERROR).
- `src/components/layout/Sidebar.tsx` — **tidak perlu diubah** (preview dicapai via redirect, bukan menu).

### 3.2 IPC

**File baru:** tidak ada (ditambah ke file existing).

**File diubah: `electron/ipc/print.ipc.ts`** — tambah 3 channel:
```ts
ipcMain.handle('printing:borrowCardPreview', (_e, id) => printService.getBorrowCardPreviewHtml(id))
ipcMain.handle('printing:borrowCard',        (_e, id) => printService.printBorrowCard(id))
ipcMain.handle('printing:borrowCardPdf',     (_e, id) => printService.saveBorrowCardPdf(id))
```
> Channel lama `printing:borrowReceipt`/`returnReceipt`/`bookLabels`/`labelPreview` **tetap ada** selama transisi.

**File diubah: `electron/preload/print.preload.ts`**:
```ts
borrowCardPreview: (id: string) => ipcRenderer.invoke('printing:borrowCardPreview', id),
borrowCard:        (id: string) => ipcRenderer.invoke('printing:borrowCard', id),
borrowCardPdf:     (id: string) => ipcRenderer.invoke('printing:borrowCardPdf', id),
```

**File diubah: `src/renderer/env.d.ts`** — blok `print` (:130-135) + 3 entri baru.

### 3.3 Service (data assembly + template)

**File baru: `src/main/services/borrow-card.service.ts`** — jantung arsitektur.

```ts
// 1) DATA CONTRACT (pure data, semua string/date sudah diformat)
export interface BorrowCardData {
  libraryName: string
  schoolName: string
  logoDataUri: string | null      // logo di-inline base64 (blok file://)
  borrowNumber: string
  statusLabel: string             // 'DIPINJAM' | 'SELESAI'
  borrowDate: string              // 'dd MMMM yyyy'
  dueDate: string
  librarianName: string
  member: { name: string; number: string; typeLabel: string; className: string | null; photoDataUri: string | null }
  items: Array<{ title: string; inventoryNumber: string }>
  totalItems: number
  qrCodeSvg: string               // QR transaksi (nilai = borrowNumber)
}

// 2) DATA ASSEMBLER — akses repository/DB, hasilnya data murni
export async function buildBorrowCardData(
  borrowing: BorrowWithRelations,   // hasil borrowRepository.findById
  settings: Setting,
  deps: { readFileAsDataUri: (p: string) => Promise<string | null> }
): Promise<BorrowCardData> { ... }

// 3) TEMPLATE TUNGGAL — pure function, TANPA Electron API
export function generateBorrowCardHtml(data: BorrowCardData): string { ... }
```

Logika assembler:
- **Jenis Anggota**: `memberTypeLabel(member.memberType)` (config `src/shared/config/member-type.ts`).
- **Kelas**: `borrowing.className` (snapshot pada Borrow) — siswa saja; null/guru/umum → baris kelas disembunyikan.
- **Status**: `borrowing.returnDate ? 'SELESAI' : 'DIPINJAM'`.
- **Petugas**: `settings.librarianName` (tidak ada field officer per transaksi).
- **Logo**: `settings.logoPath` → baca file (fs, `readFileAsDataUri`) → data URI. Kosong → placeholder gambar sekolah/absen.
- **QR**: `generateQrCodeSvg(borrowing.borrowNumber)` → SVG inline.
- **Foto anggota**: jika `Member.photoPath` (WO masa depan) → data URI; Phase 1 → `null` → template merender avatar inisial.

### 3.4 Print Service (adapter)

**File diubah: `electron/main/services/print.service.ts`** — tambah 3 method, refactor kecil:

```ts
async getBorrowCardPreviewHtml(id: string): Promise<string> {
  const data = await this.loadBorrowCardData(id)          // read-only
  return generateBorrowCardHtml(data)                      // SATU template
}

async printBorrowCard(id: string): Promise<void> {
  const data = await this.loadBorrowCardData(id)
  const html = generateBorrowCardHtml(data)                // SAMA
  await this.printHtml(html, BORROW_CARD_PRINT_OPTIONS)    // pageSize 110x60mm, margin none
}

async saveBorrowCardPdf(id: string): Promise<{ saved: boolean; filePath?: string; canceled?: boolean }> {
  const data = await this.loadBorrowCardData(id)
  const html = generateBorrowCardHtml(data)                // SAMA
  const buffer = await this.renderPdf(html)                // printToPDF
  return savePdfViaDialog(buffer)                          // dialog.showSaveDialog + fs.writeFile
}
```

**Print options kartu** (`BORROW_CARD_PRINT_OPTIONS`):
```ts
{
  pageSize: { width: 110000, height: 60000 },  // micron = 110mm × 60mm
  margins: { marginType: 'none' },
  printBackground: true
}
```
> Catatan printer: kartu 110×60mm bersifat non-standar; bila printer tidak mendukung custom paper size, HTML tetap 110×60mm dan dipusatkan — perilaku printer di luar kendali app. Di-tag sebagai catatan implementasi, bukan blokir.

**`printHtml` refactor opsional (non-breaking):** ubah signature menjadi `printHtml(html, options?)` — sudah mendukung `printOptions` (lihat `:135`), hanya perlu memastikan `pageSize` diteruskan. Tidak menghapus perilaku lama.

**`renderPdf` (baru):** hidden `BrowserWindow` → `loadURL(data:text/html;...)` → `webContents.printToPDF({ printBackground: true, pageSize: 'Custom', ... })` → `Buffer`. Memakai **HTML yang sama** dari template.

**`savePdfViaDialog` (baru):** pola persis `electron/ipc/member.ipc.ts:16-47`:
```ts
const { canceled, filePath } = await dialog.showSaveDialog(parentWindow, {
  title: 'Simpan Kartu Peminjaman (PDF)',
  defaultPath: `Kartu_Peminjaman_${borrowNumber}.pdf`,
  filters: [{ name: 'PDF', extensions: ['pdf'] }]
})
if (canceled || !filePath) return { canceled: true }
await fs.promises.writeFile(filePath, buffer)
return { saved: true, filePath }
```
> Agar `parentWindow` tersedia, handler IPC PDF menerima `IpcMainInvokeEvent` dan memakai `BrowserWindow.fromWebContents(event.sender)` (pola `member.ipc.ts:23`).

### 3.5 Template (isi HTML)

`generateBorrowCardHtml(data)` menghasilkan dokumen:
```html
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Kartu Peminjaman</title>
<style>
  @page { size: 110mm 60mm; margin: 0; }
  html, body { margin:0; padding:0; }
  .borrow-card { width:110mm; height:60mm; box-sizing:border-box;
                 display:flex; flex-direction:column; ... }
  /* zona: header / body / daftar buku / footer */
</style></head>
<body><div class="borrow-card"> ... </div></body></html>
```
Struktur zona — rinci di **`BORROW_RECEIPT_WIREFRAME.md`**. Semua isi di-escape (`escapeHtml`, pola `label.service.ts:28-35`); QR & logo sudah berupa data URI/SVG yang aman.

### 3.6 PDF Generator

- **Tidak ada dependency baru.** Elektron menyediakan `webContents.printToPDF()`; satu-satunya penambahan adalah method `renderPdf` di PrintService + save dialog (keduanya memakai API Electron bawaan).
- Alasan memilih `printToPDF` di atas library lain (pdfkit/puppeteer): **memakai HTML yang sama persis** dengan preview/print → mandat SATU TEMPLATE terpenuhi secara struktural, bukan dengan konversi ulang.

---

## 4. Diagram Data & Kontrak

```
BorrowCardData  (src/shared/dto/print.ts — diperluas / file baru borrow-card dto)
│
├─ header : libraryName · schoolName · logoDataUri
├─ member : name · number · typeLabel · className? · photoDataUri?
├─ trans  : borrowNumber · borrowDate · dueDate · librarianName
├─ items  : [{ title, inventoryNumber }]
├─ footer : totalItems · qrCodeSvg · statusLabel
```

Sumber kolom:
| Field kartu | Sumber | Query |
|---|---|---|
| libraryName / schoolName / logoPath / librarianName | `Setting` | `settingService.get()` (1 query) |
| borrowNumber / borrowDate / dueDate / returnDate / className | `Borrow` | `borrowRepository.findById(id)` |
| memberName / memberNumber / memberType | `Member` (via include `member: true`) | idem |
| judul + nomor inventaris per buku | `BorrowDetail.bookCopy.book.title` / `bookCopy.inventoryNumber` | idem |
| totalItems | `details.length` | idem |

> Satu `findById` + satu `get()` sudah mencakup **seluruh** data kartu — tidak ada query tambahan per buku (batch lookup sudah tertanam di `borrowInclude`).

---

## 5. File Plan (Baru / Diubah)

| File | Aksi |
|---|---|
| `src/shared/dto/print.ts` | **Diubah** — tambah `BorrowCardData` (atau file DTO baru `src/shared/dto/borrow-card.ts`) |
| `src/main/services/borrow-card.service.ts` | **BARU** — assembler + template tunggal |
| `src/main/services/barcode.service.ts` | **Diubah** — tambah `generateQrCodeSvg(value)` (bcid `qrcode`) |
| `electron/main/services/print.service.ts` | **Diubah** — +`getBorrowCardPreviewHtml`, +`printBorrowCard`, +`saveBorrowCardPdf`, +`renderPdf`, +`savePdfViaDialog`, +`BORROW_CARD_PRINT_OPTIONS`; pasang `printHtml` reuse |
| `electron/ipc/print.ipc.ts` | **Diubah** — +3 channel `printing:borrowCard*` (PDF handler terima `IpcMainInvokeEvent`) |
| `electron/preload/print.preload.ts` | **Diubah** — +`print.borrowCardPreview/borrowCard/borrowCardPdf` |
| `src/renderer/env.d.ts` | **Diubah** — +3 entri di blok `print` |
| `src/pages/BorrowReceiptPreviewPage.tsx` | **BARU** — halaman preview + 3 tombol |
| `src/pages/BorrowingsPage.tsx` | **Diubah** — pasca-save → `navigate(receiptPreviewPath(id))`; kotak hijau lama dihapus |
| `src/routes/index.tsx` | **Diubah** — route `borrowings/:id/receipt-preview` |
| `src/utils/navigation.ts` | **Diubah** — +`ROUTES.BORROW_RECEIPT_PREVIEW` + `receiptPreviewPath(id)` |
| `src/utils/labels.ts` | **Diubah** — blok `BORROW_CARD` |
| `electron/main/bootstrap.ts` | **TIDAK diubah** — `PrintService` konstruktor tetap (repository+setting sudah tersedia) |

**TIDAK disentuh:** `BorrowService` / `borrow.repository` (create logic), schema/migration, `returns` flow (jalur cetak bukti pengembalian legacy tetap berjalan), channel legacy print, dependency `package.json`.

---

## 6. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Kartu 110×60mm tidak didukung printer | `pageSize` custom + fallback margin none; HTML tetap ukuran pasti |
| `file://` logo diblokir di `data:` URL | Service meng-inline logo → data URI sebelum template |
| Foto anggota belum ada di schema | Phase 1: avatar inisial; WO terpisah bila PO minta `Member.photoPath` |
| `printToPDF` pertama kali di repo | Di-cover smoke WO-5 (generate buffer → validasi `%PDF` magic bytes) |
| Regresi channel legacy | Channel lama dipertahankan sampai WO-5; smoke membandingkan HTML preview==print |
| `dangerouslySetInnerHTML` XSS | Semua data user-visible di-escape `escapeHtml`; QR/logo SVG dihasilkan service |

---

## 7. Strategi Smoke (WO-5 ringkas)

1. **Single-template invariant**: panggil `buildBorrowCardData` sekali → `generateBorrowCardHtml` → string A (preview). `printBorrowCard`/`saveBorrowCardPdf` memakai assembler yang sama → assert HTML identik string A. Bukti "satu template" tanpa refactor.
2. **Data mapping**: seed borrow 2 buku → assert 14 elemen kartu benar (nama, no, jenis, kelas, tanggal, petugas, judul+inventaris, total, status, QR non-kosong, logo fallback).
3. **QR**: SVG berisi elemen `<svg` + dimensi wajar.
4. **PDF**: `renderPdf` → buffer diawali `%PDF`; save dialog di-stub.
5. **Regression**: `npm run lint`, `npm run build`, suite existing (borrow/IT-1) tetap hijau.
