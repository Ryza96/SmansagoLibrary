# WORK ORDER 4 — Preview & Duplicate Detection (In-Memory) (COMPLETE — READY review PO)

> Source of Truth: `IMPORT_MEMBER_ARCHITECTURE_SPEC.md` v3.0 (REVISION FINAL, APPROVED).
> WO-4 scope: **Preview UI setelah parse + validasi** (summary Total/Valid/Error/Duplicate + tabel Nama/Kelas/NISN/Status),
> **deteksi duplikat in-file berdasarkan NISN** (baris ber-NISN sama → keduanya `DUPLICATE`),
> preview **maks 50 baris** dengan catatan `"... dan xxx data lainnya."`, tombol **Import** nonaktif bila ada
> `ERROR`/`DUPLICATE`, dan klik Import hanya menampilkan placeholder
> *"Fitur import database akan diimplementasikan pada Work Order berikutnya."*
> **TIDAK ada** query DB, cek duplikat ke database, transaction, pembuatan member, atau migration.

## Ringkasan
- **Service preview (BARU)** — `src/services/MemberPreviewService.ts`: `buildPreview(rows)` menerima
  `ParsedMemberRow[]` dan mengembalikan `MemberPreviewResult {rows, summary, canImport}`.
  - Validasi dijalankan **sekali** (reuse `memberImportValidationService.validate`), tanpa parser ulang
    dan tanpa query DB.
  - Deteksi duplikat **hanya di dalam file Excel** berdasarkan NISN: nilai NISN dinormalisasi
    (`trim(String(value))`; `null`/blank → tidak dihitung). Map jumlah NISN → bila sebuah NISN muncul
    **lebih dari satu kali**, **seluruh** baris dengan NISN tersebut menjadi `DUPLICATE`.
  - Precedence status: `ERROR` **menang atas** `DUPLICATE` (baris yang error + NISN ganda tetap `ERROR`);
    baris valid dengan NISN unik → `VALID`.
  - `summary = {total, valid, error, duplicate}`; `canImport = total > 0 && valid === total`
    (nol `ERROR`, nol `DUPLICATE`).
  - `PREVIEW_MAX_ROWS = 50` diekspor untuk UI memotong tabel; service tetap mengembalikan seluruh baris.
- **Label UI (BARU)** — `src/utils/labels.ts` `MEMBER_IMPORT`: `PREVIEW_TITLE`, `SUMMARY_TOTAL/VALID/ERROR/DUPLICATE`,
  `HEADER_NAMA/KELAS/NISN/STATUS`, `STATUS_VALID/ERROR/DUPLICATE`, `PREVIEW_MORE_ROWS(count)`,
  `IMPORT_BUTTON` ("Import"), `IMPORT_PLACEHOLDER` ("Fitur import database akan diimplementasikan pada
  Work Order berikutnya.").
- **Dialog (WIRING)** — `src/components/members/MemberImportDialog.tsx`:
  - state `previewResult` (di-set setelah parse+validate di `handleFileChange`) dan `importNotice`.
  - Render **summary 4 kartu** (Total/Valid/Error/Duplicate) + **tabel preview** (Nama, Kelas, NISN, Status)
    dengan badge berwarna (`VALID` emerald, `ERROR` red, `DUPLICATE` amber); helper `displayValue`
    menampilkan `Date` sebagai `YYYY-MM-DD` dan `null` sebagai `—`.
  - Tabel dipotong `slice(0, PREVIEW_MAX_ROWS)`; jika `total > 50` tampil `LABELS.MEMBER_IMPORT.PREVIEW_MORE_ROWS(total - 50)`.
  - Tombol **Import** `disabled={!previewResult.canImport}`; `handleImport()` hanya menampilkan
    `IMPORT_PLACEHOLDER` (TIDAK ada penyimpanan DB).
  - `handleClose` mereset `previewResult` dan `importNotice` (konsisten dengan lifecycle AC-16).
  - Import `Upload` icon lucide (baru).

## File Baru
| # | File | Keterangan |
|---|------|-----------|
| 1 | `src/services/MemberPreviewService.ts` | `MemberPreviewStatus`, `MemberPreviewRow {rowNumber,nama,kelas,nisn,status,errors}`, `MemberPreviewSummary`, `MemberPreviewResult`, `buildPreview()`, `PREVIEW_MAX_ROWS`, singleton `memberPreviewService` |

## File Dimodifikasi
| # | File | Perubahan |
|---|------|-----------|
| 1 | `src/components/members/MemberImportDialog.tsx` | + state `previewResult`/`importNotice`; `handleFileChange` memanggil `memberPreviewService.buildPreview(rows)`; render summary + tabel + catatan >50 baris + tombol Import (disabled) + placeholder; `handleImport()`; `handleClose` reset preview |
| 2 | `src/utils/labels.ts` | `MEMBER_IMPORT` + 14 key label preview + `IMPORT_BUTTON` + `IMPORT_PLACEHOLDER` |

## Kepatuhan RFC FINAL (WO-4)
- [x] **Preview setelah parse + validasi** — dibangun dari hasil validasi yang sama, bukan pas dari parser.
- [x] **Summary mini**: Total, Valid, Error, Duplicate.
- [x] **Preview table**: kolom Nama, Kelas, NISN, Status.
- [x] **Status values**: `VALID`, `ERROR`, `DUPLICATE`.
- [x] **Deteksi duplikat hanya dalam file** (berdasarkan NISN); NISN sama → **kedua** baris `DUPLICATE`.
- [x] **Preview maks 50 baris**; lebih → `"... dan {total-50} data lainnya."`
- [x] **Import disabled** bila masih ada `ERROR` atau `DUPLICATE` (`canImport`).
- [x] **Semua `VALID` → Import aktif**, tapi klik hanya menampilkan placeholder *"Fitur import database akan
  diimplementasikan pada Work Order berikutnya."* — TIDAK menyimpan ke DB.
- [x] **TIDAK diizinkan** (dipatuhi): query database, duplicate database, transaction, create member, migration.
- [x] **Reuse**: `memberImportValidationService`, `ParsedMemberRow`, `ImportCellValue`; TIDAK ada dependency baru;
  TIDAK ada perubahan IPC/preload/bootstrap/env.d.ts.

## Catatan Teknis
- `MemberPreviewService` adalah layanan **murni in-memory** dan dapat diuji tanpa Electron/Prisma (dibuktikan
  smoke test di bawah dengan konstruksi `ParsedMemberRow` langsung + satu kasus end-to-end lewat parser Excel).
- NISN dinormalisasi hanya untuk **key duplikat** (`trim(String(value))`); nilai asli tetap disimpan di
  `MemberPreviewRow.nisn` tanpa perubahan. NISN `null`/blank TIDAK pernah ikut hitungan duplikat
  (baris tersebut sudah `ERROR` oleh rule `requiredValue`).
- Cross-type terdukung: NISN `12345` (number) dan `'12345'` (string) dianggap NISN sama → keduanya `DUPLICATE`.
- `canImport` dinyatakan ulang dari summary (`total > 0 && valid === total`) sehingga kebenarannya selalu
  selaras dengan summary yang ditampilkan ke pengguna.
- Tabel memakai `displayValue()`: `Date` → `YYYY-MM-DD`; `null`/`undefined` → `—`; lainnya → `String(value)`.
- **Smoke test (31 checks, 0 FAIL) PASS** pada modul terkompilasi asli (`tsc --module commonjs` + Node 22):
  - S1 all-valid: summary 3/3, `canImport=true`, semua `VALID`.
  - S2 NISN string sama (posisi berjauhan) → keduanya `DUPLICATE`, `valid=2 dup=2`, `canImport=false`.
  - S3 NISN dengan spasi tepi `'  1001  '` vs `'1001'` → keduanya `DUPLICATE` (normalisasi trim).
  - S4 cross-type `12345` vs `'12345'` → keduanya `DUPLICATE`.
  - S5 precedence: baris error + NISN ganda → `ERROR` (dengan array errors), baris pasangannya → `DUPLICATE`,
    summary `error=1 dup=1`, `canImport=false`.
  - S6 NISN blank (`''` / `null`) → `ERROR` (required), BUKAN duplikat; `duplicate=0`.
  - S7 input kosong → summary nol semua, `canImport=false`.
  - S8 `PREVIEW_MAX_ROWS === 50`.
  - S9 55 baris valid unik → `total=55 valid=55 canImport=true`; slice preview = 50; 5 baris di luar kapasitas
    (catatan overage menampilkan 5).
  - S10 **end-to-end via parser**: file `.xlsx` nyata dengan NISN ganda `'1112223334'` di baris 2 & 3 →
    `DUPLICATE,DUPLICATE,VALID`; `valid=1 dup=2`; `rowNumber` 2/3/4 terpelihara; `canImport=false`.
- Validation: `npm run lint` PASS, `npm run build` PASS (main 1,760.11 kB · preload 7.26 kB · renderer 923.17 kB).

## Technical Debt
| TD | Deskripsi | Rencana |
|----|-----------|---------|
| TD-1 | Import belum menyimpan apa pun (klik Import → placeholder). Keseluruhan database layer (create member, cek keanggotaan, cek duplikat DB, transaction) masih WO berikutnya | WO berikutnya (database layer) |
| TD-2 | Duplikat dihitung hanya dari NISN; WhatsApp tidak ikut baseline duplikat | Validasi saat database layer |
| TD-3 | NISN `12345` vs `'12345'` dianggap sama (normalisasi `String+trim`); nilai disimpan apa adanya tanpa format/panjang cek | Saat database layer |
| TD-4 | Preview menampilkan maks 50 baris; tidak ada pagination — hanya catatan jumlah sisa | Polish (bila PO minta) |
| TD-5 | Tidak ada pesan error per-baris di tabel (hanya status badge); `errors` sudah tersedia di `MemberPreviewRow` | Polish (bila PO minta) |
| TD-6 | Label `STATUS_VALID/ERROR/DUPLICATE` (teks) tampil di badge; belum memakai ikon | Polish |

## Status
**DONE — Architecture Gate BERHENTI**, menunggu review Product Owner. Tidak lanjut WO berikutnya.
