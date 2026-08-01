# SPRINT11 — WO-11-J: Import Result Summary (IMPLEMENTATION REPORT)

**WO:** WO-11-J
**Role:** Principal Software Engineer
**Source of Truth:** WO-11-H + WO-11-I (disetujui PO); hasil audit arsitektur `book-import.ipc.ts` / `book-import.service.ts` / `src/types/import.ts`
**Status:** DONE — menunggu review Product Owner. Belum commit (1 WO = 1 commit setelah approval).

---

## 1. Files Changed

Hanya 3 file renderer/utility. **TIDAK ada perubahan** pada Import Engine, Repository, InventoryAllocator, Database, IPC Contract, Parser, Preload, env.d.ts, service layer.

| File | Perubahan |
|------|-----------|
| `src/pages/BookImportPreviewPage.tsx` | Komponen baru `ImportResultSummary` (tampilkan ringkasan + daftar error). `handleCommit()` kini **menangkap nilai balik** `imports:match` ke state `importResult` (sebelumnya hasil dibuang). Blok sukses statis "Import selesai." diganti render ringkasan. |
| `src/utils/bookImport.ts` | `computeImportResultSummary(result)` — fungsi murni yang menghitung `{booksCreated, copiesCreated, failedRows}` dari `MatchedWorkbook` yang sudah dikembalikan engine. `getImportResultMessage(messageKey)` — pemetaan `messageKey` engine (`bookImport.*`) → teks bahasa Indonesia. |
| `src/utils/labels.ts` | 10 label baru blok `IMPORT.RESULT_*` (`RESULT_TITLE`, `RESULT_ALL_OK`, `RESULT_BOOKS_CREATED`, `RESULT_COPIES_CREATED`, `RESULT_FAILED_ROWS`, `RESULT_AMBIGUOUS`, `RESULT_TITLE_MISSING`, `RESULT_ENTITY_MISSING`, `RESULT_ISBN_DUPLICATE`, `RESULT_CREATE_FAILED`, `RESULT_COPY_CREATE_FAILED`). |

## 2. UX Changes

Setelah tombol **Import Buku** diklik dan `imports:match` selesai, muncul kartu ringkasan **"Import selesai"** dengan 3 statistik:

```
Buku berhasil dibuat   : X
Book Copy berhasil dibuat : Y
Baris gagal            : Z
```

- **Z = 0** → kartu hijau menampilkan **"Semua data berhasil diimport."** (tanpa daftar error).
- **Z > 0** → kartu amber menampilkan daftar error per baris, contoh:

```
Baris 8: ISBN sudah digunakan.
Baris 11: Entitas (Penulis/Penerbit/Kategori) tidak ditemukan.
Baris 14: Jumlah Copy harus lebih dari 0.
```

Format mengikuti spesifikasi WO (angka baris sesuai `rowNumber` aktual dari workbook, mis. baris 8 — bukan index array). Peta pesan:

| messageKey engine | Teks |
|-------------------|------|
| `bookImport.isbnDuplicate` | ISBN sudah digunakan. |
| `bookImport.entityMissing` | Entitas (Penulis/Penerbit/Kategori) tidak ditemukan. |
| `bookImport.copyCreateFailed` | Jumlah Copy harus lebih dari 0. |
| `bookImport.createFailed` | Gagal menyimpan buku. |
| `bookImport.titleMissing` | Judul tidak boleh kosong. |
| `bookImport.ambiguous` | Judul buku tidak unik (ambigu). |

`handleCommit` tetap memakai channel `imports:match` yang **sudah ada**; hanya nilai baliknya kini disimpan (`const result = await window.electronAPI.imports.match(...)`). Tidak ada channel/preload/env.d.ts baru, tidak ada akses Excel ulang, tidak ada parsing ulang — seluruh data dibaca dari `MatchedWorkbook` yang sudah dikembalikan engine (`matchingResult.errors` berisi per-row `{rowNumber, messageKey}` yang diisi `book-import.service.ts:33`).

## 3. Validation

### Probe `uat_wo11j/summary.validate.ts` — 17/17 PASS (fungsi produksi `computeImportResultSummary` + `getImportResultMessage` dijalankan langsung)

| # | Skenario | Hasil |
|---|----------|-------|
| S1 | Import sukses penuh (3 baris, copy 3/1/5, 0 error) | **PASS** — books=3, copies=9, failed=0 → "Semua data berhasil diimport." |
| S2 | Import sebagian gagal (baris 2,3 sukses; 8,11,14 gagal) | **PASS** — books=2, copies=4, failed=3; pesan baris 8/11/14 sesuai |
| S3 | Import gagal total (2 baris, keduanya error) | **PASS** — books=0, copies=0, failed=2; pesan createFailed & titleMissing sesuai |
| Immutabilitas | Hasil import sebenarnya tidak berubah | **PASS** — `matchingResult.errors` & `matchedRows` identik sebelum/sesudah komputasi ringkasan (fungsi hanya membaca, tidak memutasi) |

### Regression build & lint

| Check | Hasil |
|-------|-------|
| `npm run lint` | **PASS** — exit 0 (tsc node + web `--noEmit`) |
| `npm run build` | **PASS** — exit 0 (main 1,753.61 kB · preload 6.68 kB · renderer 897.99 kB) |

## 4. Regression

- Engine import **tidak diubah** — `book-import.service.ts`, `book-import.ipc.ts`, `MatchingEngineService`, `AutoCreateService`, repositori, allocator, schema **0 perubahan**; alur commit identik, hanya nilai balik yang kini dikonsumsi.
- `computeImportResultSummary` murni (pure function): membaca `matchedRows` + `matchingResult.errors` dari data yang sudah dikembalikan; tidak ada akses Excel, tidak ada parsing ulang workbook, tidak ada hitung ulang dari file.
- Perilaku UI lama (hint commit, tombol Kembali/Batal, tombol Import) tetap; blok sukses diperkaya tanpa menghapus alur.
- Error/unknown key jatuh ke label `RESULT_*` fallback `ERROR_UNKNOWN` (tidak crash).

## 5. Rollback

- **Rollback source:** revert 3 file renderer/utility ke state sebelum WO-11-J. Karena tidak ada dependen backend, rollback aman & penuh.
- **Catatan DB:** tidak ada migrasi/schema/DB terlibat; tidak ada penulisan DB baru.
- **Risiko rollback:** tidak ada — perubahan murni tampilan; engine dan data import tidak tersentuh.

---

**Status: DONE — menunggu review Product Owner. BERHENTI.**
