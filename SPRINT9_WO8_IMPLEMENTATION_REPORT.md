# SPRINT9 — WO-8 Implementation Report
**Barcode & Label** — barcode nilai = `inventoryNumber`, simbol Code128, gambar dirender saat cetak, tombol "Cetak Label".

## 1. Ringkasan
WO-8 mengimplementasikan komponen yang sebelumnya tidak ada di aplikasi: **generator barcode sejati** (Code128),
**generator label** (HTML A4 berisi SVG barcode + inventoryNumber + judul + lokasi rak), dan **cetak label**
(reuse `printHtml` PrintService → channel IPC `printing:bookLabels` → preload `print.bookLabels` → tombol di UI).

Keputusan Product Owner (lihat `SPRINT9_WO8_DECISION_LOG.md`):
1. Nilai barcode di DB = `inventoryNumber` (contoh `INV-000001`), **bukan** `BC-XXXX`.
2. Simbol barcode = **Code128**.
3. Gambar barcode **TIDAK disimpan** di DB — dirender saat cetak.
4. Setting `barcodeFormat` dibiarkan (belum dikonsumsi; tech debt tercatat).

## 2. Perubahan Kode

### File baru (3)
| File | Isi |
|------|-----|
| `src/main/services/barcode.service.ts` | `generateBarcodeSvg(value)` → `bwipjs.toSVG({bcid:'code128', ...})` (Code128, scale 3, height 10, includetext, textsize 9). Memakai `bwip-js/node` (exports conditional — wajib agar resolve di build). |
| `src/main/services/label.service.ts` | `escapeHtml` (XSS) + `generateLabelsHtml(data: BookLabelData)` → HTML A4 (`@page size:A4 margin:0`), `.label` 50% × 63mm, SVG barcode + inventoryNumber + judul (clamp 2 baris) + lokasi rak. Fallback nilai barcode `item.barcode \|\| item.inventoryNumber`. |
| `prisma/migrations/...` | — (TIDAK ada; tidak ada perubahan schema — sesuai scope) |

### File dimodifikasi (9)
| File | Perubahan |
|------|-----------|
| `src/shared/dto/print.ts` | Tambah `BookLabelItemData` (barcode, inventoryNumber, shelfLocation) + `BookLabelData` (bookTitle, items). DTO resit lama tetap. |
| `electron/main/services/print.service.ts` | Method `printBookLabels(data)` → `generateLabelsHtml` → `printHtml(html, {margins:{marginType:'none'}})`. `printHtml` menerima `printOptions?: Electron.WebContentsPrintOptions` opsional (di-spread setelah default) — kompatibel resit. |
| `electron/ipc/print.ipc.ts` | Handler baru `printing:bookLabels` → `printService.printBookLabels(data)`. |
| `electron/preload/print.preload.ts` | `print.bookLabels(data)` → `ipcRenderer.invoke('printing:bookLabels', data)`. |
| `src/renderer/env.d.ts` | Tipe `print.bookLabels(input: BookLabelData): Promise<void>` (import `src/shared/dto/print`). |
| `electron/main/services/book-copy.service.ts` | **Keputusan #1:** `executeAddCopiesTransaction` → `barcode: invNum` (barcode = inventoryNumber). Metode `generateBarcodes` dihapus total. `crypto` tetap dipakai (`crypto.randomUUID()`). |
| `src/components/books/BookDetail.tsx` | Tombol **"Cetak Label"** (lucide `Printer`, disabled saat `copies.length===0`) di samping "Tambah Eksemplar" → `handlePrintLabels()` → `window.electronAPI.print.bookLabels({bookTitle, items})`; alert error. |
| `src/utils/labels.ts` | `COPY.PRINT_LABELS: 'Cetak Label'`. |
| `package.json` + `package-lock.json` | Dependency baru `bwip-js@^4.11.2` (pure JS, tanpa native). |

### Tidak diubah (per scope WO-8)
- Matching / Validation / AutoCreate / BookImportService / BookCopyRepository — tidak tersentuh.
- `prisma/schema.prisma` + migrasi — tidak ada kolom/kondisi DB baru.
- `Setting.barcodeFormat` — tetap ada, tidak dikonsumsi (TD).
- Backfill nilai barcode eksisting — tidak dilakukan (TD; nilai `INV-...` sudah valid untuk dirender).

## 3. Detail Teknis

### 3.1 Alur cetak label
```
BookDetail.tsx "Cetak Label" (disabled bila 0 eksemplar)
  → handlePrintLabels()
    → window.electronAPI.print.bookLabels({ bookTitle, items: copies.map({barcode, inventoryNumber, shelfLocation}) })
      → electron/preload/print.preload.ts  print.bookLabels
        → ipcRenderer.invoke('printing:bookLabels', data)
          → electron/ipc/print.ipc.ts  ipcMain.handle('printing:bookLabels')
            → PrintService.printBookLabels(data)   (print.service.ts:14)
              → generateLabelsHtml(data)   (label.service.ts)
                → labelItemHtml per item → generateBarcodeSvg (Code128) + escapeHtml(teks)
              → printHtml(html, { margins: { marginType: 'none' } })
                → hidden BrowserWindow 800×600 → data: URL → webContents.print({ margins:'none', printBackground:true })
```

### 3.2 Render saat cetak (Keputusan #3)
Gambar barcode **tidak pernah disimpan**; `generateBarcodeSvg` dipanggil pada saat menyusun HTML label.
Nilai yang dirender = `item.barcode \|\| item.inventoryNumber` — semua nilai barcode eksisting (`INV-...`)
valid sebagai input Code128, sehingga eksemplar lama dan hasil import langsung bisa dicetak tanpa backfill.

### 3.3 Pemisahan tanggung jawab
- `barcode.service.ts` (new stack) = murni konversi string → SVG Code128 (pure function, tanpa state/DB).
- `label.service.ts` (new stack) = komposisi HTML label (escape, layout A4).
- `PrintService` (legacy) = hanya orkestrasi cetak (HTML → hidden BrowserWindow → `webContents.print`).
- Data eksemplar tetap berasal dari `BookCopyRepository` (SSOT) via UI; tidak ada Prisma langsung baru.

### 3.4 Import `bwip-js/node`
`bwip-js` memakai conditional exports (`node`/`browser`/`electron`); dengan `moduleResolution: bundler`
import default (`bwip-js`) tidak ter-resolve. Wajib `import bwipjs from 'bwip-js/node'`. Smoke verifikasi.

## 4. Verifikasi
| Gate | Hasil |
|------|-------|
| `npm run lint` (node + web `tsc --noEmit`) | **PASS** |
| `npm run build` (electron-vite build) | **PASS** (main 1,746.12 kB; preload 6.59 kB; renderer 884.23 kB) |
| Smoke unit label/barcode (`wo8-smoke`, 16 kasus) | **PASS 16/16** |
| Smoke DB `addCopies` (fresh DB, 16 kasus) | **PASS 16/16** |

### Smoke unit (`wo8-smoke`)
`tsc --module nodenext` compile 2 service + dto → run via `NODE_PATH=<repo>/node_modules` (diperlukan agar `bwip-js/node` resolve). Kasus: SVG Code128 valid, HTML label berisi barcode/inventoryNumber/title/shelfLocation, grid 2 label, escaping judul & lokasi, zero items ok, fallback barcode.

### Smoke DB `addCopies` (fresh SQLite, `prisma migrate deploy` 3 migrations)
Menjalankan **BookCopyService.addCopies asli** (compiled legacy stack):
- 3 eksemplar dibuat: `INV-000001`..`INV-000003`, **barcode === inventoryNumber** di tiap row DB.
- Nilai unik prefix `INV-` (bukan `BC-...`); `findByBarcode('INV-...')` menemukan eksemplar (jalur scan peminjaman).
- DB uji temp dibersihkan; dev DB tidak disentuh.

## 5. Revisi (Review PO — DB Smoke Test Blocker)

### 5.1 Akar penyebab
Review PO menemukan Database Smoke Test GAGAL (`TypeError: Cannot read properties of undefined
(reading 'book')`) dan satu assertion `sequential inventory numbers` tidak lolos. Investigasi:

1. **TypeError `reading 'book'`** — smoke pertama mengimpor singleton `prisma` via destructuring saat
   `require()` (tertangkan `undefined` karena `initDatabase()` belum berjalan) dan memanggil
   `prisma.book.create` di luar alur inisialisasi. **Diperbaiki**: smoke kini memakai binding modul live
   (`db.prisma` setelah `await initDatabase()`).
2. **`sequential inventory numbers` FAIL** — bukan bug kode. Smoke dijalankan ulang terhadap **DB temp
   yang sama** yang sudah berisi 3 baris dari run sebelumnya (`INV-000001..003`), sehingga alokasi
   `InventorySequence` berlanjut ke `INV-000004..006` dan assertion (yang mengharapkan mulai `000001`)
   gagal. **Diperbaiki**: smoke dijalankan terhadap **fresh DB** (hapus file `.db`/WAL/SHM →
   `prisma migrate deploy` → run).
3. **Integritas kode diverifikasi** — `book-copy.service.ts` `executeAddCopiesTransaction` utuh
   (`barcode: invNum`, retry P2002, event per copy); tidak ada sisa metode `generateBarcodes`;
   `crypto.randomUUID()` tetap dipakai. BookRepository/database singleton/`initDatabase()` tidak diubah.

### 5.2 Hasil re-run (semua PASS)
| Gate | Hasil |
|------|-------|
| `npm run lint` | **PASS** |
| `npm run build` | **PASS** (main 1,746.12 kB) |
| HTML Smoke (`wo8-smoke`) | **PASS 16/16** |
| DB Smoke `addCopies` (fresh DB) | **PASS 16/16** |

Log DB Smoke lengkap:
```
[DB] SQLite connected successfully
[DB] shared prisma connected
[PASS] addCopies returns 3 copies -> count=3
[PASS] copy INV-000001: barcode === inventoryNumber -> barcode=INV-000001
[PASS] barcode has INV- prefix (no BC-XXXX) -> INV-000001
[PASS] copy INV-000002: barcode === inventoryNumber -> barcode=INV-000002
[PASS] barcode has INV- prefix (no BC-XXXX) -> INV-000002
[PASS] copy INV-000003: barcode === inventoryNumber -> barcode=INV-000003
[PASS] barcode has INV- prefix (no BC-XXXX) -> INV-000003
[PASS] 3 rows persisted -> count=3
[PASS] row barcode === inventoryNumber in DB -> INV-000001
[PASS] barcode unique value INV-
[PASS] row barcode === inventoryNumber in DB -> INV-000002
[PASS] barcode unique value INV-
[PASS] row barcode === inventoryNumber in DB -> INV-000003
[PASS] barcode unique value INV-
[PASS] findByBarcode finds copy via INV- barcode
[PASS] sequential inventory numbers -> INV-000001,INV-000002,INV-000003
[WO-8 DB] RESULT: 16 passed, 0 failed
[DB] SQLite disconnected
```
Tidak ada exception, tidak ada TypeError, tidak ada undefined, tidak ada skipped test.

### 5.3 Ruang lingkup revisi
Hanya perbaikan prosedur smoke (DB fresh + akses singleton yang benar). **Tidak ada perubahan kode
aplikasi**, tidak ada fitur baru, tidak ada refactor, tidak ada scope creep.

## 6. Rollback
- File yang ditambahkan WO-8 (`barcode.service.ts`, `label.service.ts`, DTO baru, handler IPC, preload, tipe env.d.ts, tombol UI) dihapus / dikembalikan ke kondisi WO-7.
- `book-copy.service.ts`: kembalikan `barcode: invNum` → `barcode: generateBarcodes(...)` + pulihkan metode `generateBarcodes`.
- `print.service.ts`: hapus `printBookLabels` + kembalikan `printHtml` tanpa param opsional; hapus import `generateLabelsHtml`/`BookLabelData`.
- `package.json`/`package-lock.json`: `npm uninstall bwip-js`.
- Karena seluruh perubahan di working tree belum di-commit, rollback bersifat manual (bukan `git revert`); tidak ada coupling antar WO.

## 7. Status
**DONE — READY untuk review PO.** Berhenti di Architecture Gate, menunggu persetujuan Product Owner.
Revisi (DB Smoke blocker) selesai: seluruh gate PASS, termasuk DB Smoke 16/16 pada fresh DB.
