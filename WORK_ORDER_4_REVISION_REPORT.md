# WORK ORDER 4 REVISION — UX Preview (COMPLETE — READY review PO)

> Source of Truth: `IMPORT_MEMBER_ARCHITECTURE_SPEC.md` v3.0 (REVISION FINAL, APPROVED).
> Rev 1: Logic WO-4 **APPROVED** (preview service, validasi, deteksi duplikat, parser, smoke test **TIDAK diubah**).
> Perubahan terbatas **hanya pada tampilan Preview** di dialog.

## Objective
Menyempurnakan tampilan Preview tanpa menyentuh arsitektur / validation / duplicate detection / parser /
service / database / smoke test:
- Tambah kolom paling kiri **Baris** → menampilkan `rowNumber`.
- Tambah kolom paling kanan **Keterangan**:
  - `VALID` → `-`
  - `DUPLICATE` → `NISN sama dalam file import.`
  - `ERROR` → gabungan pesan validasi yang **sudah ada** (`MESSAGES[messageKey]`), dipisah newline bila lebih dari satu.
- TIDAK ada pagination / sorting / filter / search / export / download / redesign dialog.

## Files Modified
| # | File | Perubahan |
|---|------|-----------|
| 1 | `src/utils/labels.ts` | `MEMBER_IMPORT` + `HEADER_BARIS` ("Baris"), `HEADER_KETERANGAN` ("Keterangan"), `NOTE_VALID` ("-"), `NOTE_DUPLICATE` ("NISN sama dalam file import.") |
| 2 | `src/components/members/MemberImportDialog.tsx` | + helper `errorMessage(error)` (messageKey `memberImport.xxx` → `LABELS.MEMBER_IMPORT.MESSAGES[xxx]`) dan `keterangan(row)` (switch VALID/DUPLICATE/ERROR); tabel preview + kolom **Baris** (kiri, `row.rowNumber`) dan **Keterangan** (kanan, `whitespace-pre-line` untuk newline); `align-top` pada baris tabel |

## Validation
- `npm run lint` PASS
- `npm run build` PASS (main 1,760.11 kB · preload 7.26 kB · renderer 924.38 kB)

## Technical Notes
- **`errorMessage`**: `messageKey` dari validasi ber-prefix `memberImport.` (`memberImport.requiredValue`, dsb.)
  sementara kunci `LABELS.MEMBER_IMPORT.MESSAGES` tanpa prefix (`requiredValue`, `invalidGender`, `invalidDate`).
  Helper memotong prefix lalu index ke `MESSAGES` (dipetakan ke `Record<string,string>` karena objek `as const`),
  fallback string kosong bila kunci tidak dikenal — pesan TIDAK dibuat baru, hanya dipetakan dari yang sudah ada.
- **`keterangan`**: `VALID` → `NOTE_VALID` ("-"); `DUPLICATE` → `NOTE_DUPLICATE`; `ERROR` → `row.errors`
  dipetakan lewat `errorMessage`, disaring kosong, lalu `join('\n')`. Contoh 2 error:
  `Kolom wajib diisi.\nJenis kelamin tidak valid.` dirender 2 baris berkat `whitespace-pre-line`.
- Kolom **Baris** menampilkan `rowNumber` (2, 3, 4, …) dengan `tabular-nums` agar angka sejajar.
- Tidak ada perubahan logika: `buildPreview`, validasi, parser, dan smoke test WO-4 (31 checks) tetap seperti semula.
- TIDAK ada perubahan arsitektur / service / database / IPC / preload / env.d.ts / dependency.

## Status
**DONE — Architecture Gate BERHENTI**, menunggu review Product Owner. Tidak commit, tidak lanjut Work Order berikutnya.
