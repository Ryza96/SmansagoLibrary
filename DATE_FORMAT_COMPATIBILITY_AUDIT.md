# DATE_FORMAT_COMPATIBILITY_AUDIT

**Fitur:** Import Anggota — Audit Parsing Tanggal Lahir
**Status:** READ ONLY (tidak ada perubahan kode)
**Tanggal:** 2026-08-03
**Auditor:** Project Engineer
**Reviewer:** Product Owner

---

## 1. Current Parsing Flow

Berikut lapisan pemrosesan field **Tanggal Lahir** dari file Excel sampai tersimpan ke database:

| # | Layer | File | Peran terhadap Tanggal Lahir |
|---|-------|------|------------------------------|
| 1 | Cell Extraction | `src/services/WorkbookReaderService.ts` → `read-excel-file` v9.3.5 | Membaca sel. Sel angka dengan *number format* tanggal → dikonversi ke objek `Date` (UTC tengah malam). Sel angka biasa (General) → `number`. Sel teks → `string`. |
| 2 | Excel Parser | `src/services/MemberExcelParserService.ts:40-45` (`normalizeDateValue`) | Hanya menangani **angka serial**: jika `typeof value === 'number'` dalam rentang `1..2958465` → `new Date(Math.round((value - 25569) * 86400000))`. Selain itu nilai diteruskan apa adanya. |
| 3 | Validation | `src/services/MemberImportValidationService.ts:37-45` (`isDateLike`) | `Date` → valid bila `getTime()` tidak NaN. `string` → valid bila `Date.parse(trimmed)` tidak NaN. Angka → `false` (sudah dikonversi di layer 2). |
| 4 | Preview | `src/services/MemberPreviewService.ts` + `MemberImportDialog.tsx` | Status baris (VALID/ERROR/DUPLICATE) dari hasil validasi layer 3 + preflight backend. |
| 5 | Renderer → IPC | `src/components/members/MemberImportDialog.tsx:45-49` (`toDateString`) | `Date` → `value.toISOString().slice(0,10)` (`YYYY-MM-DD`). `string` → dikembalikan apa adanya (trim). Hasil dikirim ke backend lewat `members:previewCheck` / `members:import`. |
| 6 | Persist | `src/main/services/member-import.service.ts:234-238` (`parseBirthDate`) | `new Date(value)` → disimpan ke kolom `Member.birthDate`. Bila NaN → `undefined` (tanggal tidak tersimpan). |

**Kesimpulan flow:** Tidak ada parser tanggal eksplisit. Seluruh interpretasi tanggal bergantung pada (a) perilaku `read-excel-file`, (b) heuristik `Date.parse`/`new Date()` JavaScript. Format DD/MM/YYYY **tidak pernah di-parse secara eksplisit**; ia diserahkan penuh ke heuristik V8.

---

## 2. Supported Date Formats

### 2.1 Excel Date Serial Number (contoh: `45866`)

| Aspek | Hasil |
|-------|-------|
| **Diterima?** | **YA** — dua jalur: (a) sel berformat tanggal → `read-excel-file` mengembalikan `Date`; (b) sel angka biasa (General) → `normalizeDateValue` mengubah serial `45866` → `2025-07-28` (UTC). |
| **Bagian parsing** | Layer 2 (`MemberExcelParserService.normalizeDateValue`) untuk angka; layer 1 (`parseExcelTimestamp` read-excel-file) untuk sel berformat tanggal. |
| **Hasil akhir** | `Date` (UTC tengah malam) di renderer → dikonversi menjadi string `YYYY-MM-DD` di `toDateString` → `Date` di backend. |
| **Validasi lolos?** | **Ya** (`isDateLike` terhadap `Date` valid). |
| **Preview berjalan?** | **Ya** — status `VALID` (bila baris lain valid). |
| **Import berhasil?** | **Ya** — tanggal tersimpan benar. |
| **Catatan** | Rumus di `normalizeDateValue` tidak menangani epoch 1904 dan tidak menangani bug *fiktif 29 Feb 1900* Excel; untuk tanggal lahir siswa (pasca-1990) tidak berpengaruh. Serial di luar rentang `1..2958465` dibiarkan sebagai `number` → validasi menolak (`memberImport.invalidDate`). |

### 2.2 Format Indonesia `DD/MM/YYYY` (contoh: `12/05/2005`)

| Aspek | Hasil |
|-------|-------|
| **Diterima?** | **SEBAGIAN — BERBAHAYA.** Tidak ada parsing eksplisit DD/MM/YYYY. Nilai teks diserahkan ke heuristik V8 yang membaca sebagai **MM/DD/YYYY (format AS)**. |
| **Bagian parsing** | Layer 3 (`Date.parse`) untuk validasi; layer 6 (`new Date`) untuk penyimpanan. **Tidak ada layer yang membaca DD/MM/YYYY.** |
| **Hasil akhir** | `string` `"12/05/2005"` diteruskan sampai backend → `new Date("12/05/2005")` = **5 Desember 2005** (bulan-hari **tertukar** dari 12 Mei 2005). |
| **Validasi lolos?** | **Ya, keliru.** `Date.parse("12/05/2005")` valid (ditafsir 5 Des) → tidak ada error. Namun `25/05/2005` (tanggal > 12) → `Date.parse` = NaN → **gagal** validasi `memberImport.invalidDate` meskipun format benar menurut Indonesia. |
| **Preview berjalan?** | **Ya** untuk `12/05/2005` (dianggap valid); error `Tanggal Lahir tidak valid` untuk `25/05/2005`. |
| **Import berhasil?** | **Ya, tetapi data salah diam-diam** untuk `DD ≤ 12` — tersimpan `2005-12-04` (UTC) dan ditampilkan `2005-12-04`. Untuk `DD > 12` import **diblokir** di validasi/preflight. |
| **Penyebab teknis** | `new Date("12/05/2005")` di V8 (Node 22 / Electron) mengikuti konvensi AS MM/DD/YYYY. Terverifikasi empiris di runtime proyek: hasil `Mon Dec 05 2005`; `new Date("25/05/2005")` dan `new Date("27/07/2009")` = `INVALID`. |

### 2.3 Format ISO / Dapodik `YYYY-MM-DD` (contoh: `2009-07-27`)

| Aspek | Hasil |
|-------|-------|
| **Diterima?** | **YA** — untuk teks murni `YYYY-MM-DD`. |
| **Bagian parsing** | Layer 5 `toDateString` (teks diteruskan) + Layer 6 `new Date("2009-07-27")`. String tanggal-saja ISO di-parse sebagai **UTC** (per spesifikasi ECMAScript). |
| **Hasil akhir** | `string` `"2009-07-27"` → `Date` `2009-07-27T00:00:00.000Z` → tersimpan benar. |
| **Validasi lolos?** | **Ya.** |
| **Preview berjalan?** | **Ya** — status `VALID`. |
| **Import berhasil?** | **Ya** — tanggal tersimpan benar (baca ulang `2009-07-27`). |
| **Peringatan** | Jika Dapodik mengekspor tanggal **dengan komponen waktu** sebagai teks (mis. `2009-07-27 00:00:00` atau `2009-07-27T00:00:00`), string tersebut di-parse `new Date(...)` sebagai **waktu lokal (UTC+7)** → tersimpan `2009-07-26T17:00:00.000Z` → **mundur 1 hari** saat ditampilkan (`2009-07-26`). Terverifikasi empiris. |

---

## 3. Compatibility with Dapodik Export

**Pertanyaan PO:** Apakah template Import Anggota saat ini kompatibel dengan hasil ekspor Dapodik *tanpa modifikasi file Excel*?

**Jawaban: BELUM kompatibel end-to-end.** Kompatibilitas terbagi dua lapis:

### 3.1 Lapis tanggal (format `YYYY-MM-DD`)
- Teks murni `YYYY-MM-DD` → **kompatibel** (2.3). Parser membacanya dengan benar.
- Sel tanggal real dari Dapodik (bukan teks) → dibaca sebagai `Date` → juga benar (2.1).
- **Risiko lapis tanggal:** bila ekspor Dapodik menghasilkan teks `YYYY-MM-DD HH:MM:SS` / `...T...`, terjadi pergeseran minus 1 hari (2.3).

### 3.2 Lapis struktur file (header kolom) — **BLOCKER utama**
Template saat ini membutuhkan header yang dicocokkan setelah normalisasi huruf kecil + trim spasi (`src/services/HeaderNormalizerService.ts`). `HEADER_SYNONYMS` hanya berisi sinonim modul Buku (`publisher→penerbit`, dll.), **tidak ada sinonim untuk kolom Anggota/Dapodik**, dan underscore tidak dinormalisasi. `MEMBER_IMPORT_TEMPLATE` mewajibkan (`requiredHeader: true`): `Nama`, `Kelas`, `Jenis Kelamin`, `NISN`, `Alamat`, `No. WhatsApp`.

Header ekspor Dapodik yang lazim digunakan TIDAK sama dengan template:

| Kolom template (wajib) | Header umum ekspor Dapodik | Status |
|-------------------------|----------------------------|--------|
| `Nama` | `Nama` / `NAMA` | Cocok setelah lowercase. |
| `Kelas` | **Tidak ada** (keanggotaan rombel ada di ekspor terpisah: `Nama Rombel`) | **Hilang → parse error** `Kolom wajib tidak ditemukan: Kelas.` |
| `Jenis Kelamin` | `Jenis Kelamin` / `JENIS_KELAMIN` | `JENIS_KELAMIN` (underscore) **tidak cocok**. |
| `NISN` | `NISN` | Cocok. |
| `Alamat` | `Alamat` | Cocok. |
| `No. WhatsApp` | `No. HP` / `Nomor HP` / `Telepon` | **Tidak cocok** → parse error. |
| `Tanggal Lahir` | `Tanggal Lahir` / `TANGGAL_LAHIR`, atau **gabung dengan tempat lahir** (`Tempat Tanggal Lahir` = `Jakarta, 12-05-2005`) | `TANGGAL_LAHIR` underscore tidak cocok; kolom gabung tidak memetakan ke `tanggalLahir`. |

Akibatnya, file ekspor Dapodik **mentah** akan ditolak di `MemberExcelParserService.columnIndexByKey` (Layer 2) sebelum field Tanggal Lahir sempat diproses — `MemberExcelParserError` pada header yang hilang, file tidak lolos ke validasi/preview/import.

**Kesimpulan:** Format tanggal `YYYY-MM-DD` Dapodik **didukung parser**, tetapi template **tidak siap drop-in** terhadap file Dapodik utuh karena struktur header berbeda. Jika pengguna menyalin hanya kolom yang sesuai template (mempertahankan teks `YYYY-MM-DD`), barulah import berjalan.

---

## 4. Potential Risks

| # | Risiko | Tingkat | Dampak |
|---|--------|---------|--------|
| R1 | **DD/MM/YYYY salah bulan/hari.** `DD ≤ 12` (mis. `12/05/2005`) lolos validasi & import namun tersimpan `05-12` → data tanggal lahir **salah diam-diam**. | **Tinggi** | Korupsi data profil anggota; tidak terdeteksi oleh sistem. |
| R2 | **DD/MM/YYYY dengan `DD > 12` ditolak.** `25/05/2005` dianggap tanggal tidak valid → baris gagal validasi/preflight. | Sedang | File Indonesia (format paling umum) tidak dapat diimport. |
| R3 | **Pergeseran 1 hari** untuk teks ISO ber-waktu (`YYYY-MM-DD HH:MM:SS`, `...T...`). | Sedang | Tanggal lahir salah minus 1 hari. |
| R4 | **Inkonsistensi jalur parsial:** serial → `Date` (akurat); teks `YYYY-MM-DD` → UTC (benar); teks `DD/MM/YYYY` → heuristik V8 (salah). Hasil tidak seragam, bergantung tipe sel Excel. | Tinggi | Sulit diuji/divalidasi; hasil tak terduga. |
| R5 | **Dapodik mentah gagal di header** (Kelas, No. HP, underscore, kolom gabung). | Tinggi | Fitur import tidak terpakai untuk kasus Dapodik. |
| R6 | Template (lihat `xl/sharedStrings.xml` item 8) mendokumentasikan `Tanggal Lahir boleh berupa: tanggal Excel / teks tanggal / kosong` — tetapi kenyataannya `teks tanggal` DD/MM/YYYY **tidak aman**. Dokumentasi dan perilaku tidak selaras. | Rendah | Ekspektasi user meleset. |

---

## 5. Recommended Fix (jika diperlukan)

> **BELUM diimplementasikan — hanya rekomendasi.** Perubahan minimal difokuskan pada parsing tanggal, bukan struktur keseluruhan.

1. **Parser tanggal eksplisit & deterministik** (gantikan heuristik `new Date(value)`):
   - Kenali urutan prioritas: `YYYY-MM-DD` / ISO (termasuk varian ber-waktu, potong komponen waktu) → `DD/MM/YYYY` (parse eksplisit dengan regex `^(\d{1,2})/(\d{1,2})/(\d{4})$` → validasi rentang hari/bulan) → serial angka (jalur yang sudah ada).
   - Konversi hasil ke tanggal UTC tengah malam **sebelum** dikirim ke backend, sehingga DTO `birthDate` selalu `YYYY-MM-DD`.
2. **Terapkan di satu titik otoritatif**, idealnya di layer backend `MemberImportService.parseBirthDate` (agar berlaku untuk preview & import sekaligus), dan pertahankan `toDateString` renderer agar meneruskan string tanggal-saja saja. **Jangan parsing DD/MM di renderer** (menghindari duplikasi business logic — prinsip dari sprint import buku).
3. **Backstop validasi**: tolak string ambigu yang tidak sesuai salah satu format resmi; jangan pernah bergantung pada `Date.parse` untuk format non-ISO.
4. **Dapodik (bila jadi target):** perpanjang `HEADER_SYNONYMS` dengan alias kolom Anggota (mis. `no hp`/`nomor hp`/`telepon` → `no. whatsapp`, normalisasi underscore, dan penanganan kolom `Tempat Tanggal Lahir` gabungan). Ini di luar ruang lingkup audit tanggal.

---

## 6. Final Conclusion

| Format | Diterima | Parsing | Validasi | Preview | Import | Benar? |
|--------|:--------:|---------|:--------:|:-------:|:------:|:------:|
| Excel Serial `45866` | ✅ Ya | Layer 1/2 → `Date` | ✅ Lolos | ✅ Jalan | ✅ Berhasil | ✅ Benar |
| Indonesia `DD/MM/YYYY` | ⚠️ Sebagian | Tidak ada (heuristik V8) | ⚠️ Lolos keliru / gagal untuk `DD>12` | ⚠️ | ⚠️ Berhasil tapi **salah tanggal** | ❌ **Salah** |
| ISO/Dapodik `YYYY-MM-DD` | ✅ Ya | `new Date` UTC | ✅ Lolos | ✅ Jalan | ✅ Berhasil | ✅ Benar (kecuali teks ber-waktu → ⚠️ −1 hari) |

- **Tanggal lahir format ISO `YYYY-MM-DD` didukung** dan tersimpan benar — ini satu-satunya format teks yang aman saat ini.
- **Format `DD/MM/YYYY` TIDAK aman**: berpotensi tertukar bulan/hari tanpa peringatan, atau ditolak.
- **Kompatibilitas penuh dengan ekspor Dapodik tanpa modifikasi file: TIDAK** — bukan karena format tanggalnya, melainkan karena **struktur header** (Kelas, No. HP, underscore, kolom gabungan Tempat Tanggal Lahir) belum dipetakan oleh template/normalizer header.
- **Aksi minimal yang disarankan:** implementasi parser tanggal eksplisit (ISO → DD/MM/YYYY → serial) di backend + perbaikan normalisasi header bila Dapodik menjadi target resmi. **Tidak ada perubahan yang dilakukan pada audit ini.**

---
**Status: READ ONLY. Menunggu review Product Owner. Tidak ada Work Order baru dibuat.**
