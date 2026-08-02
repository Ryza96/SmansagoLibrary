# WORK ORDER 4 — TEMPLATE UX REPORT: Template_Import_Anggota_v1.0.xlsx

## 1. Tujuan
Menghadirkan UX template anggota setara dengan `Template_Import_Buku_v2.0.xlsx` **hanya pada file Excel** (`templates/Template_Import_Anggota_v1.0.xlsx`) tanpa menyentuh parser, validasi, deteksi duplikat, database, preview, maupun RFC. File template harus tetap parse-compatible dengan `MemberExcelParserService`.

## 2. Perubahan Template

### Layout sheet utama "Import Anggota"
- **Header (baris 1, A1–I1):** 9 kolom dipertahankan persis — `Nama, Kelas, Jenis Kelamin, NISN, Tempat Lahir, Tanggal Lahir, Alamat, No. WhatsApp, Email` (sumber kebenaran `MEMBER_IMPORT_TEMPLATE` di `src/config/memberImport.template.ts`).
- **Header style:** fill biru `FF4472C4`, teks putih tebal, border tipis — sama dengan Template Buku v2.0.
- **Contoh data (baris 2–3):** 2 baris realistis (`Budi Santoso`, `Siti Nurhaliza`) sebagai panduan format:
  - NISN/No. WhatsApp disimpan sebagai **Text** (mempertahankan leading zero `0123456789`).
  - Tanggal Lahir disimpan sebagai **sel bertipe tanggal** (serial, numFmt 14) → parser membaca `Date`.
- **Freeze pane** `ySplit=1` (baris header selalu terlihat), lebar kolom disesuaikan.

### Sheet kedua "Petunjuk"
- Baris 1: judul **PETUNJUK PENGGUNAAN** (fill `FF2F5496`, putih tebal).
- Baris 2–11: 10 petunjuk persis spesifikasi (fill `FFDDEBF7`, border tipis):
  1. Jangan menghapus header.
  2. Header wajib harus tetap ada.
  3. Urutan kolom boleh berubah.
  4. Kolom tambahan diperbolehkan.
  5. Mulai isi data pada baris kedua.
  6. NISN disarankan bertipe Text.
  7. No. WhatsApp disarankan bertipe Text.
  8. Jenis Kelamin yang diterima: L, Laki-laki, P, Perempuan.
  9. Tanggal Lahir menerima format tanggal (contoh: 2006-08-20).
  10. Simpan sebagai .xlsx.

### Keputusan arsitektur: PETUNJUK di sheet terpisah (disetujui user)
- Petunjuk **tidak** diletakkan di kolom kanan sheet data karena konflik dengan firewall:
  - `MemberExcelParserService.parse` memetakan **setiap** baris setelah header menjadi baris data (tanpa skip baris kosong — berbeda dengan pipeline buku yang punya `allEmpty` check di `ValidationEngineService`).
  - Instruksi di kolom K (baris 4–11) akan terbaca sebagai baris data kosong → 8 baris ERROR di preview → `canImport=false`.
- Solusi: sheet terpisah "Petunjuk". Parser hanya membaca `sheets[0]` → petunjuk tidak pernah di-parse; template tetap valid (2 baris contoh valid, `canImport=true`).
- Petunjuk sama-sama tampil sebagai tab di Excel, tetap memenuhi esensi "instruksi pengisian terlihat" dengan deviasi minor dari "sisi kanan" buku.

## 3. Validasi
- **Template smoke (`verify-member-template.cjs`) 22/22 PASS:**
  - Parse 2 baris contoh (rowNumber 2 & 3), semua field benar; NISN & WhatsApp string dengan leading zero terjaga; tanggalLahir = `2006-08-20` & `2005-05-12` sebagai `Date`.
  - Validasi: `valid=true, errors=0`; Preview: `2 valid, duplicate=0, error=0, canImport=true`.
- **Baca langsung (read-excel-file/browser):** 2 sheet (`Import Anggota|Petunjuk`); sheet data = 3 baris (header + 2 contoh); sheet Petunjuk = 11 baris (judul + 10 instruksi).
- **`npm run lint` PASS.**
- **`npm run build` PASS** (main 1,760.11 kB · preload 7.26 kB · renderer 925.16 kB — asset hashes tidak berubah dari Rev2, konsisten).
- Mekanisme file: sharedStrings (SST), numFmt `#.##0`, fill header/note, FreezePane — sama dengan Template Buku v2.0.

## 4. Technical Notes
- Template dibangun dari nol dengan `fflate` (zip) via skrip sementara `build-member-template.cjs` (tidak masuk repo).
- Kolom header wajib tetap di **baris 1** (parser header-mode membaca row 1); contoh data di baris 2+ — parser menganggapnya data (smoke: 2 baris), bukan masalah: template hanya jadi titik mulai, user menimpa contoh.
- Ukuran file: 4.821 bytes (sebelumnya 4.361 bytes versi salah / header-only lama ~1.4 kB).

## 5. Status
**DONE — Architecture Gate BERHENTI.** Menunggu review Product Owner. Tidak ada commit; tidak lanjut WO berikutnya.
