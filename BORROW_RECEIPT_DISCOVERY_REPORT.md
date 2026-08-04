# BORROW RECEIPT REDESIGN — DISCOVERY REPORT

| | |
|---|---|
| **WO** | Borrow Receipt Redesign — Phase 1 Discovery & Design |
| **Mode** | DISCOVERY ONLY / READ ONLY |
| **Tanggal** | 2026-08-04 |
| **Status** | Menunggu approval Product Owner |

---

## 1. Proses Cetak Saat Ini

Alur dari **"Simpan Transaksi"** hingga **Windows Print Dialog**:

```
┌────────────────────────────────────────────────────────────────────────────┐
│ RENDERER (src/pages/BorrowingsPage.tsx)                                    │
│                                                                            │
│ 1. Klik "SIMPAN TRANSAKSI"  → handleSave() (:117)                          │
│    └─ window.electronAPI.borrowings.create(input) (:125)                   │
│        → BorrowService.create() (src/main/services/borrow.service.ts:128)  │
│        → BorrowRepository.createWithItems() (transaksi atomic)             │
│    └─ sukses → setLastSuccessBorrowingId(result.id) (:126)                 │
│                 alert("Transaksi berhasil disimpan.") (:127)               │
│                 form di-reset, muncul kotak hijau + tombol "CETAK BUKTI"   │
│                                                                            │
│ 2. Klik "CETAK BUKTI" → handlePrintReceipt() (:143)                        │
│    └─ window.electronAPI.print.borrowReceipt(id) (:147)                    │
│        ────────────────────────────────────────────────────────────────    │
│        PRELOAD electron/preload/print.preload.ts:7                         │
│          borrowReceipt: (id) => ipcRenderer.invoke('printing:borrowReceipt')│
│        ────────────────────────────────────────────────────────────────    │
│        IPC MAIN electron/ipc/print.ipc.ts:9                                │
│          ipcMain.handle('printing:borrowReceipt')                          │
│        ────────────────────────────────────────────────────────────────    │
│        SERVICE electron/main/services/print.service.ts                     │
│          1. printBorrowReceipt(id) (:23)                                   │
│             ├─ borrowRepository.findById(id)  → data peminjaman lengkap    │
│             ├─ settingService.get()           → libraryName                │
│             ├─ mapping → BorrowReceiptData    (:32-45)                      │
│             └─ generateReceiptHtml(data,'PEMINJAMAN') (:47) → html         │
│          2. printHtml(html) (:135)                                          │
│             ├─ new BrowserWindow(800×600, show:false) (:137)               │
│             ├─ loadURL('data:text/html;charset=utf-8,' + encodeURIComponent)│
│             ├─ did-finish-load → webContents.print(...) (:150)             │
│             └─ ★ WINDOWS PRINT DIALOG TERBUKA ★                            │
└────────────────────────────────────────────────────────────────────────────┘
```

**Temuan kunci:**
- Cetak = `webContents.print()` yang **langsung membuka dialog printer**. Tidak ada tahap preview.
- Alur pasca-simpan saat ini adalah **dua langkah manual** (SIMPAN → lalu tombol CETAK BUKTI muncul), namun hasilnya tetap langsung ke dialog printer — sesuai keluhan PO.
- Jalur print **tidak menulis ke DB apa pun** (read-only), sehingga aman untuk dipisah dari logika create.

---

## 2. File yang Terlibat

### Jalur produksi (borrow)
| Layer | File | Peran |
|---|---|---|
| Renderer | `src/pages/BorrowingsPage.tsx` | Form + trigger create & cetak |
| Preload | `electron/preload/print.preload.ts` | `print.borrowReceipt` → `printing:borrowReceipt` |
| IPC | `electron/ipc/print.ipc.ts` | Handler `printing:borrowReceipt` |
| Service | `electron/main/services/print.service.ts` | Data assembly + HTML template + cetak |
| Repository | `src/main/repositories/borrow.repository.ts` | `findById` (include details.bookCopy.book + member) |
| Service (setting) | `electron/main/services/setting.service.ts` | `settingService.get()` |
| DTO | `src/shared/dto/print.ts` | `BorrowReceiptData` / `ReturnReceiptData` / `BookLabelData` |
| Type | `src/renderer/env.d.ts` | Blok `print` (`:130-135`) |
| Bootstrap | `electron/main/bootstrap.ts` | `new PrintService(borrowRepository, settingService)` (`:108`) |

### Jalur analog yang SUDAH punya pola "Preview + satu template" (referensi)
| Layer | File | Peran |
|---|---|---|
| Template tunggal | `src/main/services/label.service.ts` | `generateLabelsHtml()` dipakai preview DAN print |
| Preview | `src/pages/LabelPreviewPage.tsx` | Fetch data → `getLabelPreviewHtml` → render HTML |
| IPC preview | `electron/ipc/print.ipc.ts:6` | `printing:labelPreview` (read-only, tanpa window) |
| Print | `electron/main/services/print.service.ts:18` | `printBookLabels` (pakai `generateLabelsHtml` sama) |

> **Ini persis pola yang PO minta**: satu template untuk Preview / Print / PDF. Sudah terbukti berjalan di fitur Label Buku (Sprint 9 / WO-8 refinement).

---

## 3. Mekanisme Cetak Saat Ini

- **HTML**: Ya — template inline string concatenation di `print.service.ts` (`generateReceiptHtml`).
- **BrowserWindow**: Ya — hidden `BrowserWindow` 800×600 (`show:false`, `contextIsolation:true`, `nodeIntegration:false`).
- **webContents.print()**: Ya — dipanggil pada `did-finish-load`, options `{ margins: { marginType: 'default' }, printBackground: true }`.
- **PDF**: **TIDAK ADA.** Tidak ada `webContents.printToPDF()` di seluruh codebase (grep = 0 match).
- **File lokal (logo/foto)**: **TIDAK DITANGANI.** HTML dimuat via `data:` URL; referensi `file://` akan diblokir. Logo/foto harus di-inline sebagai data URI oleh service.
- **Dialog simpan file**: pola `dialog.showSaveDialog` sudah ada (lihat `electron/ipc/member.ipc.ts:16-47`), bisa ditiru untuk "Simpan PDF".
- **QR Code**: **TIDAK ADA.** `bwip-js` hanya dipakai untuk barcode Code128 (`src/main/services/barcode.service.ts`); library yang sama mendukung bcid `qrcode`.

---

## 4. Template Terpisah atau Bercampur?

**Bercampur.** Di `electron/main/services/print.service.ts`:
- `printBorrowReceipt` (:23-49) melakukan **data assembly (business mapping)** DAN menyerahkan ke `generateReceiptHtml`.
- `generateReceiptHtml` (:81-133) mencampur **data mapping** (akses `item.barcode`, `item.bookTitle`) dengan **rendering HTML** (string literal `<tr>`, style inline) dalam satu fungsi private.
- Tipe parameter `data: any` — tidak ada kontrak DTO ketat.

**Kondisi ideal yang sudah dicontoh `label.service.ts`:** template = fungsi murni `data → HTML`, hidup di service renderer-side (`src/main/services/`), tidak menyentuh Electron API (mudah di-smoke). `PrintService` hanya menjadi adapter (fetch data → panggil template → cetak/PDF).

---

## 5. Preview Tanpa Mengubah Business Logic Borrow?

**YA — aman.** Alasan:

1. `BorrowService.create()` (src/main/services/borrow.service.ts:128) **tidak menyentuh print** sama sekali. Pemisahan cetak = murni tambahan di sisi renderer + `PrintService`.
2. Seluruh jalur cetak saat ini **read-only** (hanya `borrowRepository.findById` + `settingService.get()`).
3. Pola yang akan dipakai = **persis pola Label Preview** yang sudah terbukti non-breaking:
   - `getBorrowCardPreviewHtml(id)` → channel IPC **baru** read-only, tidak membuka window.
   - Cetak/PDF tetap di main, memakai **HTML yang sama** dari template tunggal.
4. Channel lama `printing:borrowReceipt` / `returnReceipt` **tidak dihapus** selama transisi → tidak ada risiko regresi jalur lama.
5. Perubahan di renderer hanya: setelah `create()` sukses, navigasi ke halaman preview (bukan langsung tawarkan cetak). Logika transaksi (`createWithItems`, guard IT-1) tidak tersentuh.

### GAP data terhadap spesifikasi Borrow Card (11 × 6 cm)

| Elemen | Sumber data saat ini | Status |
|---|---|---|
| Logo Sekolah | `Setting.logoPath` | Ada (perlu inline base64 saat render) |
| Nama Perpustakaan | `Setting.libraryName` | Ada |
| Nama Sekolah | `Setting.schoolName` | Ada |
| Foto Anggota | — | **GAP: Member tidak punya kolom foto** |
| Nama / No. Anggota | `Borrow.memberName` / `memberNumber` | Ada |
| Jenis Anggota | `member.memberType` → `memberTypeLabel()` | Ada (config `src/shared/config/member-type.ts`) |
| Kelas (khusus siswa) | `Borrow.className` (snapshot) | Ada |
| Nomor Peminjaman | `Borrow.borrowNumber` | Ada |
| Tanggal Pinjam / Jatuh Tempo | `Borrow.borrowDate` / `dueDate` | Ada |
| Nama Petugas | — | **GAP: tidak ada field officer per transaksi** → pakai `Setting.librarianName` |
| Judul + No. Inventaris per buku | `BorrowDetail.bookCopy.book.title` / `inventoryNumber` | Ada |
| Jumlah Buku | `details.length` | Ada |
| QR Code Transaksi | — | **GAP: belum ada generator QR** → tambah `generateQrCodeSvg` (bwip-js `qrcode`) |
| Status Transaksi | derived: `returnDate ? 'SELESAI' : 'DIPINJAM'` | Bisa dihitung |
| Tanda Tangan Petugas | `Setting.librarianName` (teks) | Nama + garis tanda tangan |

**Keputusan PO yang dibutuhkan (backlog, bukan blokir):**
- **Foto Anggota**: (A) placeholder inisial di kartu (tanpa schema change — direkomendasikan untuk Phase 1) vs (B) tambah kolom `Member.photoPath` via migration (WO terpisah).
- **Nama Petugas**: sumber = `Setting.librarianName` (bukan per-transaksi) — sesuai `Setting` saat ini.

---

## 6. Usulan Arsitektur

Detail lengkap: **`BORROW_RECEIPT_ARCHITECTURE.md`**.

Inti: **SATU template `generateBorrowCardHtml(data)`** di `src/main/services/borrow-card.service.ts`, dipakai oleh 3 jalur:
1. **Preview** → `printing:borrowCardPreview` (baca DB → template → kembalikan string HTML; tanpa window).
2. **Cetak** → `printing:borrowCard` (baca DB → template → hidden window → `webContents.print` dgn `pageSize`/margin kartu).
3. **PDF** → `printing:borrowCardPdf` (baca DB → template → hidden window → `webContents.printToPDF` → `dialog.showSaveDialog` → tulis file).

---

## 7. Mockup Wireframe

Detail lengkap: **`BORROW_RECEIPT_WIREFRAME.md`** (11 cm × 6 cm landscape, ASCII + spesifikasi zona + contoh HTML).

---

## 8. Usulan Daftar Work Order (prioritas aman)

Urutan dibuat agar tiap langkah bisa diverifikasi sendiri dan tidak pernah merusak jalur yang sudah bekerja. Channel legacy (`printing:borrowReceipt`/`returnReceipt`) dipertahankan sampai WO terakhir.

| WO | Nama | Deliverable | Risiko | Tidak menyentuh |
|----|------|-------------|--------|-----------------|
| **WO-1** | **Template & Data Contract** | DTO `BorrowCardData` baru di `src/shared/dto/print.ts`; `src/main/services/borrow-card.service.ts` berisi (a) assembler data `buildBorrowCardData(borrowing, settings)` — mapping memberType, className, status, librarianName, logo → data URI, QR svg; (b) **satu-satunya** template `generateBorrowCardHtml(data)` (110×60mm). Tambah `generateQrCodeSvg` di `barcode.service.ts` (bcid `qrcode`). | Rendah — murni fungsi baru, belum di-wire | BorrowService, repository, schema |
| **WO-2** | **Preview** | IPC `printing:borrowCardPreview` + preload `print.borrowCardPreview` + `env.d.ts`; route `borrowings/:id/receipt-preview` + `BorrowReceiptPreviewPage.tsx` (render HTML via `.preview-sheet`, pola `LabelPreviewPage`); setelah `create()` sukses di `BorrowingsPage.tsx` → `navigate(receiptPreviewPath(id))`. Tombol Cetak/PDF belum aktif (atau disembunyikan). | Rendah — read-only, tambahan channel | `printing:borrowReceipt` legacy, create logic |
| **WO-3** | **Cetak** | IPC `printing:borrowCard` → `printBorrowCard(id)` (printHtml dgn `margins: none` + custom `pageSize` 110×60mm); tombol "Cetak" aktif di preview. **Bukti satu-template**: smoke membandingkan HTML preview == HTML print. | Rendah | PDF, legacy channel |
| **WO-4** | **PDF** | IPC `printing:borrowCardPdf` → `webContents.printToPDF` pada hidden window memuat HTML yang sama → `dialog.showSaveDialog` (pola `member.ipc.ts`) → `fs.writeFile`; tombol "Simpan PDF" aktif. | Sedang — first-time `printToPDF` di repo | Template, preview, print |
| **WO-5** | **Regression & Cleanup** | Smoke suite: single-template invariant (preview==print==pdf), data mapping (semua 14 elemen kartu), QR validity, logo fallback; lint + build + regression suite existing; opsi cleanup menghapus `printing:borrowReceipt`/`returnReceipt` + `generateReceiptHtml` legacy **hanya jika PO setuju**. | Rendah | — |

### Mengapa pembagian ini paling aman
1. **WO-1 berdiri sendiri** tanpa wiring — pure function, bisa di-smoke node murni (pola P-1 `decide()`).
2. **WO-2..WO-4 bertambah channel bertahap** — tiap WO hanya menambah satu jalur, tidak mengubah jalur yang ada.
3. **Cetak & PDF berbagi template yang sama** dengan preview, jadi tidak ada duplikasi rendering (mandat arsitektur PO terpenuhi sejak WO-1).
4. **Cleanup legacy dipindah ke akhir** — risiko regresi saat transisi = nol.

---

## Lampiran: Referensi kode utama

| Topik | Lokasi |
|---|---|
| Alur save renderer | `src/pages/BorrowingsPage.tsx:117-141` |
| Tombol & handler cetak renderer | `src/pages/BorrowingsPage.tsx:319-331` dan `:143-154` |
| Preload print | `electron/preload/print.preload.ts:6-9` |
| IPC print | `electron/ipc/print.ipc.ts:5-18` |
| PrintService (mapping+template+print) | `electron/main/services/print.service.ts:23-49, 81-133, 135-168` |
| Template tunggal label (referensi) | `src/main/services/label.service.ts:82-244` |
| Preview label (referensi) | `src/pages/LabelPreviewPage.tsx:46, 103` |
| Repository borrow | `src/main/repositories/borrow.repository.ts:16-25, 44-49` |
| DTO print | `src/shared/dto/print.ts` |
| env.d.ts blok print | `src/renderer/env.d.ts:130-135` |
| Bootstrap PrintService | `electron/main/bootstrap.ts:108` |
| Schema Setting/Member/Borrow | `prisma/schema.prisma:305-336, 163-191, 255-292` |
| Barcode generator (Code128) | `src/main/services/barcode.service.ts` |
| Pola save dialog | `electron/ipc/member.ipc.ts:16-47` |
| Config jenis anggota | `src/shared/config/member-type.ts` |
