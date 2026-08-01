# SPRINT9 — WO-6.1 Decision Log
**Template Import + Publisher**

| ID | Keputusan | Opsi | Keputusan & Alasan | Konsekuensi |
|----|-----------|------|---------------------|-------------|
| D-1 | Label header kolom publisher | (a) `Penerbit`, (b) `Publisher`, (c) dukung keduanya | **Dukung keduanya** (keputusan PO via klarifikasi). Label resmi template = **`Penerbit`** (konsisten dengan label lain yang berbahasa Indonesia: Judul, Penulis, Tahun, Kategori). Header Normalizer ditambah sinonim `publisher` → `penerbit` sehingga header English `Publisher` juga diterima. Kunci kanonik tetap **`publisher`** (paritas dengan strategy/field). | Header `Penerbit` (case-insensitive) dan `Publisher` keduanya valid; konsumen template tidak perlu tahu label. |
| D-2 | Kolom publisher wajib isi? | (a) optional, (b) required | **`requiredValue: true`** (wajib). BookImportService menolak baris tanpa `publisherId` (`bookImport.entityMissing`); deteksi lebih awal di validation memberi pesan jelas (`IMP-013` dengan metadata kolom `Penerbit`). | Baris tanpa nilai Penerbit ditolak saat validation; file 5 kolom lama ditolak `IMP-010`. |
| D-3 | Posisi kolom | sebelum `year`, sesudah `year`, dll. | **Setelah `authors`** (posisi 3): Judul, Penulis, Penerbit, Tahun, Kategori, ISBN — urutan logis entitas (title → pencipta → penerbit → metadata). | File Excel harus mengikuti urutan posisi ini; validasi posisional berbasis template. |
| D-4 | Version bump template | tetap `v2`, jadi `v3` | **`book-import-v3`** — perubahan skema kolom layak menaikkan id template; `id` tidak direferensikan konsumen lain. | `description` ikut diperbarui (menyebut Penerbit). |
| D-5 | Di mana sinonim diterapkan | HeaderNormalizerService vs ValidationEngineService vs config | **HeaderNormalizerService** — lapisan tunggal yang memetakan teks header → bentuk kanonik; validasi tetap berbasis perbandingan normal terhadap label template tanpa logika baru. | Perubahan normalizer berdampak seragam pada validasi header (nama & urutan); tidak menyentuh aturan validasi. |
| D-6 | `requiredColumn` kolom publisher | false vs true | **`requiredColumn: true`** — file harus berisi kolom Penerbit; konsisten dengan semua kolom template lain. | `requiredColumnCount` naik 5 → 6; header count diperiksa terhadap 6. |

## Catatan
- Keputusan D-1 berasal dari pertanyaan klarifikasi ke PO (hasil: "Dukung keduanya").
- Seluruh keputusan tidak mengubah kontrak pipeline (match → auto-create → book import); hanya menghubungkan
  kolom baru ke kunci kanonik `publisher` yang sudah ditangani di setiap tahap.
