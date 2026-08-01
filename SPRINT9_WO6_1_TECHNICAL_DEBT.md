# SPRINT9 — WO-6.1 Technical Debt Register
**Template Import + Publisher**

| ID | Item | Dampak | Rencana | Prioritas |
|----|------|--------|---------|-----------|
| **TD-1** | Template riil tidak punya kolom `publisher` → semua baris kena `bookImport.entityMissing` (dari WO-6) | Fitur import buku mati total di pipeline nyata | **DITUTUP oleh WO-6.1** — kolom Penerbit ditambahkan (template v3) + sinonim header; smoke membuktikan `publisherId` terisi | — (closed) |
| TD-2 | `matchingResult.valid` masih hardcoded `true` (engine) padahal `errors` kini bisa terisi | Konsumen yang memercayai `valid` mengira import sukses padahal ada baris gagal | WO lanjutan: hitung valid dari errors/warnings nyata (ubah engine — di luar batasan WO-6/WO-6.1) | Tinggi |
| TD-3 | `publicationYear` (template `year`) tidak di-persist ke Book | Data tahun hilang saat impor; template mengumpulkannya tapi BookImportService mengabaikan | Tambah `publicationYear` ke `CreateBookData` call (satu baris) | Sedang |
| TD-4 | Import per-baris non-transaksional (book + author/publisher/category dibuat terpisah, tanpa batch tx) | Kegagalan di tengah batch menyisakan sebagian entity ter-create tanpa Book | WO lanjutan: bungkus match→auto-create→book-import dalam satu transaksi | Sedang |
| TD-5 | Sinonim header hanya untuk `publisher` → `penerbit` (mapping statis, bukan mekanisme alias generik) | Alias baru (mis. `penulis` → `authors`, `ISBN-13`) butuh edit `HEADER_SYNONYMS` | Umumkan mekanisme alias bila kebutuhan muncul | Rendah |
| TD-6 | Template `id` (`book-import-v3`) tidak dirender/divalidasi di UI; tombol Download Template masih placeholder ("akan tersedia di Sprint 3") | Belum ada cara resmi mengunduh template v3 untuk pengguna | Implementasi download template + versi template yang dikelola | Sedang |
| TD-7 | Tidak ada suite test otomatis yang di-retain untuk pipeline import (semua smoke one-off; hanya `scripts/smoke-match-strategies.ts` yang dipertahankan) | Regresi pipeline tidak terdeteksi otomatis | Bangun suite smoke ter-retain bila pipeline memasuki fase stabil | Sedang |
| TD-8 | `minColumns` di `import.config.ts` (1) tidak sinkron dengan jumlah kolom template (6) — hanya `requiredColumnCount` yang diandalkan | Nilai `minColumns` menyesatkan jika dibaca terpisah | Sinkronkan atau hapus bila tidak dipakai | Rendah |

## Catatan
- TD-1 (blocker dari WO-6) ditutup di WO-6.1; TD-2/3/4 adalah warisan WO-6 yang tetap berlaku dan berada di
  luar batasan WO-6.1 (melibatkan perubahan Engine/BookImport).
- WO-6.1 tidak menambah utang baru yang disengaja; TD-5/6/7/8 adalah pengamatan pada batas scope (normalizer
  minimal, placeholder template yang sudah ada, tidak ada suite ter-retain, `minColumns`).
