# WORK ORDER 4 — TEMPLATE GUIDE REPORT: Sheet PETUNJUK

## 1. Objective
Lengkapi sheet **PETUNJUK** pada `Template_Import_Anggota_v1.0.xlsx` agar operator sekolah dapat mengisi Template Import Anggota tanpa bertanya lagi. Semua lapisan aplikasi (parser, validation, preview, duplicate detection, database, logic import, workbook structure) **tidak diubah** — murni pengisian konten sheet PETUNJUK pada file Excel.

## 2. Isi Petunjuk
Sheet `PETUNJUK` (baris 1–35, kolom A–B):

- **A1 (style header gelap `FF2F5496`, merge A1:B1):** PETUNJUK PENGGUNAAN
- **A2 (style `FFDDEBF7`, merge A2:B2):** IMPORT ANGGOTA SISWA
- **Baris 3–35 (style `FFDDEBF7` + border tipis, kolom A = nomor/bullet, kolom B = teks):**
  1. Jangan menghapus atau mengubah nama header.
  2. Kolom wajib: • Nama • Kelas • Jenis Kelamin • NISN • Alamat • No. WhatsApp
  3. Kolom opsional: • Tempat Lahir • Tanggal Lahir • Email
  4. Urutan kolom boleh berubah.
  5. Kolom tambahan diperbolehkan.
  6. Kolom Kelas menerima nama kelas sesuai yang digunakan di sekolah. Contoh: • X Merdeka 1 • XI IPA 2 • XII TKJ 1 • XI AKL 2 • XI DKV • Tidak dibatasi format tertentu.
  7. Jenis Kelamin yang diterima: • L • Laki-laki • P • Perempuan
  8. Tanggal Lahir boleh berupa: • tanggal Excel • teks tanggal • kosong
  9. NISN disarankan bertipe Text agar angka nol di depan tidak hilang.
  10. No. WhatsApp disarankan bertipe Text agar angka nol di depan tidak hilang.
  11. Simpan file dalam format .xlsx.

Formatting memakai style yang sama dengan Template Import Buku (header `FF2F5496` + body `FFDDEBF7` + border thin, font Calibri 11), layout dua kolom (nomor lebar 8, teks lebar 100) untuk keterbacaan.

## 3. Files Modified
- **`templates/Template_Import_Anggota_v1.0.xlsx`** (11.279 bytes) — hanya 2 part di dalam xlsx yang berubah:
  - `xl/worksheets/sheet2.xml` — konten sheet PETUNJUK (35 baris + mergeCells A1:B1, A2:B2; kolom A–B).
  - `xl/sharedStrings.xml` — SST diperbarui (61 unique string): 25 string data sheet dipertahankan identik pada indeks 0–24, string petunjuk ditambahkan dari indeks 25.
- **TIDAK diubah (diverifikasi byte-identical):**
  - `xl/worksheets/sheet1.xml` — data sheet identik dengan versi yang sudah APPROVED (MD5 sama).
  - `xl/styles.xml`, `xl/theme/theme1.xml`, `xl/printerSettings/printerSettings1.bin` — identik dengan base Template Import Buku.
  - `xl/workbook.xml` (2 sheet: Import Anggota rId1, PETUNJUK rId5), `[Content_Types].xml`, rels, `docProps/*`.
- **TIDAK ada perubahan kode aplikasi** — parser, validation, preview, duplicate detection, database, logic import, IPC, preload, env.d.ts semuanya utuh.

## 4. Validation
- **Template smoke (`verify-member-template.cjs`) 22/22 PASS:** parser membaca 2 contoh data valid (Budi Santoso, Siti Nurhaliza; NISN/WhatsApp string dengan leading zero; tanggalLahir sebagai Date 2006-08-20 & 2005-05-12); validasi `valid=true, errors=0`; preview `canImport=true, duplicate=0, error=0`.
- **Baca langsung (read-excel-file/browser):** 2 sheet `Import Anggota|PETUNJUK`; data sheet = 3 baris (header + 2 contoh); PETUNJUK = 35 baris berisi judul + 11 petunjuk lengkap dengan sub-bullet.
- **Preservasi:** MD5 `sheet1.xml` (data) identik dengan versi APPROVED; `styles.xml`, `theme1.xml`, `printerSettings1.bin` identik dengan base buku; freeze pane (`ySplit=1`, `topLeftCell=A2`) dan pageSetup tetap ada.
- **`npm run lint` PASS.**
- **`npm run build` PASS** (main 1,760.11 kB · preload 7.26 kB · renderer 925.16 kB — konsisten, tidak ada perubahan source).

## 5. Technical Notes
- Transformasi dilakukan dengan unzip → ganti `sheet2.xml` + `sharedStrings.xml` → rezip (`fflate`); basis file tetap Template_Import_Buku_v2.0 (melalui Template_Import_Anggota versi APPROVED yang sudah diturunkan dari buku).
- SST dibangun dengan pool dedupe: 25 string data dipertahankan pada indeks 0–24 sehingga referensi sel di `sheet1.xml` tidak berubah; string petunjuk baru (termasuk teks "L"/"P" yang dedupe ke indeks data 11/19) di-append setelahnya.
- `read-excel-file` hanya membaca `sheets[0]` (data); sheet PETUNJUK tidak pernah di-parse, sehingga 35 baris instruksi tidak memengaruhi hasil preview/validasi.
- Script transform sementara `fill-petunjuk.cjs` di temp (tidak masuk repo).

## 6. Status
**DONE — Architecture Gate BERHENTI.** Menunggu review Product Owner. Tidak ada commit; tidak lanjut Work Order berikutnya.
