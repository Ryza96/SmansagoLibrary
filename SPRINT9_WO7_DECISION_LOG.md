# SPRINT9 — WO-7 Decision Log
**BookCopy Creation**

| ID | Keputusan | Opsi | Keputusan & Alasan | Konsekuensi |
|----|-----------|------|---------------------|-------------|
| D-1 | Alokasi `inventoryNumber` | (a) reuse `InventoryAllocator` legacy, (b) pola `count()+1` new-stack | **(b) `count()+1` dipad 6, prefix `INV`, retry 3× pada P2002.** Mengikuti pola `NumberGeneratorService` (new-stack, TD concurrency sudah diterima). Opsi (a) butuh `Prisma.TransactionClient` (cross-stack + "pakai Prisma"), ditolak. | Nomor berurutan `INV-000001...`; tidak concurrency-safe (sama dgn NumberGeneratorService); retry menangani gap akibat baris terhapus. |
| D-2 | Nilai `barcode` (wajib, unik, non-null) | (a) generate `BC-...`, (b) placeholder = inventoryNumber | **(b) `barcode = inventoryNumber` (placeholder).** WO-7 melarang "membuat Barcode" → tidak boleh generate nilai barcode. InventoryNumber unik by construction, jadi memenuhi constraint unik tanpa logika barcode. | Copy tercipta dengan barcode sementara; format barcode asli + label ditunda ke WO khusus (TD). |
| D-3 | `shelfLocation` (required schema) | (a) `''`, (b) baca `Setting.defaultShelfLocation` via SettingService legacy | **(a) `''`.** Tidak ada input lokasi rak pada impor; membaca setting berarti import cross-stack (new → legacy) atau repository baru — bertentangan dengan minimal change. | Copy punya shelfLocation kosong; integrasi `Setting.defaultShelfLocation` dicatat di TD. |
| D-4 | `status` / `condition` | (a) set eksplisit, (b) default schema | **(b) tidak diset** — default DB `AVAILABLE` / `GOOD` = status default domain saat ini, sesuai aturan BookCopyRepository. | Copy tercipta dengan status AVAILABLE (diverifikasi smoke). |
| D-5 | Atomicity Book + BookCopy | (a) satu transaksi, (b) sekuensial | **(b) sekuensial.** Repository tidak menerima tx client (BaseRepository singleton); membuat atomik butuh modifikasi repository (dilarang) atau `prisma.*` langsung (dilarang). Requirement #4 hanya mewajibkan arah maju (Book gagal → tanpa copy), yang terpenuhi secara struktural. | Book gagal → tanpa copy (terbukti smoke); copy gagal → Book yatim + issue `bookImport.copyCreateFailed` (TD-4 warisan WO-6). |
| D-6 | Perilaku saat copy gagal | (a) crash batch, (b) catat issue & lanjut | **(b) catat `bookImport.copyCreateFailed`** di `row.issues` + `matchingResult.errors`, batch tetap lanjut. Konsisten dengan pola error per-baris BookImportService. | Renderer mendapat hasil akhir dengan error teragregasi. |
| D-7 | Integrasi di mana | (a) service baru, (b) di BookImportService | **(b) di BookImportService** — izin eksplisit WO-7 ("mengubah BookImportService di luar kebutuhan integrasi BookCopy"); menambah service baru = scope creep. | Constructor BookImportService berubah (Public API Changed) — konsumen: bootstrap + smoke. |

## Catatan
- Keputusan D-2 dan D-3 adalah keputusan placeholder karena data sumber (barcode generator, lokasi rak)
  memang tidak tersedia pada tahap impor dan sengaja tidak diimplementasikan (barcode dilarang, lokasi rak
  bukan bagian impor). Keduanya dicatat di TD agar tidak hilang.
- Tidak ada perubahan kontrak di luar constructor BookImportService; IPC/preload/UI tidak terpengaruh.
