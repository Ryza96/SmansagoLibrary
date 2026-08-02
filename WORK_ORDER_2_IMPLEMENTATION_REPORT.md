# WORK ORDER 2 — Import Anggota (Siswa): Excel Parser Foundation (COMPLETE — READY review PO)

> Source of Truth: `IMPORT_MEMBER_ARCHITECTURE_SPEC.md` v3.0 (REVISION FINAL, APPROVED).
> WO-2 scope: **Excel parser only** — parse file `.xlsx` yang dipilih user, petakan 9 kolom template
> secara posisional ke objek sementara `ParsedMemberRow`, simpan hasil di state dialog (tidak ditampilkan).
> **TIDAK ada** validasi (kosong/format/duplicate/kelas/gender/tanggal), mapping ke DB, preview,
> transaction, migration, atau pembuatan member.

## Ringkasan
- Service baru `src/services/MemberExcelParserService.ts`: membaca workbook via `WorkbookReaderService`
  (reuse, memakai `read-excel-file/browser` — dep yang sudah ada), ambil sheet pertama, lewati header
  (index 0), petakan 9 kolom posisional `row[0]..row[8] ?? null` ke objek `ParsedMemberRow`.
- `ParsedMemberRow` = 9 field (`nama, kelas, jenisKelamin, nisn, tempatLahir, tanggalLahir, alamat, whatsapp, email`),
  semua bertipe `ImportCellValue` (`string | number | boolean | Date | null`).
- `MemberExcelParserError` = error berbasis pesan (tidak ada klasifikasi kode); wrapper menangkap error
  pembacaan dan melempar pesan tunggal.
- `MemberImportDialog.tsx`: saat file dipilih (`onFileChange={handleFileChange}`), parser langsung
  dijalankan; hasil disimpan di state `parsedRows` (TIDAK ditampilkan); bila gagal tampil pesan error
  sederhana; ada status `parsing` (label "Memproses file Excel..."). State baru di-reset di `handleClose()`.
- **Perbaikan wiring**: JSX dropzone sebelumnya masih `onFileChange={setFile}` (parser tidak pernah jalan);
  kini `onFileChange={handleFileChange}`.
- Label baru di `MEMBER_IMPORT`: `PARSING`, `PARSE_ERROR`.

## File Baru
| # | File | Keterangan |
|---|------|-----------|
| 1 | `src/services/MemberExcelParserService.ts` | `ParsedMemberRow`, `MemberExcelParserError`, `MemberExcelParserService.parse(file)`, singleton `memberExcelParserService` |

## File Dimodifikasi
| # | File | Perubahan |
|---|------|-----------|
| 1 | `src/components/members/MemberImportDialog.tsx` | + state `parsedRows`/`parsing`/`parseError`; `handleFileChange()` menjalankan parser; JSX dropzone `onFileChange={handleFileChange}`; render status parsing + pesan error; reset penuh di `handleClose()` |
| 2 | `src/utils/labels.ts` | `MEMBER_IMPORT` + `PARSING` ("Memproses file Excel...") dan `PARSE_ERROR` ("File gagal dibaca. Pastikan file merupakan .xlsx yang valid.") |

## Kepatuhan RFC FINAL (WO-2)
- [x] **§3.2 step `upload`**: file dipilih → parser langsung jalan; hasil hanya disimpan di state (TIDAK ditampilkan).
- [x] **§3.3 Lifecycle**: `handleClose()` mereset `file`/`parsedRows`/`parsing`/`parseError`/`downloading`/`downloadStatus` (keputusan #24, AC-16).
- [x] **Keputusan #4 kolom**: mapping posisional 9 kolom sesuai urutan template (Nama, Kelas, Jenis Kelamin, NISN, Tempat Lahir, Tanggal Lahir, Alamat, No. WhatsApp, Email).
- [x] **Reuse**: `WorkbookReaderService` apa adanya; `read-excel-file` (dep existing); TIDAK ada dependency baru.
- [x] **Header row**: index 0 dilewati (`slice(1)`); data mulai index 1.
- [x] **Sel kosong → `null`** (bukan `''`).
- [x] **Kegagalan baca → pesan error sederhana** (tanpa klasifikasi kode error).
- [x] **TIDAK termasuk scope WO-2**: validasi, normalisasi header, duplicate check, class resolver, preview, DTO, service DB, IPC/preload/bootstrap, migration, pembuatan member.

## Catatan Teknis
- Parser bergantung pada shape `read-excel-file` v9: `sheets: [{ name, rows }]`, sheet pertama = sheet aktif pertama workbook. Header row adalah `rows[0]` (sesuai template 1 sheet, header row 1).
- `tsconfig.web.json` sudah meng-include `src/services/**/*` → service lolos `tsc -p tsconfig.web.json --noEmit`.
- Template WO-1 tetap menjadi fixture valid: `parse` pada template header-only → 0 baris data.
- **Smoke test (2 skenario) PASS** pada modul terkompilasi asli (`tsc --module commonjs` + `read-excel-file/browser` di Node 22, global `File` tersedia):
  - File `.xlsx` berisi header + 2 baris data (dibuat via `fflate`, OOXML minimal + `styles.xml`/`sharedStrings.xml`) → `count: 2`, seluruh 18 field 9 kolom × 2 baris cocok dengan harapan.
  - Template asli → 0 baris; file non-xlsx (`[1,2,3]`) → melempar `MemberExcelParserError` ("File gagal dibaca.").
- Validation: `npm run lint` PASS, `npm run build` PASS (main 1,760.11 kB · preload 7.26 kB · renderer 909.53 kB).

## Technical Debt
| TD | Deskripsi | Rencana |
|----|-----------|---------|
| TD-1 | `parsedRows` disimpan di state tetapi belum ditampilkan di UI (belum ada step Preview) | WO berikutnya (preview) |
| TD-2 | Error hanya pesan tunggal; belum ada klasifikasi kode/baris gagal | WO berikutnya (validation) |
| TD-3 | `parseError` menampilkan pesan generik; penyebab asli (mis. `ImportReaderError IMP-004`) tidak dipermukaan | Saat validation engine |
| TD-4 | `PARSING` label tampil singkat (parse cepat); mungkin tidak terlihat user | Saat polish UI |
| TD-5 | Parser membaca sheet pertama saja; multi-sheet tidak didukung | Di luar RFC (template 1 sheet) |

## Status
**DONE — Architecture Gate BERHENTI**, menunggu review Product Owner. Tidak lanjut WO berikutnya.
