# SPRINT11 — WO-11-I: Database Reconciliation Migration (IMPLEMENTATION REPORT)

**WO:** WO-11-I
**Role:** Principal Software Engineer
**Source of Truth:** `SPRINT11_DATABASE_VERIFICATION.md` + `SPRINT11_BOOK_CREATION_ROOTCAUSE.md` + `SPRINT11_WO11H_IMPLEMENTATION_REPORT.md` (disetujui PO)
**Status:** DONE — menunggu review Product Owner. Belum commit (1 WO = 1 commit setelah approval).

---

## 1. Files Changed

| File | Perubahan |
|------|-----------|
| `src/main/services/database-reconciliation.service.ts` | **Baru.** `DatabaseReconciliationService.run()` — idempotent database reconciliation yang berjalan sekali saat app start (post-`initDatabase`). Menyelaraskan `InventorySequence` ke `MAX(inventoryNumber)` bila kosong/ketinggalan; mendeteksi (tidak memperbaiki) duplikat `inventoryNumber`/`barcode`. Singleton `databaseReconciliationService` di-export. |
| `electron/main/index.ts` | **Baru 2 baris.** Import singleton + `await databaseReconciliationService.run()` setelah `initDatabase()` di `app.whenReady()` (baris 38). |

Hanya 2 file yang diubah. Book, BookCopy, Import Engine, UI, Repository, `InventoryAllocator` **TIDAK disentuh** (sesuai aturan WO-11-I: reconciliation hanya untuk migration, tidak mengubah jalur produksi).

Catatan status git: kedua file saat ini **untracked** (`??`) di working tree — konsisten dengan repo (commit terakhir `437b50a` baseline release; seluruh kerja Sprint 5+ belum di-commit).

## 2. Migration Strategy

Reconciliation berjalan **otomatis sekali saat app start** (tidak ada tombol UI, tidak ada migrasi Prisma/schema — murni service runtime di `electron/main/index.ts:38`, setelah `initDatabase()` dan sebelum handler IPC diregistrasi).

`run()` melakukan **2 hal**:

1. **Sync `InventorySequence` (self-healing):**
   - Baca semua `inventoryNumber` dari `BookCopy`.
   - Hitung `maxInventoryNumber` = nilai numerik maksimum dari nomor ber-prefix `INV-` (parsing ketat: hanya `INV-<angka>` yang dihitung; nilai non-numerik diabaikan).
   - Jika sequence **tidak ada** ATAU `lastNumber < maxInventoryNumber` (ketinggalan) → `upsert` ke `lastNumber = maxInventoryNumber` (`sequenceSynced=true`).
   - Jika sequence sudah sinkron → tidak menyentuh apa pun (`sequenceSynced=false`).
2. **Deteksi duplikat (report only):**
   - `duplicateInventoryNumbers` = nilai `inventoryNumber` yang muncul >1 kali.
   - `duplicateBarcodes` = nilai `barcode` yang muncul >1 kali.
   - **TIDAK diperbaiki otomatis** — dicatat ke log `[RECONCILE] DATABASE INCONSISTENCY: ...` via `console.error` dan dikembalikan dalam result object (kontrak internal service).

Hasil dikembalikan sebagai `DatabaseReconciliationResult`:

```ts
interface DatabaseReconciliationResult {
  sequenceExisted: boolean
  sequenceSynced: boolean
  sequenceLastNumber: number
  maxInventoryNumber: number
  duplicateInventoryNumbers: string[]
  duplicateBarcodes: string[]
}
```

Strategi mengikuti keputusan PO dari `SPRINT11_BOOK_CREATION_ROOTCAUSE.md`: akar masalah adalah `InventorySequence` kosong/ketinggalan sementara `BookCopy` lama sudah memakai `INV-000001..10` → allocator P2002. Reconcilation menutup celah untuk **database lama** dengan menyelaraskan sequence ke kenyataan data, dan melaporkan anomali duplikat yang tidak bisa diperbaiki secara aman.

## 3. Validation

Validasi memakai 2 probe terpisah yang di-compile (`tsc`, target `C:\Users\hp\AppData\Local\Temp\opencode\wo11i\build`) dan dijalankan pada DB temp (fresh `migrate deploy` / salinan DB dev).

### Probe 1 — `uat_wo11i/reconcile.validate.ts` (skenario A & B, DB = salinan dev `prisma/aplibrary.db`, 4 Book / 28 BookCopy / sequence lastNumber=28)

| # | Target | Hasil |
|---|--------|-------|
| S0 | DB siap diuji (ada BookCopy, snapshot baseline konsisten) | **PASS** — maxInventory=28 |
| A1 | Sequence kosong → dibuat & di-sync ke MAX | **PASS** — `sequenceExisted=false sequenceSynced=true lastNumber=28 max=28` |
| A2 | `lastNumber == MAX(inventoryNumber)` setelah sync | **PASS** — 28 == 28 |
| A3 | Run kedua tidak menyentuh sequence | **PASS** — `sequenceSynced=false` |
| A4 | Run kedua tidak mengubah data | **PASS** |
| B1 | Sequence tertinggal (lastNumber < MAX) → disinkronkan | **PASS** — di-set ke 28 |
| B2 | Run kedua tidak mengubah lagi | **PASS** — `synced=false` |

### Probe 2 — `uat_wo11i/duplicate.validate.ts` (skenario C, DB = fresh deploy, `BookCopy` dibuat ulang TANPA constraint unique untuk mensimulasikan data lama yang korup)

| # | Target | Hasil |
|---|--------|-------|
| C1 | Duplikat `inventoryNumber` terdeteksi | **PASS** — `["INV-000001"]` |
| C2 | Duplikat `barcode` terdeteksi | **PASS** — `["BC-BBB-1"]` |
| C3 | TIDAK diperbaiki otomatis (baris dup tetap ada) | **PASS** — invDup=2, barcodeDup=2 |
| C4 | Tidak ada baris dihapus/ditambah | **PASS** — total=4 |
| C5 | Run kedua idempotent (laporan sama, data utuh) | **PASS** — total=4 |

Bukti log (stderr adalah channel pelaporan anomali yang disengaja):

```
[RECONCILE] DATABASE INCONSISTENCY: duplicate inventoryNumber "INV-000001"
[RECONCILE] DATABASE INCONSISTENCY: duplicate barcode "BC-BBB-1"
[RECONCILE] InventorySequence lastNumber=3 maxInventoryNumber=3 synced=true
```

### Regression build & lint

| Check | Hasil |
|-------|-------|
| `npm run lint` | **PASS** — exit 0 (tsc node + web `--noEmit`) |
| `npm run build` | **PASS** — exit 0 (main 1,753.61 kB · preload 6.68 kB · renderer 894.05 kB) |

## 4. Idempotency

- **Idempotent by design:** `run()` hanya menulis ke DB bila `needsSync` (sequence tidak ada ATAU `lastNumber < maxInventoryNumber`). Jalankan berulang kali pada DB yang sudah benar → `sequenceSynced=false` dan **tidak ada write** (A3, A4, B2, C5 PASS).
- Deteksi duplikat murni **read-only** — tidak pernah DELETE/UPDATE baris `BookCopy`.
- `upsert` memakai `set` (bukan `increment`) pada jalur sync → nilai deterministik dari data aktual, aman dieksekusi kapan pun.
- Aman untuk database baru (sequence sudah sinkron → no-op) maupun database lama (sequence kosong/ketinggalan → di-sync sekali, run berikutnya no-op).

## 5. Rollback

- **Rollback source:** hapus 2 perubahan — (1) revert `electron/main/index.ts` (hapus import + baris 38), (2) hapus `src/main/services/database-reconciliation.service.ts`. Karena tidak ada dependen lain, rollback aman & penuh.
- **Catatan DB:** tidak ada migrasi Prisma, tidak ada perubahan schema, tidak ada penulisan permanen yang berisiko. Satu-satunya efek samping adalah `InventorySequence.lastNumber` bisa berubah ke `MAX(inventoryNumber)` bila sebelumnya kosong/ketinggalan — ini justru memperbaiki kondisi yang menjadi akar WO-11-H dan tidak merugikan jalur produksi.
- **Risiko rollback:** tidak ada — reconciliation hanya berjalan sekali di startup dan tidak mengubah perilaku alokasi normal.

---

**Status: DONE — menunggu review Product Owner. BERHENTI.**
