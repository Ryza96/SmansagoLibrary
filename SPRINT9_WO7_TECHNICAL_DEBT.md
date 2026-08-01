# SPRINT9 — WO-7 Technical Debt Register
**BookCopy Creation**

| ID | Item | Dampak | Rencana | Prioritas |
|----|------|--------|---------|-----------|
| TD-1 | Barcode BookCopy = placeholder `inventoryNumber` (WO-7 melarang membuat barcode) | Eksemplar hasil impor belum punya barcode sesuai format setting (`BC-XXXXXXXXXX`); label belum bisa dicetak dengan barcode asli | WO khusus: generate barcode (format dari `Setting.barcodeFormat`) + pembuatan label | Tinggi |
| TD-2 | `shelfLocation = ''` — tidak membaca `Setting.defaultShelfLocation` | Eksemplar hasil impor punya lokasi rak kosong; perlu diedit manual | Integrasi SettingService (atau repository setting new-stack) saat membaca default lokasi rak | Sedang |
| TD-3 | Import non-transaksional (warisan TD-4 WO-6): Book + BookCopy dibuat terpisah | Copy gagal → Book yatim (issue `bookImport.copyCreateFailed` dicatat, tanpa rollback Book) | WO lanjutan: bungkus match→auto-create→book-import dalam satu transaksi (butuh tx di repository) | Sedang |
| TD-4 | Alokasi inventoryNumber `count()+1` tidak concurrency-safe (pola NumberGeneratorService) | Bentrok nomor pada akses konkuren; retry P2002 meredam kasus umum | Pakai persistent sequence (`InventorySequence`) bila multi-user diperlukan | Sedang |
| TD-5 | `matchingResult.valid` masih hardcoded `true` (warisan TD-2 WO-6) | Konsumen yang memercayai `valid` mengira import sukses padahal ada baris gagal | WO lanjutan: hitung valid dari errors/warnings nyata | Tinggi |
| TD-6 | `publicationYear` (template `year`) tidak di-persist ke Book (warisan TD-3 WO-6) | Data tahun hilang saat impor | Tambah `publicationYear` ke `CreateBookData` call | Sedang |
| TD-7 | Tidak ada info/issue sukses copy (hanya error yang dicatat) | Renderer tidak bisa membedakan "copy dibuat" vs "copy gagal" tanpa query tambahan | Bila dibutuhkan, tambah kontrak hasil yang memuat jumlah copy dibuat | Rendah |

## Catatan
- WO-7 menambah TD-1, TD-2, TD-4, TD-7; TD-3/5/6 adalah warisan WO-6 yang tetap berlaku.
- Tidak ada utang baru yang disengaja di luar kebutuhan placeholder (barcode, shelf location) — keduanya
  merupakan konsekuensi langsung dari batasan WO ("JANGAN membuat Barcode", tidak ada input lokasi rak).
- Verifikasi `git status`: hanya file WO-7 + laporan yang berubah/baru di scope.
