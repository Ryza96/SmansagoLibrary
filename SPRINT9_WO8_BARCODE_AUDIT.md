# SPRINT9 — WO-8 Barcode & Label Audit

**MODE: READ ONLY.** Tidak ada perubahan kode. Audit menyeluruh terhadap komponen Barcode, Label, dan Print yang sudah ada.

---

## 1. Current Architecture

### 1.1 Stack paralel (kondisi saat ini)
| Stack | Lokasi | Peran Barcode/Print |
|-------|--------|---------------------|
| Legacy (`electron/main`) | `electron/main/services/book-copy.service.ts`, `electron/main/services/print.service.ts` | **Satu-satunya** pembangkit nilai barcode + satu-satunya Print Service (resit) |
| New (`src/main`) | `src/main/services/book-import.service.ts`, `src/main/repositories/book-copy.repository.ts` | Menyimpan barcode placeholder saat import (WO-7); repository SSOT data eksemplar |

### 1.2 Sumber nilai `barcode` di database (dua jalur, dua format)
| Jalur | Kode | Nilai barcode |
|-------|------|---------------|
| **Manual "Tambah Eksemplar"** | `electron/main/services/book-copy.service.ts:222-231` `generateBarcodes(count)` → `BC-${crypto.randomBytes(6).toString('hex').toUpperCase()}` (contoh `BC-3F2A91C4D5E6`) | teks acak unik, **bukan** barcode simbol |
| **Import buku (WO-7)** | `src/main/services/book-import.service.ts:96` → `barcode: inventoryNumber` (contoh `INV-000001`) | **placeholder** (ditegaskan TD-1 WO-7) |

### 1.3 Komponen yang tidak ada
- **Tidak ada library barcode** di `package.json`/`package-lock.json` (hanya `@prisma/client`, `lucide-react`, `react-router-dom`, `read-excel-file`). Tidak ada `jsbarcode`/`bwip-js`/`code128`/`qr`.
- **Tidak ada encoding symbology** (Code128/QR/EAN), **tidak ada render gambar** (SVG/PNG), **tidak ada checksum**.
- **Tidak ada Label Generator** — tidak ada service/file/template label apa pun.
- **Tidak ada cetak label** — Print Service hanya menangani resit peminjaman/pengembalian.

### 1.4 `Setting.barcodeFormat`
- Schema default `"BC-XXXXXXXXXX"` (`prisma/schema.prisma:256`), disimpan/diubah via `electron/main/services/setting.service.ts` dan `src/pages/SettingsPage.tsx:186`.
- **TIDAK dikonsumsi siapa pun** — tidak ada generator yang membaca `barcodeFormat`. Nilainya murni dekoratif saat ini.

### 1.5 Penyimpanan
- `BookCopy.barcode String @unique` (`prisma/schema.prisma:146`) — hanya menyimpan **string**; tidak ada kolom gambar barcode (tidak diperlukan).
- `BookCopy` juga menyimpan `inventoryNumber`, `shelfLocation`, `condition`, `status`, field acquisition, `notes` + relasi `book` (title/isbn/author/publisher/category).

---

## 2. Current Flow

### 2.1 Cetak resit peminjaman (satu-satunya alur print yang ada)
```
BorrowingsPage.tsx:323  "CETAK BUKTI"
  → handlePrintReceipt() (BorrowingsPage.tsx:143-152)
    → window.electronAPI.print.borrowReceipt(borrowingId)
      → electron/preload/print.preload.ts  print.borrowReceipt
        → ipcRenderer.invoke('printing:borrowReceipt', id)
          → electron/ipc/print.ipc.ts  ipcMain.handle('printing:borrowReceipt')
            → PrintService.printBorrowReceipt(id)   (electron/main/services/print.service.ts:13)
              → BorrowRepository.findById(id) + SettingService.get() (paralel)
              → bangun BorrowReceiptData (barcode/inventoryNumber/bookTitle per item)
              → generateReceiptHtml(data, 'PEMINJAMAN')   (print.service.ts:71)
              → printHtml(html)   (print.service.ts:125)
                → BrowserWindow({ width:800, height:600, show:false })
                → loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
                → webContents.on('did-finish-load')
                  → webContents.print({ margins:{marginType:'default'}, printBackground:true }, cb)
                    → cb(true) → resolve; cb(false) → reject(failureReason)
                  → window.close() jika belum destroyed
```

### 2.2 Cetak resit pengembalian
Alur identik: `ReturnsPage.tsx:67` → `electronAPI.print.returnReceipt` → `printing:returnReceipt` → `printReturnReceipt` (print.service.ts:41) → filter item `returnedAt !== null` → `generateReceiptHtml(data, 'PENGEMBALIAN')` → `printHtml`.

### 2.3 Alur pembuatan nilai barcode manual (add copies)
```
BookDetail.tsx:330 "Tambah" → handleAdd → electronAPI.bookCopies.addCopies(bookId, CreateBookCopiesDTO)
  → bookCopies:addCopies (electron/ipc/book-copy.ipc.ts:19)
    → LegacyBookCopyService.addCopies (electron/main/services/book-copy.service.ts:58)
      → executeAddCopiesTransaction (book-copy.service.ts:104)
        → InventoryAllocator.allocate(tx, qty)   (inventoryNumber INV-000001...)
        → generateBarcodes(qty)   → BC-<12 hex>  (book-copy.service.ts:122, 222)
        → repository.createManyWithTx(tx, [{ inventoryNumber, barcode, shelfLocation, condition, status:AVAILABLE, ... }])
        → event COPY_CREATED per eksemplar
```

### 2.4 Alur barcode import (WO-7)
```
imports:match (electron/ipc/book-import.ipc.ts:22)
  → engine.match → autoCreate.apply → bookImport.importBooks
    → BookImportService.importRow → bookRepository.create(...)
      → createBookCopy(book.id) → bookCopyRepository.create({ bookId, inventoryNumber, barcode: inventoryNumber, shelfLocation:'' })
```

---

## 3. Existing Components

| Komponen | Ada? | Lokasi | Keterangan |
|----------|------|--------|------------|
| Barcode Generator | ⚠️ **Parsial** | `electron/main/services/book-copy.service.ts:222-231` (`generateBarcodes`) | Hanya menghasilkan string token `BC-<hex>`. Bukan symbology, bukan gambar, tidak dijamin terbaca scanner. Tidak ada library. |
| Label Generator | ❌ **Tidak ada** | — | Tidak ada template/size/grid/cetak label. |
| Print Service | ✅ Ada (resit saja) | `electron/main/services/print.service.ts` (PrintService) | `printBorrowReceipt`, `printReturnReceipt`, helper `printHtml` (hidden BrowserWindow → `webContents.print`). Metode cetak label TIDAK ada. |
| IPC print | ✅ Ada (resit saja) | `electron/ipc/print.ipc.ts` | Channel `printing:borrowReceipt`, `printing:returnReceipt`. |
| Preload print | ✅ Ada (resit saja) | `electron/preload/print.preload.ts` | `print.borrowReceipt`, `print.returnReceipt`. |
| API renderer (env.d.ts) | ✅ Ada (resit saja) | `src/renderer/env.d.ts:124-127` | `print.borrowReceipt`, `print.returnReceipt`. |
| DTO print | ✅ Ada | `src/shared/dto/print.ts` | `BorrowReceiptData`, `ReturnReceiptData`, `ReceiptItemData` (barcode, inventoryNumber, bookTitle, condition). Label DTO tidak ada. |
| Konsumen UI print | ✅ Ada | `src/pages/BorrowingsPage.tsx:323`, `src/pages/ReturnsPage.tsx:67` | Hanya resit. Tidak ada tombol "Cetak Label". |
| Storage data eksemplar | ✅ Ada | `src/main/repositories/book-copy.repository.ts` (new, SSOT) | `create`/`findById` (include book lengkap)/`findMany` (include book.title). Memuat barcode, inventoryNumber, shelfLocation, condition, status, relasi book. |
| Setting barcode | ⚠️ Tersimpan, tak terpakai | `prisma/schema.prisma:256`, `setting.service.ts`, `SettingsPage.tsx:186` | `barcodeFormat` default `BC-XXXXXXXXXX`; tidak ada consumer. |

---

## 4. Missing Components

| # | Komponen hilang | Detail |
|---|-----------------|--------|
| 1 | **Barcode generator sejati** | Symbology (Code128 / QR / EAN), render gambar (SVG/PNG/base64), checksum, pengolahan `Setting.barcodeFormat`. Wajib via library (contoh `bwip-js`/`jsbarcode`) atau implementasi mandiri. |
| 2 | **Label generator** | Layout label (isi: barcode image + inventoryNumber + judul + lokasi rak; ukuran label; grid per halaman; paper size A4/A6/Avery). |
| 3 | **Cetak label di Print Service** | Method `printBookLabels` (atau sejenis) memakai `printHtml` yang sudah ada + pengaturan ukuran halaman label. |
| 4 | **IPC/preload/env.d.ts label** | Channel `printing:bookLabels`, `print.bookLabels`, tipe di `env.d.ts`. |
| 5 | **UI entry cetak label** | Tombol di `BookDetail.tsx` (tabel eksemplar), `InventoryDetailPage.tsx`, dan/atau `InventoryPage.tsx` (cetak massal / seleksi). |
| 6 | **Definisi semantik `Setting.barcodeFormat`** | Mask `BC-XXXXXXXXXX` → format nilai barcode yang dihasilkan (angka/alnum, checksum, panjang). Saat ini ambigu. |
| 7 | **Backfill data eksisting** | Eksemplar lama (import `INV-...` dan manual `BC-...`) bila format barcode diubah — butuh migrasi/update + jaminan unik. |
| 8 | **Data label di DTO renderer** | `BookCopyDTO` (`src/shared/dto/book.ts:11-19`) TIDAK memuat judul buku; untuk UI label berbasis renderer perlu DTO baru/penambahan. (Data tersedia penuh di main-process repo.) |

---

## 5. Files Impact (estimasi jika WO-8 diimplementasikan)

> Daftar **perkiraan**, bukan implementasi. Akan dikonfirmasi saat WO-8 dirancang/di-approve.

### File baru
| File | Isi |
|------|-----|
| `src/main/services/barcode.service.ts` (atau `electron/main/services/`) | Generator barcode sejati (Code128/QR) memakai library; membaca `barcodeFormat` dari Setting. |
| `src/main/services/label.service.ts` | Generator HTML/SVG label (barcode + teks; ukuran & grid label). |
| `scripts/smoke-wo8.ts` (sementara) | Smoke test — dihapus setelah bukti. |

### File dimodifikasi (perkiraan)
| File | Perubahan |
|------|-----------|
| `package.json` + `package-lock.json` | Tambah dependency barcode library (pure-JS; hindari native). |
| `electron/main/services/print.service.ts` | Method `printBookLabels` (reuse `printHtml`); pertahankan resit. |
| `electron/ipc/print.ipc.ts` | Handler baru `printing:bookLabels`. |
| `electron/preload/print.preload.ts` | `print.bookLabels`. |
| `src/renderer/env.d.ts` | Tipe `print.bookLabels` (+ DTO label bila perlu). |
| `src/shared/dto/print.ts` | `BookLabelData` (barcode, inventoryNumber, title, shelfLocation, dll). |
| `src/components/books/BookDetail.tsx` | Tombol "Cetak Label" (per eksemplar / semua eksemplar). |
| `src/pages/InventoryDetailPage.tsx` dan/atau `src/pages/InventoryPage.tsx` | Entry cetak label + seleksi/cetak massal. |
| `src/main/services/book-import.service.ts` | **Hanya bila keputusan**: ganti placeholder `barcode: inventoryNumber` (WO-7) dengan nilai barcode riil pada saat import. |
| `electron/main/services/book-copy.service.ts` | **Hanya bila keputusan**: upgrade `generateBarcodes` ke format sesuai `barcodeFormat`. |
| `electron/main/bootstrap.ts` | Wiring service baru ke PrintService/Container (bila nilai barcode dihasilkan main-process). |

### Kemungkinan TIDAK berubah
- `prisma/schema.prisma` + migrasi — barcode tetap string; gambar barcode **dirender saat cetak** (bukan disimpan).
- `src/main/repositories/book-copy.repository.ts` — data sudah memadai (SSOT); tidak perlu kolom baru.
- Matching Engine / Validation / AutoCreate — di luar scope (JANGAN, konsisten WO-7).

---

## 6. Risk Analysis

| # | Risiko | Dampak | Mitigasi |
|---|--------|--------|----------|
| 1 | **Kompatibilitas scanner** — symbology/format (Code128 vs QR) belum diverifikasi terhadap hardware scanner yang dipakai perpustakaan | Barcode tercetak tapi tidak terbaca scanner | Uji dengan scanner riil lebih dulu (WO pilot); sediakan opsi format di `Setting.barcodeFormat`; uji scan di Borrow/Return. |
| 2 | **Data eksisting tidak konsisten** — sudah ada `INV-...` (import) dan `BC-...` (manual) di DB; format baru menambah varian | Pencetakan label barcode lama tak sesuai format baru; risiko duplikat saat backfill | Tentukan strategi backfill terpisah (WO tersendiri): regenerate nilai barcode + jaga unik (`existsByBarcode`), atau biarkan nilai lama dan hanya render gambar dari nilai yang ada. |
| 3 | **Semantik `barcodeFormat` ambigu** — mask `BC-XXXXXXXXXX` belum terdefinisi (X = alnum? checksum? prefix?) | Membangun generator sesuai spek yang salah | Tetapkan spesifikasi format (Decision Log WO-8) sebelum implementasi; pertimbangkan checksum + length validation. |
| 4 | **Keandalan cetak Electron** — `webContents.print` bergantung OS/driver; `silent:true` tidak dipakai; ukuran kertas label (A6/thermal) via CSS `@page` tidak konsisten antar driver | Label miring/terpotong/gagal; cetak massal lambat (1 window per label) | Pakai 1 halaman HTML berisi grid label + `webContents.print({silent, pageSize, margins})`; pratinjau dulu (`silent:false`); verifikasi driver thermal. |
| 5 | **Dependency baru** — library barcode (native vs pure-JS; ukuran bundle; lisensi; ESM/CJS) | Build/packaging bermasalah; app size naik; offline install gagal | Pilih pure-JS, minimal deps; uji `npm run build` + `package:win`; dokumentasikan lisensi. |
| 6 | **Regresi WO-7/import** — jika nilai barcode diganti dari placeholder menjadi generator di `book-import.service.ts` | Import rusak; smoke lama tak relevan | Pertahankan alur import; ganti nilai barcode dengan keputusan eksplisit + update smoke; atau tetap render di waktu cetak (tidak menyentuh data tersimpan). |
| 7 | **Regresi print resit** — `printHtml` dipakai ulang untuk label | Resit peminjaman/pengembalian berubah perilaku | Refactor `printHtml` tetap kompatibel (param opsional pageSize/silent); smoke ulang resit. |
| 8 | **XSS/escaping** — `printHtml` meng-interpolasi nilai DB ke HTML (pola existing) | Konten label (judul/lokasi) bisa memicu HTML tidak diinginkan | Escape semua nilai teks pada label; pola sama dengan resit. |
| 9 | **Scope creep** — label butuh UI, bulk print, backfill | WO-8 membengkak | Pecah: WO-8A (generator barcode), WO-8B (label + print + IPC), WO-8C (UI), WO-8D (backfill) — tiap fase lewat Architecture Gate. |

---

## 7. Recommendation

1. **Fasekan WO-8** (patuhi SPRINT8_EXECUTION_PROTOCOL — satu WO = satu gate):
   - **WO-8A — Barcode value generator**: definisikan semantik `barcodeFormat` (Decision Log); tambah library pure-JS; generator Code128/QR + checksum; hasil berupa string unik yang **disimpan** di `BookCopy.barcode` (jalur import + add copies) ATAU gambar yang **dirender saat cetak**. **Rekomendasi: generate nilai di waktu create** agar barcode tersimpan selalu valid/scannable.
   - **WO-8B — Label generator + cetak**: `label.service.ts` (grid label + barcode image + inventoryNumber + judul + lokasi) → `printHtml` reuse → `printing:bookLabels` → preload/env.d.ts → smoke (fresh DB + print preview).
   - **WO-8C — UI**: tombol "Cetak Label" di `BookDetail.tsx` (per eksemplar/semua), `InventoryDetailPage`, `InventoryPage` (cetak massal).
   - **WO-8D — Backfill** (opsional/terpisah): regenerasi nilai barcode untuk eksemplar lama sesuai format baru, jaga unik; tidak wajib bila keputusan = render-gambar-saat-cetak.
2. **Jaga SSOT**: seluruh baca eksemplar untuk label via `BookCopyRepository` (new); jangan Prisma langsung; jangan ubah Matching/Validation/AutoCreate/Repository.
3. **Verifikasi hardware**: pilot cetak+scan dengan scanner dan printer label aktual perpustakaan sebelum rollout; sediakan pilihan format (Code128/QR) di Settings.
4. **Jangan ubah data import yang sudah ada** tanpa migrasi eksplisit; placeholder `barcode=inventoryNumber` (WO-7 TD-1) valid untuk dirender ulang bila keputusan = render-at-print.
5. **Prioritas risk**: (1) kompatibilitas scanner, (2) semantik format, (3) keandalan cetak, (4) backfill — kunci di Decision Log WO-8.

---

*WO-8 audit selesai. READ ONLY — tidak ada perubahan kode. Berhenti di sini, menunggu review Product Owner.*
