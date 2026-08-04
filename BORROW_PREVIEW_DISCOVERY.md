# BORROW PREVIEW — DISCOVERY REPORT (WO-2)

> **Fase:** DISCOVERY / READ ONLY — tidak ada perubahan kode, tidak ada commit.
> **Status:** MENUNGGU REVIEW PO.
> Source of truth desain: `BORROW_RECEIPT_DESIGN_AMENDMENT.md` (FINAL DESIGN DECISION, REVISION 5 = Preview toolbar lengkap).

---

## 1. Tujuan

Menjawab 2 pertanyaan discovery:
1. Bagaimana **Label Preview** dibangun saat ini (`LabelPreviewPage`)?
2. Bagaimana **Borrow Card Preview** dapat memakai `BorrowCardService` (WO-1) **tanpa template baru**?

Hasil: basis untuk `BORROW_PREVIEW_ARCHITECTURE.md` dan `BORROW_PREVIEW_WIREFRAME.md`.

---

## 2. Discovery #1 — Bagaimana Label Preview dibangun hari ini

### 2.1 Jejak plumbung penuh (file-by-file)

| Layer | File | Peran |
|---|---|---|
| Route | `src/routes/index.tsx:62` | `books/:id/labels-preview` → `<LabelPreviewPage />` |
| Navigation | `src/utils/navigation.ts:55` | `bookLabelPreviewPath(id)` → `/books/:id/labels-preview` |
| Entry | `src/components/books/BookDetail.tsx:87-90` | Tombol "Cetak Label" → `navigate(bookLabelPreviewPath(book.id))` |
| Page | `src/pages/LabelPreviewPage.tsx` | Fetch data → bangun `BookLabelData` → ambil HTML preview → render |
| IPC | `electron/ipc/print.ipc.ts` | `printing:labelPreview` (getter), `printing:bookLabels` (print) |
| Preload | `electron/preload/print.preload.ts` | `printAPI.print.getLabelPreviewHtml` / `.bookLabels` |
| env.d.ts | `src/renderer/env.d.ts:130-135` | Kontrak tipe `print.*` |
| Template | `src/main/services/label.service.ts` | `generateLabelsHtml(data)` — SATU fungsi → dokumen HTML penuh |
| Print adapter | `electron/main/services/print.service.ts:14-21` | `getLabelPreviewHtml` = `generateLabelsHtml(data)`; `printBookLabels` = `generateLabelsHtml(data)` + `printHtml(html, {margins: none})` |

### 2.2 Alur renderer (`LabelPreviewPage.tsx`)

```
mount → Promise.all([books.findById(id), bookCopies.findByBookId(id), settings.get()])
     → bangun BookLabelData {libraryName, bookTitle, items[]}
     → api.print.getLabelPreviewHtml(data)  → string HTML
     → <div className="preview-sheet overflow-auto" dangerouslySetInnerHTML={{__html: html}} />
     → tombol Cetak → api.print.bookLabels(data)  (data yang SAMA)
```

Poin penting:
- **Renderer TIDAK punya template** — ia hanya menerima string HTML penuh dari main dan menampilkannya via `dangerouslySetInnerHTML`.
- **Preview dan Print memakai HTML yang identik** — keduanya memanggil `generateLabelsHtml(data)` yang sama (single template).
- Toolbar label preview MINIMAL: hanya tombol kembali (`navigate(-1)`) + tombol Cetak. **TIDAK ada zoom / fit / pdf** (ini yang akan ditambah untuk kartu, sudah disepakati REVISION 5).
- Container `.preview-sheet` adalah kelas CSS polos (`overflow-auto`) — definisinya ada di dokumentasi `LABEL_PREVIEW_REFINEMENT_REPORT.md:51` (dibuat polos, bukan `bg-white shadow`), bukan di file `.css` yang dicari.

### 2.3 Adapter cetak (`print.service.ts`)

- `printHtml(html, printOptions?)` → `new BrowserWindow({width:800, height:600, show:false, contextIsolation:true, nodeIntegration:false})` → `loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))` → `did-finish-load` → `webContents.print({margins: default, printBackground: true, ...printOptions}, cb)`.
- `@page { size: 110mm 60mm; margin: 0 }` di dalam template kartu menjamin ukuran cetak (untuk label: `size: A4; margin: 0`).
- **TIDAK ada jalur printToPDF** saat ini di aplikasi — Simpan PDF adalah kemampuan baru yang dibutuhkan WO-2 (via `webContents.printToPDF`).

---

## 3. Discovery #2 — Borrow Card Preview tanpa template baru

### 3.1 Engine WO-1 sudah siap dikonsumsi

`src/main/services/borrow-card.service.ts` sudah menyediakan:

| Fungsi | Kebutuhan preview |
|---|---|
| `buildBorrowCardData(borrowing, settings, {readFileAsDataUri})` | Assembler — menyiapkan `BorrowCardData` (semua string siap-render, SVG QR/avatar/logo di-generate) |
| `generateBorrowCardHtml(data)` | **Template TUNGGAL** — mengembalikan DOKUMEN HTML PENUH (`<!DOCTYPE html>` … `</html>`) berisi semua halaman kartu sebagai blok `.sheet` (110×60mm, auto-pagination, `@media print` reset margin) |

Karena template mengembalikan **dokumen penuh** (bukan fragmen), preview cukup:
- main: bangun data → `generateBorrowCardHtml(data)` → kirim string ke renderer via IPC;
- renderer: render string dalam `.preview-sheet` (pola persis `LabelPreviewPage.tsx:103`);
- print: panggil fungsi yang sama lalu `printHtml(html, {margins:{marginType:'none'}})` — **halaman print identik dengan halaman preview** (pola identik `printBookLabels`).

**TIDAK perlu template baru, TIDAK perlu DTO baru di renderer, TIDAK ada perubahan schema/migration/repository.**

### 3.2 Sumber data — sudah cocok tanpa modifikasi

- `borrowInclude` (`src/main/repositories/borrow.repository.ts:16-25`) sudah memuat `member: true` + `details.bookCopy.book` → memenuhi `BorrowCardSourceBorrowing` (`borrow-card.service.ts:296-310`).
- `Borrow.className String?` (schema.prisma:265) → dipakai `buildBorrowCardData` (`borrowing.className`).
- `Borrow.memberName`/`memberNumber` = snapshot → fallback bila relasi member null.
- `SettingService.get()` (setting.service.ts) mengembalikan `libraryName`, `schoolName`, `logoPath`, `librarianName` — semua field yang dibutuhkan `BorrowCardSourceSettings`.
- `PrintService` sudah ter-inject `borrowRepository` + `settingService` (bootstrap.ts:108) → preview/print/pdf kartu cukup **menambah metode pada PrintService**, tidak perlu instantiasi baru di bootstrap.

### 3.3 Verifikasi belum ada wiring

Grep `borrowCard|BorrowCard|borrow-card` pada seluruh `electron/` = **0 match**. Engine WO-1 adalah modul murni; belum ada IPC/preload/env.d.ts/UI yang mengkonsumsinya. WO-2 adalah WO pertama yang menghubungkan.

### 3.4 Kesimpulan discovery

Arsitektur paling sederhana (detail di `BORROW_PREVIEW_ARCHITECTURE.md`):

```
BorrowingsPage (Simpan sukses) → navigate('/borrowings/:id/receipt-preview')
   └─ BorrowReceiptPreviewPage
        ├─ mount → api.print.borrowCardPreview(id)  → string HTML
        ├─ render → .preview-sheet + transform scale(zoom)
        ├─ Cetak     → api.print.borrowCard(id)     → printHtml (HTML yang SAMA)
        └─ Simpan PDF → api.print.borrowCardPdf(id) → printToPDF + dialog.save
```

**Dasar fakta:** preview, print, dan PDF berbagi SATU panggilan `generateBorrowCardHtml(data)` di sisi main; renderer hanya menampilkan/mentrigger. Ini memenuhi keputusan "single template" dan "tidak ada business rule di renderer".

---

## 4. Risiko & catatan

| Item | Catatan |
|---|---|
| Zoom via `transform: scale` | Container `.preview-sheet` harus dibungkus div berskala; tinggi container dihitung ulang (`sheetHeight × zoom`) agar scrollbar benar (spesifikasi REVISION 5:169-172). |
| `printToPDF` belum pernah dipakai di repo | `webContents.printToPDF` membutuhkan hidden `BrowserWindow` yang sudah `did-finish-load`; format `A4`/custom via options. Ini jalur baru (rendah risiko, API Electron standar). |
| `dialog.showSaveDialog` (D16) | Pola belum ada di repo (grep di luar scope discovery ini); implementasi memakai `dialog` dari `electron` + `BrowserWindow.getFocusedWindow()` sebagai parent. |
| Path preview = `borrowings/:id/receipt-preview` | Ditetapkan di `BORROW_RECEIPT_DISCOVERY_REPORT.md` (tabel WO-2). Harus konsisten antara `navigation.ts`, `routes/index.tsx`, dan `BorrowingsPage`. |
| Halaman 2+ (lanjutan) | Template sudah memuatnya sebagai blok `.sheet`; preview menampilkan semua sheet dalam satu scroll (bukan tab) — perilaku disetujui REVISION 5:172. |
