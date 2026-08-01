# WO13_REVISION1_REPORT.md

Work Order: **WO-13 Revision 1**
Mode: IMPLEMENTATION REVISION
Date: 2026-07-31
Basis: Implementasi WO13 (`WO13_IMPLEMENTATION_REPORT.md`) — sudah terpasang dan terverifikasi.

---

## 1. Ringkasan Perubahan

Revisi ini menyesuaikan implementasi WO13 dengan keputusan arsitektur terbaru:

1. **Rename kolom/istilah** `acquisitionPrice` → `acquisitionCost`. Label UI berubah dari "Harga Beli" menjadi **"Harga Perolehan"**.
2. **`acquisitionSource` kini hanya menyimpan nilai enum** — `PEMBELIAN`, `DONASI`, `HIBAH`, `BANTUAN_PEMERINTAH`, `LAINNYA`. Free text tidak lagi disimpan di kolom ini.
3. **Field baru `acquisitionSourceDetail` (Nullable)** — textbox "Jelaskan Sumber Perolehan" hanya muncul bila `acquisitionSource = LAINNYA`; nilainya disimpan ke field ini.
4. **Inventory Detail menampilkan blok "Detail"** untuk sumber `LAINNYA`; untuk sumber lain blok Detail disembunyikan bila kosong.

## 2. File yang Berubah

| File | Perubahan |
|------|-----------|
| `prisma/schema.prisma` | `BookCopy.acquisitionPrice` → `acquisitionCost Int?`; tambah `acquisitionSourceDetail String?` (`prisma format` merapikan alignment seluruh file — hanya whitespace) |
| `prisma/migrations/20260731_wo13_revision1_source_detail/migration.sql` | **Migration baru** (lihat §3) — migration lama TIDAK diedit |
| `src/shared/dto/book.ts` | `CreateBookCopiesDTO`: `acquisitionPrice?` → `acquisitionCost?`, tambah `acquisitionSourceDetail?` |
| `electron/main/services/book-copy.service.ts` | Rename validasi + persist ke `acquisitionCost`; error message "Harga perolehan harus berupa bilangan bulat positif."; **validasi enum sumber** (`VALID_ACQUISITION_SOURCES`); persist `acquisitionSourceDetail`; signature `executeAddCopiesTransaction` diperbarui |
| `src/main/repositories/book-copy.repository.ts` | `CreateBookCopyData`: `acquisitionPrice?` → `acquisitionCost?`, tambah `acquisitionSourceDetail?` |
| `src/renderer/env.d.ts` | `bookCopies.findById`: `acquisitionPrice` → `acquisitionCost`, tambah `acquisitionSourceDetail` |
| `src/utils/labels.ts` | `FIELD.ACQUISITION_PRICE: 'Harga Beli'` → `FIELD.ACQUISITION_COST: 'Harga Perolehan'`; tambah `FIELD.ACQUISITION_SOURCE_DETAIL: 'Jelaskan Sumber Perolehan'`; `ACQUISITION_OTHER` & `ACQUISITION_SOURCE_OTHER_PLACEHOLDER` diganti `ACQUISITION_SOURCE_DETAIL_PLACEHOLDER` |
| `src/components/books/BookDetail.tsx` | Form tambah eksemplar: dropdown sumber menyimpan nilai enum asli; textbox "Jelaskan Sumber Perolehan" (state `acquisitionSourceDetail`) hanya tampil saat `LAINNYA`; input harga → `acquisitionCost`; label "Harga Perolehan"; state `otherSource` dihapus |
| `src/pages/InventoryDetailPage.tsx` | Label "Harga Perolehan" + `copy.acquisitionCost`; blok "Detail" (`acquisitionSourceDetail`) tampil saat `source === 'LAINNYA'` atau detail terisi |

**Tidak terdampak:** IPC, preload, bootstrap (channel `bookCopies:addCopies` sudah ada, bentuk argumen mengikuti DTO yang diperbarui). `src/types/dtos/book` adalah re-export shared DTO — tidak perlu diubah.

**Sisa (di luar ruang lingkup):** `LABELS.FIELD.PRICE: 'Harga Beli'` (labels.ts:109) — key lama yang TIDAK dipakai oleh kode mana pun dan tidak terkait field acquisition. Tidak diubah untuk menghindari refactor di luar scope.

## 3. Migration Baru

`prisma/migrations/20260731_wo13_revision1_source_detail/migration.sql`

```sql
-- AlterTable
ALTER TABLE "BookCopy" RENAME COLUMN "acquisitionPrice" TO "acquisitionCost";
ALTER TABLE "BookCopy" ADD COLUMN "acquisitionSourceDetail" TEXT;
```

Catatan:
- **Ditulis manual dengan `RENAME COLUMN`** (Prisma `migrate diff` akan menghasilkan DROP+ADD yang menghilangkan data). Rename SQLite didukung (≥3.25) dan mengawetkan nilai harga yang sudah tersimpan.
- Nama folder (`20260731_wo13_revision1_...`) mengurut lexically **setelah** `20260731_wo13_procurement_fields` (`r` > `p`) sehingga fresh deploy berurutan benar: baseline → WO13 → R1.
- Migration WO13 sebelumnya **tidak diedit**; baseline `20260731_adr002_initial` tidak tersentuh.
- Dev DB diaplikasikan langsung via `prisma migrate deploy` (3 migration, hijau). Tidak ada rename folder → tidak perlu `migrate resolve`.

## 4. Validasi

| Tes | Hasil |
|-----|-------|
| `prisma generate` | PASS — Generated Prisma Client v5.22.0 |
| `prisma migrate deploy` (dev DB) | PASS — 3 migration, "All migrations have been successfully applied" |
| `migrate status` (dev & fresh) | PASS — "Database schema is up to date!" |
| `migrate diff --from-migrations` | PASS — "No difference detected" |
| **Fresh DB deploy** (temp DB) | PASS — urutan: `20260731_adr002_initial` → `20260731_wo13_procurement_fields` → `20260731_wo13_revision1_source_detail` |
| `npm run lint` (node + web) | PASS — exit 0 |
| `npm run build` (electron-vite) | PASS — ✓ built, exit 0 |
| Smoke test Prisma client (fresh DB) | PASS — insert BookCopy (`acquisitionSource: 'LAINNYA'`, `acquisitionCost: 125000`, `acquisitionSourceDetail: 'Sumbangan Alumni 1998'`) → baca kembali nilai identik; referensi ke kolom lama `acquisitionPrice` ditolak client (rename terbukti); data uji dibersihkan |

## 5. Risiko & Technical Debt

1. **Kolom `acquisitionCost` bertipe `Int` (rupiah)** — maksimum ~2,1 M; cukup untuk konteks ini. Nilai yang tersimpan pada data lama (jika ada) dipertahankan oleh `RENAME COLUMN`.
2. **`acquisitionSource` adalah string enum tanpa DB constraint** — dijamin konsisten oleh validasi service layer (`VALID_ACQUISITION_SOURCES`) dan UI (dropdown). Jika nanti dibutuhkan, bisa diubah ke Prisma enum + migration.
3. **Validasi enum & harga hanya di Stack legacy** (`electron/main/services/book-copy.service.ts`) — konsisten dengan lokasi fitur addCopies saat ini.
4. **`acquisitionSourceDetail` bebas diset untuk sumber non-`LAINNYA`** oleh pemanggil API langsung (service tidak menolak). UI hanya mengirim saat `LAINNYA`. Bisa diperketat dengan validasi kondisional bila diperlukan.
5. **Belum ada commit** — perubahan ada di working tree (WO-BR-99 staged + WO13 + R1 ini). Menunggu instruksi.

## 6. Perubahan dari Implementasi Sebelumnya

| Aspek | Sebelum (WO13) | Sesudah (R1) |
|-------|----------------|--------------|
| Kolom harga | `acquisitionPrice Int?` | `acquisitionCost Int?` |
| Label UI harga | "Harga Beli" | "Harga Perolehan" |
| Nilai `acquisitionSource` saat "Lainnya" | Free text pengguna langsung disimpan ke `acquisitionSource` | Selalu enum `LAINNYA` |
| Keterangan "Lainnya" | Tidak ada kolom (free text di `acquisitionSource`) | Kolom baru `acquisitionSourceDetail` (nullable) |
| Tampilan "Lainnya" di Inventory Detail | Sumber menampilkan teks bebas, tanpa detail | "Sumber Perolehan: Lainnya" + blok "Detail" |
| Constraint sumber | Tidak ada validasi | Validasi enum di service (`VALID_ACQUISITION_SOURCES`) |

## 7. Kesimpulan

**READY.** Seluruh persyaratan R1 terpenuhi: rename `acquisitionCost` konsisten lintas layer (schema/migration/DTO/repository/service/renderer/inventory/form), sumber selalu enum, field detail baru dengan perilaku tampil hanya saat `LAINNYA`, dan Inventory Detail menampilkan Sumber + Detail. Semua validasi lint, build, dan fresh-DB migration PASS; smoke test PASS.
