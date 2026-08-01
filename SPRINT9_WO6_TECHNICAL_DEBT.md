# SPRINT9 — WO-6 Technical Debt Register
**Book Import**

| ID | Item | Dampak | Rencana | Prioritas |
|----|------|--------|---------|-----------|
| TD-1 | Template riil tidak punya kolom `publisher` (F-5) → `publisher` selalu SKIPPED → semua baris kena `bookImport.entityMissing`, Book tidak pernah dibuat di pipeline nyata | Fitur import buku mati total sampai diputuskan | Keputusan PO: tambah kolom publisher ke template ATAU relaksasi syarat (publisher boleh null) ATAU keluarkan strategy publisher | **Kritis** |
| TD-2 | `matchingResult.valid` masih hardcoded `true` (engine) padahal `errors` kini bisa terisi | Konsumen yang memercayai `valid` mengira import sukses padahal ada baris gagal | WO lanjutan: hitung valid dari errors/warnings nyata (ubah engine — di luar batasan WO-6) | Tinggi |
| TD-3 | `publicationYear` (template `year`) tidak di-persist ke Book | Data tahun hilang saat impor; template mengumpulkannya tapi WO-6 mengabaikan | Tambah `publicationYear` ke `CreateBookData` call di WO lanjutan (satu baris) | Sedang |
| TD-4 | Import per-baris non-transaksional (book + author/publisher/category dibuat terpisah, tanpa batch tx) | Kegagalan di tengah batch menyisakan sebagian entity ter-create tanpa Book (parsial, tak bisa rollback seluruh batch) | WO lanjutan: bungkus match→auto-create→book-import dalam satu transaksi (perlu tx di repository) | Sedang |
| TD-5 | Recovery P2002 di Book create hanya membedakan duplicate vs generic; tanpa retry | Race langka bisa dicatat duplicate meski penyebab lain | Evaluasi bila kasus muncul | Rendah |
| TD-6 | Tidak ada batas/limit jumlah baris yang di-import | Workbook sangat besar → banyak `Promise`/IO sekuensial; performa dan waktu trip IPC | Throttling/batching bila dibutuhkan | Rendah |
| TD-7 | Auto Create dan Book Import menulis issue ke dua tempat (row + matchingResult) dengan referensi objek sama | Konsumen yang memodifikasi array bisa memengaruhi dua sisi; kecil | Pertahankan selama belum ada konsumen UI | Rendah |

## Catatan
- TD-1 adalah **blocker fungsional** untuk pipeline nyata (bukan blocker kode): implementasi WO-6 sudah sesuai spec
  dan lolos smoke; keputusan publisher milik PO. Seluruh komponen pipeline (match → auto-create → book import)
  berjalan benar bila `publisher` tersedia di baris.
- Tidak ada file di luar scope yang diubah; verifikasi `git status` menunjukkan hanya file WO-6 + laporan.
