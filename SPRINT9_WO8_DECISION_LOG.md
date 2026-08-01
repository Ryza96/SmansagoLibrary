# SPRINT9 — WO-8 Decision Log
**Barcode & Label**

## A. Keputusan Product Owner
| ID | Keputusan | Opsi | Keputusan & Alasan | Konsekuensi |
|----|-----------|------|---------------------|-------------|
| PO-1 | Nilai barcode di DB | (a) format `BC-XXXX`, (b) = `inventoryNumber` | **(b) barcode = `inventoryNumber`** (contoh `INV-000001`). Disetujui PO. | Nilai unik by construction (inventoryNumber unik); eksemplar lama & hasil import langsung valid; metode `generateBarcodes` (BC-hex) dihapus. |
| PO-2 | Simbol barcode | (a) QR, (b) Code128 | **(b) Code128** (`bcid:'code128'`). Disetujui PO. | `bwip-js` render; teks terlihat (includetext) sesuai nilai barcode. |
| PO-3 | Penyimpanan gambar barcode | (a) simpan gambar di DB, (b) render saat cetak | **(b) render saat cetak.** Disetujui PO. Gambar tidak pernah disimpan; `generateBarcodeSvg` dipanggil saat menyusun HTML label. | Tidak ada kolom/simpanan gambar; DB tetap hanya string `barcode`; label selalu segar dari nilai saat ini. |
| PO-4 | `Setting.barcodeFormat` | (a) konsumsi & terapkan, (b) biarkan | **(b) biarkan tetap ada, tidak dikonsumsi.** Disetujui PO. | Setting dekoratif; tidak memengaruhi nilai/render; potensi kebingungan dikunci TD. |

## B. Keputusan Teknis (implementasi)
| ID | Keputusan | Opsi | Keputusan & Alasan | Konsekuensi |
|----|-----------|------|---------------------|-------------|
| D-1 | Library barcode | (a) `jsbarcode`, (b) `bwip-js`, (c) mandiri | **(b) `bwip-js@4.11.2`** — pure JS (tanpa native), API `toSVG` siap, dukungan Code128 + includetext. | Dep 1 paket; bundle naik (main ~1.7 MB); wajib `import bwip-js/node` (conditional exports, lihat D-2). |
| D-2 | Import `bwip-js/node` | (a) `import bwipjs from 'bwip-js'`, (b) `bwip-js/node` | **(b) `bwip-js/node`.** Paket memakai conditional exports; dengan `moduleResolution: bundler` import default tidak ter-resolve saat build/lint. | Import spesifik entry node; smoke memerlukan `NODE_PATH` agar resolve. |
| D-3 | Lokasi service | (a) legacy `electron/main`, (b) new `src/main` | **(b) `src/main/services/`** — service murni (tanpa electron/DB), selaras pola new-stack; `label.service` diimpor PrintService legacy. | PrintService (legacy) mengimpor dari `src/main/services` — satu arah, tidak ada cycle. |
| D-4 | DTO label | (a) expand `BookCopyDTO`, (b) DTO print baru | **(b) `BookLabelData`/`BookLabelItemData` di `src/shared/dto/print.ts`** — memisahkan kontrak cetak dari DTO buku; tidak mengubah konsumen `BookCopyDTO`. | Kontrak print lengkap: bookTitle + items(barcode, inventoryNumber, shelfLocation). |
| D-5 | Fallback nilai barcode | (a) wajib barcode non-kosong, (b) `item.barcode \|\| item.inventoryNumber` | **(b) fallback ke inventoryNumber.** Menjamin eksemplar dengan barcode kosong (jika ada data lama) tetap bisa dicetak; nilai inventoryNumber selalu ada & valid. | Label tetap terrender walau barcode null/empty. |
| D-6 | Ukuran label / halaman | (a) A4 + grid 2 kolom, (b) ukuran driver thermal | **(a) `@page size:A4 margin:0`, `.label` 50% × 63mm (2 kolom), `page-break-inside:avoid`, print `margins:none`.** Tidak ada spec printer label; A4 adalah baseline aman. | Label terbagi 2 per baris; printer hardware belum diverifikasi (TD). |
| D-7 | `printHtml` kompatibilitas resit | (a) buat print path baru, (b) param opsional | **(b) `printHtml(html, printOptions?: WebContentsPrintOptions)`** di-spread setelah default `{margins:default, printBackground:true}`. Resit lama memanggil tanpa arg → perilaku identik. | Tidak ada regresi resit (Build PASS; diff hanya +param opsional). |
| D-8 | Nilai `barcode` saat addCopies | (a) tetap `BC-hex`, (b) = inventoryNumber | **(b) `barcode: invNum` (PO-1).** `generateBarcodes` dihapus total. `crypto` tetap dipakai untuk `crypto.randomUUID()` id. | Manual "Tambah Eksemplar" dan import kini konsisten: keduanya `barcode=inventoryNumber`. |
| D-9 | Backfill eksisting | (a) regenerate barcode lama, (b) tidak | **(b) tidak.** Nilai `INV-...` (semua eksemplar) sudah valid sebagai input Code128 → label lama langsung render; menghindari risiko duplikat/migrasi (audit §6 risk-2). | Tidak ada migrasi; ekosistem nilai barcode seragam `INV-...`; `BC-...` lama tidak ada lagi (generateBarcodes dihapus). |

## Catatan
- PO-1 s.d. PO-4 adalah keputusan eksplisit Product Owner yang menggantikan rekomendasi audit WO-8
  ("generate nilai di waktu create" + format `BC-XXXXXXXXXX`). Implementasi mengikuti PO, bukan rekomendasi audit.
- D-6 menyimpan printer label hardware sebagai risiko yang belum diverifikasi (tercatat di Technical Debt).
- Tidak ada perubahan kontrak di luar `print.bookLabels` (baru) dan `printHtml` (param opsional, non-breaking);
  konsumen resit (BorrowingsPage, ReturnsPage) tidak terpengaruh.

## C. Revisi (Review PO — DB Smoke Blocker)
| ID | Keputusan | Opsi | Keputusan & Alasan | Konsekuensi |
|----|-----------|------|---------------------|-------------|
| R-1 | Penyebab TypeError `reading 'book'` pada smoke | (a) ubah kode aplikasi, (b) perbaiki prosedur smoke | **(b) perbaiki prosedur smoke.** Root cause = smoke mengimpor singleton `prisma` via destructure saat require (nilai `undefined` sebelum `initDatabase()`), bukan bug kode. Smoke kini mengakses `db.prisma` (binding live) setelah `await initDatabase()`. | Kode aplikasi tidak berubah; smoke stabil. |
| R-2 | Assertion `sequential inventory numbers` FAIL | (a) ubah assertion, (b) run pada fresh DB | **(b) fresh DB per run.** Root cause = DB temp menyimpan 3 baris dari run sebelumnya (`INV-000001..003`) sehingga alokasi berlanjut ke `004+`. Assertion benar (mulai `000001`); data yang salah. | Smoke deterministik: hapus `.db`/WAL/SHM → `prisma migrate deploy` → run. |
| R-3 | Apakah ada perbaikan kode WO-8? | (a) ya, (b) tidak | **(b) tidak.** `book-copy.service.ts` diverifikasi utuh (`barcode: invNum`, retry P2002, tanpa sisa `generateBarcodes`); BookRepository/database singleton/`initDatabase()` tidak berubah. | Tidak ada perubahan scope; revisi murni prosedural. |
