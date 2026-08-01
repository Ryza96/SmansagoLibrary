# SPRINT11 — Database Verification: "Import selesai." tetapi Menu Buku Tidak Bertambah

**Mode:** READ ONLY — tanpa perubahan kode aplikasi, tanpa commit.
**Tanggal:** 01/08/2026
**Tujuan:** Verifikasi basis data (database) untuk keluhan PO pada UAT: pesan *"Import selesai."* muncul setelah klik Import, tetapi Menu Buku tidak bertambah.

---

## 1. Active Database (Menu Buku)

| Item | Nilai |
|------|-------|
| **Path absolut** | `D:\kontenyou\web\New folder\APPSCANNER\APLibrary\prisma\aplibrary.db` |
| Ukuran | 286.720 bytes (01/08/2026 18.27) |
| PrismaClient | `electron/main/database.ts` — `initDatabase()` → `new PrismaClient()` (module-level `prisma`) |
| Datasource | `prisma/schema.prisma`: `datasource db { provider = "sqlite"; url = env("DATABASE_URL") }` |
| Env | `.env`: `DATABASE_URL="file:./aplibrary.db"` |
| Resolusi path | `file:` relatif di-resolve Prisma **terhadap direktori schema** (`prisma/`), bukan CWD. Diverifikasi via `PRAGMA database_list` dari 3 CWD berbeda → selalu `...\APLibrary\prisma\aplibrary.db` |
| Rantai baca | `books:findMany` (IPC `electron/ipc/book.ipc.ts`) → `electron/main/services/book.service.ts` → `electron/main/repositories/book.repository.ts` → `import { prisma } from '../database'` |

Isi saat verifikasi: **3 Book** (`PJOK 12`, `iobdionoa`, `Belajar Prisma`), **10 BookCopy** (`INV-000001` … `INV-000010`, barcode `BC-…`), `InventorySequence` **KOSONG**.

## 2. Active Database (ImportService)

| Item | Nilai |
|------|-------|
| **Path absolut** | `D:\kontenyou\web\New folder\APPSCANNER\APLibrary\prisma\aplibrary.db` |
| PrismaClient | `src/main/repositories/base/prisma.ts` — singleton `getPrisma()` → `new PrismaClient()` |
| Datasource | Sama (`env("DATABASE_URL")`) |
| Env | Sama (`.env`) |
| Resolusi path | Sama — klien kedua juga memakai `DATABASE_URL` `.env`, `file:` relatif → `prisma\aplibrary.db` |
| Rantai tulis | `imports:match` (IPC `electron/ipc/book-import.ipc.ts`) → `MatchingEngineService.match` → `AutoCreateService.apply` → `BookImportService.importBooks` (semua di `src/main/…` memakai `getPrisma()`) |

## 3. Comparison (Menu Buku vs Import)

| Aspek | Menu Buku | Import | Kesimpulan |
|-------|-----------|--------|------------|
| File database | `prisma\aplibrary.db` | `prisma\aplibrary.db` | **100% SAMA** |
| Path absolut | `...\APLibrary\prisma\aplibrary.db` | `...\APLibrary\prisma\aplibrary.db` | **Identik** |
| Env `DATABASE_URL` | `file:./aplibrary.db` | `file:./aplibrary.db` | Identik |
| PrismaClient instance | 1 (dari `electron/main/database.ts`) | 1 (dari `src/main/repositories/base/prisma.ts`) | **Dua instance berbeda, satu file** |
| Tabel `_prisma_migrations` | ✓ (aktif) | ✓ (aktif) | Sama |

**Kesimpulan:** Keduanya membaca & menulis **database yang benar-benar sama** (`prisma/aplibrary.db`). BUKAN bug "import menulis ke database lain". Diverifikasi dengan (a) hanya satu file `.db` di seluruh repo, (b) `PRAGMA database_list` kedua klien menunjuk ke path yang sama, (c) import menulis entitas AutoCreate (Author/Publisher/Category) ke file yang sama yang dibaca Menu Buku (lihat §4).

## 4. Root Cause — Mengapa Menu Buku Tidak Melihat Data Baru

### 4.1 Jawaban atas pertanyaan-pertanyaan

| # | Pertanyaan | Jawaban |
|---|------------|---------|
| 1 | Database yang dipakai Menu Buku | `D:\kontenyou\web\New folder\APPSCANNER\APLibrary\prisma\aplibrary.db` |
| 2 | Database yang dipakai ImportService | `D:\kontenyou\web\New folder\APPSCANNER\APLibrary\prisma\aplibrary.db` |
| 3 | Apakah 100% sama? | **YA — identik** (satu file, dua instance PrismaClient, env sama) |
| 4 | Apakah benar INSERT ke `book`/`book_copies` di DB Menu Buku? | **TIDAK** pada DB dev yang sudah terisi. `book`/`book_copies` **gagal di-INSERT** (rollback per-transaksi). Pada DB kosong hasil `migrate deploy` **INSERT BERHASIL** (fresh.db → 2 Book, 3 Copy) |
| 5 | Mengapa Menu Buku tidak melihat data? | Karena **tidak ada baris baru** yang pernah masuk ke `book`/`book_copies` di DB yang sama yang dibaca Menu Buku — semua baris gagal tersembunyi (lihat 4.2–4.3) |
| 6 | Apakah import menulis ke database lain? | **TIDAK** — menulis ke DB yang sama, tetapi INSERT `book`/`book_copies` gagal dan error disembunyikan |

### 4.2 Temuan dari replikasi headless (pipeline produksi asli, tanpa Electron)

Probe `uat_wo11h/pipeline.probe.ts` menjalankan rantai persis produksi
(`ValidationEngineService` → `MatchingEngineService` → `AutoCreateService` → `BookImportService`)
terhadap salinan DB dev (`uatcopy.db`), memakai `templates/Template_Import_Buku_v2.0.xlsx`:

```
VALIDATION_VALID=true (2 canonical rows: Laskar Pelangi, Atomic Habits)
MATCHING_ERRORS=[{rowNumber:2, messageKey:"bookImport.createFailed"},
                 {rowNumber:3, messageKey:"bookImport.createFailed"}]
DB_COUNTS setelah: books=3, copies=10, authors=5, publishers=5, categories=5, seq=0
```

- **AutoCreate BERHASIL & TERSIMPAN:** `Andrea Hirata`, `James Clear`, `Bentang Pustaka`, `Pengembangan Diri` terbuat di DB yang sama → membuktikan import menulis ke file yang sama dengan Menu Buku.
- **`book`/`book_copies` TIDAK bertambah** (tetap 3/10) → kedua baris menghasilkan `bookImport.createFailed`.

### 4.3 Error tersembunyi di balik `bookImport.createFailed` (P2002)

Probe ber-instrumentasi `uat_wo11h/instr.probe.ts` menangkap error mentah per-transaksi:

```
[t x] book created
[t x] inv allocated=["INV-000001"]        ← allocator mulai dari 1 lagi!
[t x] copies created → FAIL: code=P2002
  "Unique constraint failed on the fields: (`inventoryNumber`)"
```

**Akar masalahnya adalah allocator nomor inventaris, bukan database berbeda:**

- `BookImportService.createBookWithCopies` (`src/main/services/book-import.service.ts`) memanggil `InventoryAllocator.allocate(tx, count)` (`src/main/services/inventory-allocator.ts`).
- `InventoryAllocator` membaca **row tunggal `InventorySequence` (id='default')** → `upsert`. Karena tabel `InventorySequence` pada DB dev **KOSONG** (tidak pernah ada row), `upsert` **create** dengan `lastNumber = count` (mis. 1 atau 2) → allocator mengembalikan `INV-000001` (dst).
- Tetapi DB dev **sudah memiliki 10 BookCopy dengan `inventoryNumber` `INV-000001` … `INV-000010`** (barcode `BC-…`, dibuat oleh jalur legacy WO-8 yang tidak mengisi `InventorySequence`).
- `BookCopy.inventoryNumber` bersifat **`@unique`** (`prisma/schema.prisma:145`) → insert `INV-000001` bertabrakan → **P2002** → seluruh transaksi rollback → `bookImport.createFailed` untuk setiap baris.
- Karena `InventorySequence` masih kosong, **setiap run** impor mengulang dari `INV-000001` dan **selalu** gagal. (Pada `fresh.db` kosong, `INV-000001` bebas → berhasil, sehingga smoke sebelumnya lewat.)

### 4.4 Mengapa UI menampilkan "Import selesai."

- `imports:match` **tidak pernah throw** untuk kegagalan baris — error dikumpulkan ke `matchedWorkbook.matchingResult.errors` (`book-import.ipc.ts:64-68` → `BookImportService.importBooks`).
- `BookImportPreviewPage.handleCommit` **hanya menunggu promise resolve/reject** lalu menampilkan "Import selesai." — **tidak pernah membaca `matchingResult.errors`** (konsekuensi keputusan WO-2/SPRINT10). Jadi walau 100% baris gagal, UI tetap sukses.

### 4.5 Ringkasan rantai sebab-akibat

```
InventorySequence KOSONG (dev DB)
  + 10 BookCopy sudah menempati INV-000001..000010 (legacy, tanpa update sequence)
        ↓
InventoryAllocator.allocate upsert create lastNumber=count → INV-000001..(lagi)
        ↓
INSERT book_copies → P2002 Unique(inventoryNumber) → transaksi ROLLBACK
        ↓
BookImportService mencatat bookImport.createFailed ke matchingResult.errors (tidak throw)
        ↓
Renderer hanya cek promise → "Import selesai." padahal 0 baris masuk
        ↓
Menu Buku (DB sama) tetap 3 buku → PO tidak melihat data baru
```

## 5. Rencana Perbaikan (belum dieksekusi — READ ONLY)

**Penyebab data (utama):** sinkronisasi `InventorySequence` dengan data `BookCopy` yang sudah ada.

1. **Perbaikan data (sebelum import dipakai):** inisialisasi `InventorySequence` agar `lastNumber` ≥ nomor inventaris maksimum yang sudah ada. Pada dev DB ini: set `InventorySequence('default', 'INV', 10)` — sehingga impor berikutnya melanjutkan dari `INV-000011`, tidak lagi bentrok.
2. **Perbaikan kode (allocator tangguh):** `InventoryAllocator.allocate` sebaiknya menghitung angka mulai dari **maksimum `inventoryNumber` yang terpakai** (mis. `SELECT MAX(CAST(inventoryNumber…))` atau fallback query) sebelum `upsert`, bukan selalu mulai dari row sequence kosong. Ini mencegah regresi serupa bila sequence hilang/di-reset.
3. **Perbaikan UX (wajib untuk kepercayaan PO):** `BookImportPreviewPage` harus menampilkan hasil sebenarnya dari `imports:match` — membaca `matchingResult.errors`/`warnings` (dan per-baris) dan menampilkan jumlah sukses/gagal, bukan sekadar "Import selesai." Bila seluruh baris gagal, tampilkan pesan error, bukan sukses. Ini adalah blocker UX yang sama dengan B1/B2 pada `SPRINT10_WO3_UAT_REPORT.md`.
4. **Unifikasi PrismaClient:** dua instance (`electron/main/database.ts` dan `src/main/repositories/base/prisma.ts`) dipakai untuk satu DB; tidak salah secara fungsional (env sama), tetapi rentan drift di masa depan. Sebaiknya satukan di belakang satu singleton.

## 6. Bukti Probe (artefak, READ ONLY)

| Artefak | Isi |
|---------|-----|
| `uat_wo11h/pipeline.probe.ts` | Replikasi rantai produksi; membuktikan `bookImport.createFailed` ×2 & entitas AutoCreate tersimpan |
| `uat_wo11h/instr.probe.ts` | Menangkap error mentah transaksi: `P2002 Unique (inventoryNumber)` saat insert `INV-000001` |
| `uat_wo11h/step.probe.ts` | Isolasi langkah: `book.create` sukses, `bookCopy.createMany` P2002 |
| `C:\Users\hp\AppData\Local\Temp\opencode\wo11h\*.cjs` | `PRAGMA table_info(Book/BookCopy)`, `seq.probe.cjs` (SEQ kosong, 10 INV sudah terpakai) |
| DB uji | `uatcopy.db`, `instr.db`, `step.db`, `probe.db`, `real.db` (salinan dev), `fresh.db`/`fresh2.db` (hasil migrate deploy; import BERHASIL) |

**Status: DONE — READ ONLY. Menunggu review Product Owner.** Perbaikan pada §5 belum dieksekusi.
