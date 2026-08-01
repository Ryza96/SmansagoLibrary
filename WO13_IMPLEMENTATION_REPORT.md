# WO13_IMPLEMENTATION_REPORT.md

Feature: **Informasi Pengadaan (Procurement)** — Implementation
Mode: IMPLEMENTATION
Date: 2026-07-31

---

## 1. Ringkasan

Fitur "Informasi Pengadaan" diaktifkan dengan menambahkan kolom procurement ke model `BookCopy` (sesuai rekomendasi C.1 laporan discovery — pendekatan kolom per eksemplar, bukan model `Procurement` terpisah). Sumber perolehan, harga beli, dan catatan pengadaan kini dapat diisi saat menambah eksemplar melalui dialog "Tambah Eksemplar" di halaman detail buku, dan ditampilkan di halaman detail inventaris.

## 2. Keputusan Desain

- **Tidak membuat model `Procurement` terpisah** — harga/sumber/catatan bersifat 1:1 dengan eksemplar (`BookCopy`). Menghindari join tambahan dan relasi yang tidak diperlukan.
- **Tidak membuat entitas Vendor/Supplier** — `acquisitionSource` menggunakan nilai enum bebas string (dropdown: Pembelian/Donasi/Hibah/Bantuan Pemerintah/Lainnya). Vendor dapat ditambahkan belakangan bila dibutuhkan.
- **Reuse `acquisitionDate`** yang sudah ada di `BookCopy` — tidak ada kolom tanggal baru.
- **Harga disimpan sebagai `Int` (rupiah)** — konsisten dengan pola aplikasi (avoid float untuk uang). Validasi non-negatif integer di service layer.

## 3. Perubahan File

| File | Perubahan |
|------|-----------|
| `prisma/schema.prisma` | `BookCopy` + 3 kolom: `acquisitionSource String?`, `acquisitionPrice Int?`, `acquisitionNotes String?` |
| `prisma/migrations/20260731_wo13_procurement_fields/migration.sql` | 3 `ALTER TABLE "BookCopy" ADD COLUMN` (baseline `20260731_adr002_initial` TIDAK dimodifikasi) |
| `src/shared/dto/book.ts` | `CreateBookCopiesDTO` + 4 field opsional: `acquisitionDate`, `acquisitionSource`, `acquisitionPrice`, `acquisitionNotes` |
| `electron/main/services/book-copy.service.ts` | `addCopies` validasi `acquisitionPrice` (integer non-negatif) + teruskan 4 field ke `executeAddCopiesTransaction` → `createManyWithTx` |
| `src/main/repositories/book-copy.repository.ts` | `CreateBookCopyData` + `acquisitionSource/Price/Notes` |
| `src/renderer/env.d.ts` | `bookCopies.findById` return + `acquisitionSource/Price/Notes` (memakai `acquisitionDate` yang sudah ada) |
| `src/utils/labels.ts` | +`FIELD.ACQUISITION_DATE/SOURCE/PRICE/NOTES`; +`ACQUISITION_SOURCES` (Pembelian/Donasi/Hibah/Bantuan Pemerintah/Lainnya), `ACQUISITION_OTHER`, `ACQUISITION_SOURCE_OTHER_PLACEHOLDER` |
| `src/components/books/BookForm.tsx` | Placeholder section procurement **dihapus** (section disabled sudah tidak relevan); helper `Section` lokal dihilangkan prop `placeholder` |
| `src/components/books/BookDetail.tsx` | Dialog "Tambah Eksemplar": form procurement aktif — Tanggal Perolehan (date), Sumber Perolehan (dropdown + field "Lainnya"), Harga Beli (number), Catatan Pengadaan (textarea); `handleAdd` mengirim 4 field di `onAddCopies`; validasi lokal lokasi rak |
| `src/pages/InventoryDetailPage.tsx` | Detail inventaris menampilkan Sumber Perolehan (label terpetakan), Harga Beli (`Rp` terformat `id-ID`), Catatan Pengadaan; Tgl. Perolehan & Tgl. Dibuat tetap |

Catatan arsitektur: Stack legacy (`electron/main/services/book-copy.service.ts`) yang menangani `bookCopies:addCopies` — konsisten dengan temuan WO-007 (fitur eksemplar hidup di stack legacy). Tidak ada perubahan pada `electron/ipc`, `electron/preload`, maupun `bootstrap.ts` karena `addCopies` sudah terdaftar.

## 4. Migrasi Database

### 4.1 Blocker yang ditemukan & diperbaiki
Nama folder awal `20260731094204_wo13_procurement_fields` **mengurut lexically SEBELUM** baseline `20260731_adr002_initial` (`'0'`(0x30) < `'_'`(0x5F)). Pada fresh DB, `migrate deploy` menerapkan ALTER lebih dulu → P3018 `no such table: BookCopy`.

**Fix:** folder diganti menjadi `20260731_wo13_procurement_fields` (urut setelah `adr002`). Dev DB direkonsiliasi via mekanisme resmi:
1. `prisma migrate resolve --applied 20260731_wo13_procurement_fields` (record baru).
2. `prisma db execute` DELETE record stale `20260731094204_wo13_procurement_fields` dari `_prisma_migrations` (folder sudah tidak ada; bukan edit checksum).

Baseline tetap utuh. `prisma generate` dijalankan ulang.

### 4.2 Validasi
| Tes | Hasil |
|-----|-------|
| `migrate deploy` fresh DB (temp, 2 migration) | PASS — baseline lalu WO13, urutan benar |
| `migrate status` (fresh & dev) | PASS — "Database schema is up to date!" |
| `migrate diff --from-migrations` (fresh) | PASS — "No difference detected" |
| Smoke test Prisma client (fresh DB) | PASS — insert BookCopy dengan 4 field procurement, baca kembali, nilai identik, data uji dibersihkan |
| `npm run lint` (node + web tsconfig) | PASS — exit 0 |
| `npm run build` (electron-vite build) | PASS — ✓ built, exit 0 |

## 5. Risiko & Technical Debt

1. **Harga `Int`** — nilai maksimum ~2,1 M rupiah; cukup untuk konteks buku, tapi perhatikan bila ada eksemplar berharga di atas itu.
2. **Sumber perolehan free-text "Lainnya"** — nilai non-enum tersimpan apa adanya; tidak ada normalisasi/vendor table. Konsisten untuk saat ini, tapi tanpa konsistensi enum penuh.
3. **Validasi harga hanya di Stack legacy** (`electron/main/services/book-copy.service.ts`). Jika nanti dibuat service baru di `src/main/`, validasi harus dibawa.
4. **Record stale sudah dibersihkan** — dev DB 2 record = 2 folder, konsisten penuh.
5. **Tidak ada commit** — perubahan WO13 berada di working tree (diatas 194 perubahan staged WO-BR-99). Keputusan commit menunggu instruksi.

## 6. Kesimpulan

**READY.** Fitur procurement aktif end-to-end: schema+migration → service (validasi) → repository → DTO → UI form (dialog tambah eksemplar) → tampilan detail inventaris. Fresh DB deploy terverifikasi; lint & build PASS; smoke test DB PASS.
