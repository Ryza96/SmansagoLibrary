# SPRINT9 — WO-8 Technical Debt Register
**Barcode & Label**

| ID | Item | Dampak | Rencana | Prioritas |
|----|------|--------|---------|-----------|
| TD-1 | `Setting.barcodeFormat` (`BC-XXXXXXXXXX`) tidak dikonsumsi siapa pun (Keputusan PO #4) | Setting menampilkan format yang tidak memengaruhi nilai/render barcode; pengguna bisa keliru mengira format terkontrol | Definisi semantik `barcodeFormat` (mask → aturan nilai/checksum) sebagai WO tersendiri, bila PO memutuskan konfigurasi format | Rendah |
| TD-2 | Printer label hardware belum diverifikasi | Label A4 2 kolom (`.label` 50% × 63mm, `@page A4`, `margins:none`) mungkin tidak pas dengan printer thermal/ukuran stiker aktual perpustakaan | Pilot cetak+scan dengan printer & scanner riil; bila perlu dukungan ukuran kertas (A6/thermal) + pratinjau (`silent:false`) | Tinggi |
| TD-3 | Tidak ada pratinjau label sebelum cetak | User mencetak langsung tanpa melihat hasil; risiko pemborosan kertas saat layout belum sesuai | Tambah pratinjau (webContents.print silent:false / PDF preview) di UI bila diperlukan | Sedang |
| TD-4 | `generateBarcodes` dihapus tanpa backfill nilai `BC-...` eksisting | Sebelumnya nilai barcode manual = `BC-<12hex>`; jika ada row lama dengan nilai `BC-...` (selain `INV-...`) tetap tersimpan, mereka masih valid untuk render Code128 (string) — hanya tidak seragam format | Audit DB: pastikan tidak ada nilai `BC-...` tersisa; bila ada, pertimbangkan normalisasi terpisah | Rendah |
| TD-5 | Cetak label hanya dari `BookDetail.tsx` (semua eksemplar buku) | Belum ada cetak label dari `InventoryDetailPage`/`InventoryPage`, seleksi eksemplar, atau cetak massal lintas buku | WO lanjutan: entry cetak label di halaman inventori + seleksi/massal | Sedang |
| TD-6 | Label A4: baris label tidak di-wrap ke halaman berikutnya secara eksplisit (`display:flex`; `page-break-inside:avoid` per label) | Halaman >1 label: pemisah halaman bergantung engine print (Chromium); hasil antar driver bisa berbeda | Verifikasi hasil print nyata; bila perlu tambahkan kontainer halaman eksplisit per N label | Rendah |
| TD-7 | Dependency `bwip-js` menambah ukuran bundle main (`~1.7 MB`) | Ukuran app/packaging naik; belum diverifikasi paket installer (offline install) | Verifikasi `package:win` saat packaging sprint berikutnya | Rendah |
| TD-8 | `BookLabelData` DTO dibangun di renderer dari `BookCopyDTO` (bukan dibaca langsung di main) | UI bergantung pada field `barcode`/`inventoryNumber`/`shelfLocation` yang tersedia di DTO; judul berasal dari `book.title` di halaman | Bila label perlu data tambahan (isbn, kategori) di masa depan, pindahkan komposisi DTO label ke main-process via repository | Rendah |

## Catatan
- TD-1 adalah keputusan PO eksplisit (bukan kelalaian) — sengaja ditunda.
- TD-2/TD-3 adalah risiko hardware & UX yang sudah diidentifikasi di audit WO-8 (§6 risk 1, 3, 4) dan tetap terbuka.
- WO-8 tidak menambah utang placeholder baru di data; nilai barcode kini konsisten (`= inventoryNumber`) di kedua jalur (manual + import).
- Verifikasi `git status`: hanya file WO-8 + laporan yang berubah/baru di scope (di atas working tree WO-BR-99/WO13 yang tidak disentuh).

## Revisi (Review PO)
Revisi ini **tidak menambah TD baru**. Perbaikan yang dilakukan pada smoke (fresh DB per run, akses
singleton `db.prisma` setelah `initDatabase()`) adalah prosedur verifikasi, bukan perubahan aplikasi —
oleh karena itu tidak menambah utang teknis. TD-2 (verifikasi printer) tetap prioritas utama sebelum
rollout cetak label.
