# AUDIT REPORT — CONSOLIDATE BOOKCOPY BARCODE IDENTITY

**Work Order:** CONSOLIDATE BOOKCOPY BARCODE IDENTITY
**Status:** READY FOR MANUAL UAT (menunggu review PO)
**Tanggal:** 2026-08-11

---

## 1. Mandat & Keputusan PO

Perintah dari Product Owner (agenda sebelumnya): konsolidasi identitas `BookCopy` sehingga

- `inventoryNumber` SELALU `INV-XXXXXX` (identitas stabil),
- `barcode === inventoryNumber` (satu nilai identitas; scanner mengembalikan `inventoryNumber`),
- `barcodeFormat` hanya menentukan simbologi (code128/code39), bukan nilai,
- `inventoryPrefix` TIDAK lagi membentuk nilai barcode.

Batasan keras:
- TIDAK menyentuh DB produksi,
- TIDAK menambah migration kecuali terbukti perlu (tidak terbukti),
- TIDAK backfill produksi,
- TIDAK mengubah perilaku `inventoryNumber`/counter/urutan,
- TIDAK menghapus `inventoryPrefix` dari DB/schema,
- TIDAK commit/push tanpa instruksi PO.

## 2. Discovery — Lokasi Penulisan Barcode

Hanya **DUA** situs yang menulis kolom `barcode` (diverifikasi `grep barcode:\s` di `src/` dan `electron/`):

| # | File | Jalur | Peran |
|---|------|-------|-------|
| 1 | `src/main/services/inventory-allocator.ts` | Stack baru (import buku) | barcode = INV-XXXXXX (sekarang) |
| 2 | `electron/main/services/inventory-allocator.ts` | Legacy (tambah eksemplar manual) | barcode = INV-XXXXXX (sekarang) |

Seluruh kemunculan `barcode` lain di codebase adalah pembaca/DTO/lookup/display — tidak ada situs tulis tambahan.

## 3. Perubahan Kode (DONE)

### 3.1 `src/main/services/inventory-allocator.ts`
- Return allocation kini `{ inventoryNumber, barcode: inventoryNumber }` (satu nilai dari satu counter).
- Komentar header diperbarui: `barcode = inventoryNumber`; `Setting.inventoryPrefix` DEPRECATED untuk alokasi, tetap disimpan ke record `InventorySequence` (kosmetik) agar setting tidak hilang.
- `readPrefix` dipertahankan (menulis field `prefix` record); healing needle TETAP `'INV-'`.

### 3.2 `electron/main/services/inventory-allocator.ts`
- Sama: `barcode: inventoryNumber` (identitas sama, satu counter, tanpa healing).
- Komentar header disesuaikan; `readPrefix` dipertahankan untuk field record.

### 3.3 `src/main/services/database-reconciliation.service.ts`
- **Logika TIDAK berubah** — needle `'INV-'` pada `inventoryNumber` sudah benar; prefix setting hanya kosmetik record.
- Hanya komentar usang yang dikoreksi agar sesuai desain baru (tanpa perubahan perilaku).

### 3.4 Tidak Diubah (terverifikasi)
- `prisma/schema.prisma` — `inventoryNumber`/`barcode` keduanya `@unique`, tanpa perubahan.
- `electron/main/services/book-copy.service.ts` `createCopies` — sudah memetakan pasangan allocator (`barcode: c.barcode`).
- `scripts/migrate-inventory-number.ts` — skrip migrasi satu-kali (sudah dieksekusi era sebelumnya); tidak menyentuh `barcode`.
- Seluruh pembaca: `book.service.ts:38-46`, `book-copy.service.ts:42-43`, `BookDetail.tsx:191`, `InventoryPage.tsx:213`, `InventoryDetailPage.tsx:124`, `LabelPreviewPage.tsx:42` (`copy.barcode ?? copy.inventoryNumber`), `print.service.ts:276/305`, `return.service.ts`, `borrow.service.ts` (lookup via `findByBarcode`).

## 4. Matriks Alur Produksi

| Alur | Pustaka Barcode | Hasil Scan |
|------|-----------------|------------|
| Import buku (Stack baru) | `inventory-allocator.ts` (src/main) | `INV-XXXXXX` |
| Tambah eksemplar manual (legacy) | `inventory-allocator.ts` (electron) | `INV-XXXXXX` |
| Scan saat pinjam (`bookCopies:findByBarcode`) | `inventoryNumber` | cocok |
| Scan saat kembali (`returns:findByBarcode`) | `inventoryNumber` | cocok |
| Cetak label (`barcode ?? inventoryNumber`) | `INV-XXXXXX` | — |
| Cetak kartu peminjaman | `barcode ?? ''` dari relasi | — |
| Reconciliation (needle `'INV-'`) | `inventoryNumber` | — |

## 5. Perubahan Smoke (DONE)

### `inventory_prefix_smoke/smoke.ts` — diperbarui ke kontrak baru
- Header/komentar ditulis ulang ke desain `barcode === inventoryNumber`.
- STEP 2–8 kini mengekspektasi `barcode: 'INV-…'` identik `inventoryNumber` (allocator baru + legacy, healing, reconciliation, normalisasi lowercase, dst).
- Baris seed legacy `BC-000099`/`REC-000999` **sengaja dipertahankan** untuk membuktikan needle-ignoring (tidak memengaruhi urutan/healing).
- Assertion `record.prefix` dipertahankan (kosmetik).

## 6. Hasil Tes (DONE — semua PASS)

### 6.1 Smoke kontrak baru (fresh DB temp per suite)
| Suite | Hasil |
|-------|-------|
| `inventory_prefix_smoke` | **36/36 PASS** |
| `barcode_format_smoke` (murni) | **23 PASS / 0 FAIL** |

### 6.2 Regression (fresh DB temp per suite)
| Suite | Hasil |
|-------|-------|
| `wo21_import_b1b2` | **48/48 PASS** |
| `it1_borrow_return` | **34/34 PASS** |
| `it_borrow_eligibility` | **7/7 PASS** |
| `wo14_e2` | **40/40 PASS** |
| `settings_db_reset` | **58/58 PASS** |
| `dashboard_phase1` | **30/30 PASS** |
| `membership_first_borrow` | **20/20 PASS** |
| **Total regression** | **237 PASS / 0 FAIL** |

Catatan:
- `wo11a/wo11d/wo11e` **TIDAK dikompilasi** — stale (mereferensikan `AutoCreateService.apply()` API pra-WO-21 yang sudah dihapus); bukan bagian rotasi regression aktif.
- `borrow_card_uat_smoke` **TIDAK dijalankan** — tech debt pre-existing yang terdokumentasi (17 PASS / 14 FAIL dari assertion markup lama, era kartu 110×60; template sudah A6). Bukan regresi WO ini.

## 7. Gate Bangunan

| Gate | Hasil |
|------|-------|
| `npm run lint` | PASS (tsc node + web) |
| `npm run build` | PASS — main 2,399.23 kB · preload 11.70 kB · renderer 1,246.92 kB |
| `prisma migrate diff --from-migrations --to-schema-datamodel` | "This is an empty migration" — **NO DRIFT** |
| `git diff --check` | bersih (tanpa whitespace error) |

## 8. Audit Sisa Referensi

- Grep `barcode:\s` di `src/` + `electron/`: hanya 2 situs tulis (allocator) + pembaca/DTO.
- `AGENTS.md` baris 1551–1560 masih mendokumentasikan desain LAMA (riwayat); tercatat sebagai referensi historis, bukan kode yang perlu diubah.

## 9. Cakupan Negatif (Tidak Dilakukan)

- Tidak ada migration baru; `prisma migrate diff` = no drift.
- Tidak ada backfill produksi.
- Tidak ada perubahan `inventoryNumber`/counter/urutan.
- `inventoryPrefix` tetap di schema/DB/setting (hanya nilai record kosmetik).
- Tidak ada perubahan IPC/preload/env.d.ts/UI.

## 10. Hasil `git status` / `git diff`

```
 M electron/main/services/inventory-allocator.ts
 M inventory_prefix_smoke/smoke.ts
 M src/main/services/database-reconciliation.service.ts
 M src/main/services/inventory-allocator.ts
?? BARCODE_FORMAT_AUDIT_REPORT.md
?? CONSOLIDATE_BARCODE_IDENTITY_REPORT.md
```

`git diff --stat`: 4 file, +41/−33 (2 allocator + 1 komentar reconciliation + 1 smoke).

## 11. Verdict

**READY FOR MANUAL UAT** — implementasi lengkap, seluruh smoke + regression + gate bangunan hijau, tanpa perubahan schema/migration/DB. UAT manual yang disarankan di aplikasi produksi:
1. Tambah eksemplar manual → barcode baru = `INV-XXXXXX`.
2. Import buku → barcode = `INV-XXXXXX`.
3. Scan barcode saat pinjam & kembali → terdeteksi.
4. Cetak label → barcode terbaca.

## 12. Status

**DONE — menunggu review PO.** Tidak commit/push (aturan: menunggu instruksi). Tidak membuka WO berikutnya.
