# WORK ORDER 6 — P5A REPORT — UI Preview Integration

## Objective
Menghubungkan `MemberImportDialog` ke `window.electronAPI.memberImport.previewCheck()` (P4D, APPROVED). Setelah file selesai diparse, dialog memanggil `previewCheck()` via IPC dan menyajikan preview **dari hasil `MemberImportPreviewDTO`** — duplicate vs DB dan class-not-found berasal dari backend, **tidak dihitung ulang di renderer**. Keputusan PO (clarification): **Gabungkan** — validasi renderer yang sudah ada (`MemberImportValidationService`, field wajib/gender/tanggal → status ERROR) dipertahankan, sedangkan duplicate/class memakai hasil backend. Tombol Import hanya aktif bila `canImport == true`; system error saat preview menampilkan dialog error. **Tombol Import TIDAK dihubungkan** (tetap placeholder), tanpa progress, tanpa commit.

## Files Modified

| File | Perubahan |
|------|-----------|
| `src/components/members/MemberImportDialog.tsx` | Setelah parse sukses: `await window.electronAPI.memberImport.previewCheck(toMemberImportRows(rows))` → `memberPreviewService.buildPreview(rows, dto)`. System error (reject) → state `previewError` → panel error merah (dialog error). State baru `previewChecking` + indikator. Mapper `ParsedMemberRow → MemberImportRowInput` (`toMemberImportRows`/`toGender`/`toDateString`/`toString`). `keterangan()` memakai `row.errors` (validasi renderer) + `row.issues` (backend: duplicate/class + info anggota eksisting). Tombol Import `disabled={!previewResult.canImport || previewError !== ''}`. Hapus `duplicateWith()` (in-file NISN counting dihapus). Hapus state `validationResult` yang tidak terpakai. |
| `src/services/MemberPreviewService.ts` | `buildPreview(rows, preview: MemberImportPreviewDTO)` — merge: status ERROR dari validasi renderer; status DUPLICATE bila isu backend `duplicateNisnInDb`/`duplicateEmailInDb`; ERROR bila isu backend lain (`classNotFound`/`classAmbiguous`); selain itu VALID. `summary` dihitung dari status. `canImport = total > 0 && valid === total`. **In-file NISN duplicate counting DIHAPUS** (sesuai keputusan PO — duplicate tidak dihitung ulang di renderer). |
| `src/utils/labels.ts` | `MESSAGES` + `duplicateNisnInDb`, `duplicateEmailInDb`, `classNotFound`, `classAmbiguous`; label `PREVIEW_CHECKING`, `PREVIEW_SYSTEM_ERROR`. |

**TIDAK diubah:** backend (`MemberImportService`), IPC (`member.ipc.ts`), preload, `MemberImportValidationService` (file utuh; hanya tipe `MemberValidationError` di-import), parser (`MemberExcelParserService`), env.d.ts.

## UI Flow
```
Pilih file → parse (parser, tidak berubah)
   → validasi renderer: memberImportValidationService.validate(rows)  [ERROR: field wajib/gender/tanggal]
   → previewCheck via IPC: window.electronAPI.memberImport.previewCheck(rows)
        • resolve  → MemberImportPreviewDTO (duplicate vs DB + resolusi kelas)
        • reject   → PREVIEW_SYSTEM_ERROR (dialog error merah; tabel tidak tampil; import disabled)
   → MemberPreviewService.buildPreview(rows, dto)  [merge per baris]
        status baris:
          validasi renderer error  → ERROR
          isu backend duplicate   → DUPLICATE (keterangan: "NISN/Email sudah terdaftar di database. (nama · nomor)")
          isu backend class       → ERROR   (keterangan: "Kelas X tidak ditemukan.")
          tanpa isu               → VALID
   → summary (Total/Valid/Error/Duplicate) + tabel (maks PREVIEW_MAX_ROWS) + status badge
   → canImport = total > 0 && semua baris VALID
        = (dto.valid ∧ tidak ada error validasi renderer)
   → tombol Import aktif ⇔ canImport
```

## Validation

### Smoke `uat_wo6_p5a/preview-merge.smoke.ts` — 27/27 PASS
| Test | Hasil |
|------|-------|
| T1 preview sukses (2 baris bersih, DTO tanpa error) → semua VALID, `canImport:true` | PASS |
| T2 duplicate (isu `duplicateNisnInDb` baris 2) → baris2 `DUPLICATE`, summary duplicate 1, `canImport:false`, `existingMemberName` terbawa | PASS |
| T3 class tidak ditemukan (isu `classNotFound`) → baris ERROR, `canImport:false` | PASS |
| T4 validasi renderer tetap (Nama kosong) → ERROR, `canImport:false` | PASS |
| T5 gabungan (gender invalid + duplicate email DB) → baris1 ERROR, baris2 DUPLICATE | PASS |
| T6 duplicate in-file TIDAK dihitung ulang (2 baris NISN sama, DTO kosong) → keduanya VALID, `canImport:true` | PASS |
| T7 0 baris → `canImport:false` | PASS |

### Regression
- `npm run lint` PASS (tsc node + web).
- `npm run build` PASS — main 1,774.00 kB, preload 7.68 kB, renderer `index-Bie7NUv8.js` 928.56 kB.
- Grep artifact: renderer memuat `previewCheck`, label `Memeriksa data ke database...`, `Gagal memeriksa data ke database...`, pesan `sudah terdaftar di database`, `tidak ditemukan`; preload memuat `members:previewCheck`.

## Compatibility
- `canImport` = `total > 0 && valid === total`. Ini ekuivalen dengan `PreviewDTO.valid == true` **dan** tidak ada error validasi renderer (isu backend apa pun → baris bukan VALID). DTO backend tidak memiliki field `canImport`; `valid` dipetakan ke gate tombol Import (didokumentasikan).
- Mapper `toMemberImportRows` menormalkan gender ke `'male'|'female'` (kontrak `MemberImportRowInput`); backend `previewCheck` tidak mengonsumsi gender sehingga mapping hanya untuk shape IPC.
- `MemberImportValidationService` dan `MemberExcelParserService` TIDAK dimodifikasi (hanya dipakai).
- Konsekuensi keputusan PO (didokumentasikan): duplicate antar-baris **dalam satu file** tidak lagi terdeteksi di preview (backend hanya cek DB). Dua baris NISN sama akan lolos preview dan ditolak backend saat commit (P2002 → `createFailed`) di fase import (WO berikutnya). Sistem error preview menonaktifkan tombol Import dan menampilkan panel error.

## Status
**DONE — berhenti, menunggu review Product Owner.** Tombol Import belum dihubungkan (tetap placeholder), tanpa progress event, tanpa commit. (Laporan ini + 3 file modifikasi + `uat_wo6_p5a/preview-merge.smoke.ts` di working tree, belum di-commit.)
