# WORK ORDER 3 — Import Anggota (Siswa): Header Mapping & Validation Foundation (COMPLETE — READY review PO)

> Source of Truth: `IMPORT_MEMBER_ARCHITECTURE_SPEC.md` v3.0 (REVISION FINAL, APPROVED).
> WO-3 scope: parser **berbasis nama header** (menggantikan mapping posisional WO-2) + **validasi dasar**
> (required fields, normalisasi jenis kelamin, format tanggal). Hasil validasi hanya disimpan di state
> internal dialog (**belum ada Preview UI**). **TIDAK ada** mapping ke DB, duplicate check, class lookup,
> transaction, migration, IPC/preload/bootstrap, atau pembuatan member.

## Ringkasan
- **Mapping header (REWRITE)** — `src/services/MemberExcelParserService.ts`: kolom kini dipetakan berdasarkan
  **nama header**, bukan posisi. Menggunakan existing `headerNormalizerService.normalizeHeader`
  (trim + lowercase + collapse whitespace); pemetaan header → index via `indexOf` pada array header
  yang dinormalisasi (match pertama yang menang; tanpa fuzzy matching). Kolom boleh urutan acak,
  case/whitespace berbeda, dan boleh ada kolom ekstra (diabaikan).
- **Normalisasi Tanggal Lahir (BARU)** — sel tanggal yang dikembalikan library sebagai **serial Excel number**
  (sel numerik tanpa date-style) dinormalisasi menjadi `Date` di parser (`normalizeDateValue`, offset epoch
  25569 hari → ms). Serials di rentang Excel (1..2958465) dikonversi; angka di luar rentang dibiarkan apa adanya
  (validasi menolaknya). Sel ber-date-style (numFmtId 14) → library sudah mengembalikan `Date`, diteruskan.
  Hasil akhir untuk `tanggalLahir` selalu salah satu dari: `Date`, string tanggal, atau `null` (kosong).
- **Template config (BARU)** — `src/config/memberImport.template.ts`: single source kebenaran untuk
  pasangan nama header ⇒ key: 6 header **wajib** (Nama, Kelas, Jenis Kelamin, NISN, Alamat, No. WhatsApp)
  dan 3 **opsional** (Tempat Lahir, Tanggal Lahir, Email).
- **Error header** — header wajib hilang → `MemberExcelParserError('Kolom wajib tidak ditemukan: <daftar>.')`;
  sheet tanpa baris → `'File tidak memiliki baris header.'`; kegagalan baca tetap `'File gagal dibaca.'`.
- **`rowNumber`** — tiap `ParsedMemberRow` kini membawa nomor baris Excel 1-based
  (`header index + data index + 2`) untuk jejak error per-baris di masa depan.
- **Validasi (BARU)** — `src/services/MemberImportValidationService.ts`: `validate(rows)` → `MemberValidationResult`
  dengan `rows`, `valid`, `validCount`, `errorCount`, `total`. Rule: `nama/kelas/jenisKelamin/nisn/alamat/whatsapp`
  wajib diisi; jenis kelamin dinormalisasi (`L/Laki-laki/LAKI-LAKI/laki laki` → `male`; `P/Perempuan/PEREMPUAN`
  → `female`; lain → `invalidGender`); `tanggalLahir` opsional tetapi bila terisi harus `Date` valid,
  string parseable (`Date.parse`), atau kosong; `email` tanpa rule. NISN & WhatsApp tetap **teks**
  (parser menyimpan string apa adanya → leading zero aman). Error key `memberImport.requiredValue`
  / `invalidGender` / `invalidDate` → label UI di `MEMBER_IMPORT.MESSAGES`.
- **Dialog (diverifikasi bersih)** — `src/components/members/MemberImportDialog.tsx`: `handleFileChange` dan
  `handleDownloadTemplate` masing-masing memakai **satu** blok `try/catch/finally` (TIDAK ada `try/catch/catch`);
  `const rows = await memberExcelParserService.parse(next)` dideklarasikan **di dalam** blok `try` dan hanya
  digunakan di scope yang sama (lines 29–31) — tidak ada penggunaan variabel di luar scope. State `validationResult`;
  error menampilkan `error.message` (fallback ke `PARSE_ERROR`); `handleClose` mereset `validationResult`
  bersama state lain (AC-16 keputusan #24).

## File Baru
| # | File | Keterangan |
|---|------|-----------|
| 1 | `src/config/memberImport.template.ts` | `MemberImportColumnKey`, `MemberImportColumn {key,label,requiredHeader}`, `MEMBER_IMPORT_TEMPLATE` (6 wajib + 3 opsional) |
| 2 | `src/services/MemberImportValidationService.ts` | `MemberGender`, `MemberValidationError`, `MemberRowValidation`, `MemberValidationResult`, `validate()`, singleton `memberImportValidationService` |

## File Dimodifikasi
| # | File | Perubahan |
|---|------|-----------|
| 1 | `src/services/MemberExcelParserService.ts` | REWRITE: `columnIndexByKey()` via `headerNormalizerService` + `indexOf`; `get(key)` per kolom; `rowNumber`; `normalizeDateValue()` serial Excel → `Date`; throw header wajib hilang & file kosong |
| 2 | `src/components/members/MemberImportDialog.tsx` | + state `validationResult`; `handleFileChange` → parse + `validate`; `setParseError(error.message)`; reset `validationResult` di `handleClose()` |
| 3 | `src/utils/labels.ts` | `MEMBER_IMPORT.MESSAGES` + `requiredValue` ("Kolom wajib diisi."), `invalidGender` ("Nilai jenis kelamin tidak valid."), `invalidDate` ("Format tanggal lahir tidak valid.") |

## Kepatuhan RFC FINAL (WO-3)
- [x] **Mapping header** (keputusan desain PO, menggantikan §3.2 posisional WO-2): case-insensitive + trim; kolom reorderable; kolom ekstra diizinkan.
- [x] **6 header wajib** ditemukan, jika tidak → error jelas mencantumkan nama kolom.
- [x] **Validasi dasar**: required fields; normalisasi gender; tanggal lahir opsional dengan pemeriksaan format.
- [x] **Tanggal Lahir menerima Excel Date, String, atau kosong** (target RFC): serial Excel number (sel tanpa date-style) dinormalisasi menjadi `Date` di parser; sel ber-date-style diterima sebagai `Date`; string parseable diteruskan; kosong → `null`. File Excel normal (Microsoft Excel) ditangani apa pun bentuk nilai yang dikembalikan library.
- [x] **NISN & No. WhatsApp sebagai TEKS** — leading zeros dipertahankan (parser tidak mengubah value selain `?? null`).
- [x] **Hasil validasi internal only** — disimpan di state dialog; belum dirender (belum ada step Preview).
- [x] **Reuse**: `HeaderNormalizerService`, `WorkbookReaderService`, `read-excel-file` (existing); TIDAK ada dependency baru; TIDAK ada perubahan IPC/preload/bootstrap.
- [x] **AC-16 lifecycle**: `handleClose()` mereset `validationResult` bersama state lain.
- [x] **TIDAK termasuk scope WO-3**: duplicate check, class resolver, import/DB service, preview, transaction, migration, pembuatan member.

## Catatan Teknis
- Normalisasi header memakai service existing (`trim` → `toLowerCase` → collapse whitespace); label template
  dinormalisasi dengan transformasi sama → pencocokan identik untuk case/spasi ekstra. Sinonim buku
  (mis. `publisher`→`penerbit`) di `HeaderNormalizerService` tidak berpengaruh untuk header anggota.
- Duplikat header memetakan ke `indexOf` pertama (kolom kedua diabaikan) — tidak ada peringatan.
- Kolom opsional yang tidak ada di file → `columnIndexByKey[key]` `undefined` → `get()` mengembalikan `null` (seluruh baris).
- `isDateLike` (validation): `Date` non-NaN valid; string kosong valid (optional); string yang lolos `Date.parse` valid; `number`/`boolean` → invalid.
  Serial number sudah dinormalisasi menjadi `Date` di parser, sehingga validasi hanya menerima `Date`/string/kosong.
- **Normalisasi serial → Date**: offset Excel epoch 25569 hari (1899-12-30 → 1970-01-01); `new Date(Math.round((serial - 25569) * 86400000))`.
  Batas rentang 1..2958465 sesuai rentang tanggal Excel; angka di luar rentang tidak dikonversi (validasi menolaknya sebagai `invalidDate`).
- Parser tetap bergantung pada shape `read-excel-file` v9 (`sheets[0].rows`); `ParsedMemberRow` kini +1 field `rowNumber`.
- **Smoke test (52 checks, 0 FAIL) PASS** pada modul terkompilasi asli (`tsc --module commonjs` + `read-excel-file/browser` di Node 22):
  - **Parser header** (11): urutan acak + kolom ekstra + varian case/spasi; NISN & No. WhatsApp leading zeros terjaga; `rowNumber` benar.
  - **Parser standar** (3): urutan template; `rowNumber`; leading zeros.
  - **Header opsional/wajib** (2): Email/Tempat Lahir/Tanggal Lahir boleh hilang; header wajib hilang → throw `MemberExcelParserError`.
  - **Gender** (11): 9 varian (`L`, `Laki-laki`, `LAKI-LAKI`, `laki laki`, `laki-laki`, `P`, `Perempuan`, `PEREMPUAN`, `perempuan`) → `male`/`female`; semua valid.
  - **Required/invalid** (11): nama/kelas/nisn/alamat/whatsapp kosong → `requiredValue`; `MALE` → `invalidGender`; `not-a-date` → `invalidDate`; baris lengkap valid; gender tetap dinormalisasi walau baris invalid.
  - **Tanggal Lahir (RFC)** (14): (A) sel numerik tanpa date-style → library mengembalikan **serial number** (dibuktikan via read langsung `raw[0].data[2][6]` = `38219`) → parser normalisasi menjadi `Date` == `2004-08-20`; valid; (B) sel ber-date-style → parser menghasilkan `Date` (apa pun output library: `Date` langsung atau serial → dinormalisasi); (C) string tanggal `'2004-08-20'` → diteruskan, valid; (D) `'not-a-date'` → `invalidDate`; (E) serial di luar rentang Excel (`99999999`) → dibiarkan `number` → `invalidDate`. Kosong → `null` (valid).
  - Hasil akhir konsisten: `tanggalLahir` = `Date` | string | `null`.
- Validation: `npm run lint` PASS, `npm run build` PASS (main 1,760.11 kB · preload 7.26 kB · renderer 914.74 kB).

## Technical Debt
| TD | Deskripsi | Rencana |
|----|-----------|---------|
| TD-1 | `validationResult` disimpan tetapi belum dirender (belum ada step Preview/UI error per-baris) | WO berikutnya (preview) |
| TD-2 | Validasi belum menyentuh: cek duplicate NISN/WhatsApp antar baris, resolver kelas ke DB, validasi keanggotaan (ada/tidak) | WO berikutnya (database layer) |
| TD-3 | NISN & WhatsApp bertipe `ImportCellValue` (bisa `number` bila sel Excel numerik); belum ada normalisasi/format cek | Saat database layer |
| TD-4 | Duplikat header tak terdeteksi (ambil kolom pertama); kolom opsional ganda diam-diam diabaikan | Polish |
| TD-5 | Error header wajib tidak menyebut nomor kolom; hanya nama header | Polish |
| TD-6 | ~~Serial Excel polos terbaca sebagai `number`~~ **DONE di WO-3**: dinormalisasi jadi `Date` di parser. Sisa: konversi berbasis UTC (interpretasi tanggal lokal terjadi saat render); serial < 1900-03-01 bergeser 1 hari akibat bug leap 1900 Excel (tak relevan untuk tanggal lahir siswa) | Dokumentasi |

## Status
**DONE — Architecture Gate BERHENTI**, menunggu review Product Owner. Tidak lanjut WO berikutnya.
