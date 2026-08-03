# WORK ORDER 10 — Template Date Format Revision

## Objective
Revisi **hanya** pada template Import Anggota (`templates/Template_Import_Anggota_v1.0.xlsx`)
agar contoh data dan petunjuk kolom Tanggal Lahir menggunakan format `YYYY-MM-DD`.
Tidak ada perubahan pada parser, validation, backend, IPC, preload, DTO, atau UI.
Referensi: `DATE_FORMAT_COMPATIBILITY_AUDIT.md` (APPROVED oleh Product Owner).

## Files Modified
| File | Perubahan |
|------|-----------|
| `templates/Template_Import_Anggota_v1.0.xlsx` | Satu-satunya deliverable yang diubah. Secara internal memodifikasi `xl/sharedStrings.xml`, `xl/worksheets/sheet1.xml`, `xl/worksheets/sheet2.xml` |

**Tidak diubah:** seluruh source code (TS/JS), parser `parseBirthDate`, validation,
backend service, IPC (`members:downloadTemplate`), preload, `env.d.ts`, DTO, renderer UI,
`styles.xml`, struktur nama file.

## Changes Summary
1. **`xl/sharedStrings.xml`** (count 61 → 63):
   - Petunjuk `Tanggal Lahir boleh berupa:` → `Tanggal Lahir diisi dengan format YYYY-MM-DD.`
   - `tanggal Excel` → `Contoh: 2009-07-27`
   - `teks tanggal` → `Boleh dikosongkan.`
   - `kosong` → string kosong (referensi row petunjuk yang dihapus)
   - Tambah 2 entry baru: `2009-07-27` (idx 61) dan `2010-03-15` (idx 62)
2. **`xl/worksheets/sheet1.xml`:**
   - Sel `F2`: serial Excel `38949` (format tanggal, style `s="3"`) → shared string `2009-07-27`
   - Sel `F3`: serial Excel `38484` → shared string `2010-03-15`
   - `s="3"` (number format tanggal) dihapus dari seluruh sel kosong kolom F →
     tidak ada satu pun sel di kolom F yang memaksa format tanggal
3. **`xl/worksheets/sheet2.xml`:** row bullet kosong yang tersisa dari string `kosong`
   (row 32) dihapus agar petunjuk bersih tanpa bullet berakhir.

## Validation
1. **Parse check** (`read-excel-file/node`, 8/8 PASS):
   - Header utuh: `Nama, Kelas, Jenis Kelamin, NISN, Tempat Lahir, Tanggal Lahir, Alamat, No. WhatsApp, Email`
   - `F2` = `"2009-07-27"` (string), `F3` = `"2010-03-15"` (string)
   - Serial `38949`/`38484` tidak tersisa
   - Petunjuk memuat `YYYY-MM-DD` dan contoh `2009-07-27`
   - Teks lama `tanggal Excel`/`teks tanggal` hilang; tidak ada bullet kosong
2. **Struktur sheet1:** 0 kemunculan `s="3"`; 0 sel numerik tanggal di kolom F
3. **Simulasi unduhan:** `fs.copyFile` dari `templates/Template_Import_Anggota_v1.0.xlsx`
   ke file tujuan berhasil dan file hasil terbaca valid sebagai xlsx.
   Nama file tidak berubah → `resolveTemplatePath()` dan handler `members:downloadTemplate`
   (`electron/ipc/member.ipc.ts`) tetap me-resolve dan menyalin dengan benar.
4. **Regression:** `npm run lint` PASS · `npm run build` PASS
   (main 1,774.56 kB · preload 7.68 kB · renderer 939.58 kB)

## Compatibility
- Nilai contoh kini berupa teks `YYYY-MM-DD` yang konsisten dengan format terdokumentasi;
  parser `parseBirthDate` (`src/main/services/member-import.service.ts:234`) menerimanya
  tanpa perubahan kode (`new Date("2009-07-27")` valid di Node/V8).
- Serial Excel lama dirender sebagai tanggal mengikuti locale (bisa menjadi `DD/MM/YYYY`
  dan salah/tidak valid); sel teks baru menghilangkan risiko koersi tanggal Excel.
- Backward compatible: pengguna yang selama ini mengisi tanggal sebagai teks tetap berfungsi;
  hanya contoh & petunjuk yang berubah.

## Status
**DONE — READY untuk review Product Owner.** Tidak ada commit (menunggu instruksi).
