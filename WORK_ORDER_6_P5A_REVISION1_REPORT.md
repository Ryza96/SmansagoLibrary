# WORK ORDER 6 — P5A REVISION 1 REPORT — UI Preview Integration (Duplicate Dalam File Dikembalikan)

## Objective
Revisi atas P5A (BELUM APPROVED): **duplicate antar baris dalam file Excel dikembalikan**. Preview kini merupakan **MERGE** antara validasi renderer dan validasi backend:

| Lapisan | Pemeriksaan |
|---------|-------------|
| **Renderer** (tetap) | required field, gender, tanggal, **duplicate NISN dalam file**, **duplicate Email dalam file** |
| **Backend** (tetap) | duplicate database (`previewCheck` → `duplicateNisnInDb`/`duplicateEmailInDb`), class resolver (`classNotFound`/`classAmbiguous`) |

Status baris ditentukan dari **gabungan seluruh issue**; duplicate dalam file muncul **SEBELUM Import** (membuat `canImport=false`). Backend/IPC/parser TIDAK diubah. Tombol Import tetap TIDAK dihubungkan, tanpa progress, tanpa commit.

## Files Modified

| File | Perubahan (vs P5A) |
|------|--------------------|
| `src/services/MemberPreviewService.ts` | Kembali mendeteksi **duplicate NISN dalam file** dan **duplicate Email dalam file** (counting di renderer, `duplicateNisnRows`/`duplicateEmailRows` per baris). Status = gabungan: validasi renderer error → ERROR; dup dalam file ATAU dup database → DUPLICATE; class backend → ERROR; selainnya VALID. `issues` backend tetap dari `PreviewDTO`. `canImport` tetap `total > 0 && valid === total`. |
| `src/components/members/MemberImportDialog.tsx` | `keterangan()` kini menampilkan: error validasi renderer + `NOTE_DUPLICATE_NISN(baris)` + `NOTE_DUPLICATE_EMAIL(baris)` (dup dalam file) + pesan backend (`backendIssueMessage`, dup database/class + info anggota eksisting). |
| `src/utils/labels.ts` | Hapus `NOTE_DUPLICATE` (unused); tambah `NOTE_DUPLICATE_NISN(baris)` = "NISN duplikat dengan baris X.", `NOTE_DUPLICATE_EMAIL(baris)` = "Email duplikat dengan baris X.". |

**TIDAK diubah:** backend (`MemberImportService`), IPC, preload, parser, `MemberImportValidationService`, env.d.ts, perilaku previewCheck.

## UI Flow
```
Pilih file → parse (parser, tidak berubah)
   → validasi renderer: required/gender/tanggal  → ERROR
   → duplicate NISN dalam file (count di renderer)      → DUPLICATE
   → duplicate Email dalam file (count di renderer)     → DUPLICATE
   → previewCheck (IPC) → PreviewDTO:
        duplicateNisnInDb / duplicateEmailInDb           → DUPLICATE
        classNotFound / classAmbiguous                  → ERROR
   → status baris = gabungan seluruh issue
   → keterangan menampilkan semua catatan (validasi + dup file + backend)
   → canImport = total > 0 && semua baris VALID  (dup dalam file memblokir Import)
```

## Validation

### Smoke `uat_wo6_p5a/preview-merge.smoke.ts` — 40/40 PASS
| Test | Hasil |
|------|-------|
| T1 preview sukses → semua VALID, `canImport:true` | PASS |
| T2 duplicate database (`duplicateNisnInDb`) → `DUPLICATE`, `canImport:false`, info anggota eksisting terbawa | PASS |
| T3 class tidak ditemukan → `ERROR`, `canImport:false` | PASS |
| T4 validasi renderer (field wajib kosong) → `ERROR`, `canImport:false` | PASS |
| T5 gabungan renderer+backend (gender invalid + dup email DB) | PASS |
| **T6 duplicate NISN dalam file** → keduanya `DUPLICATE`, `duplicateNisnRows` saling menunjuk, `canImport:false` | PASS |
| T7 0 baris → `canImport:false` | PASS |
| **T8 duplicate Email dalam file** → keduanya `DUPLICATE`, `canImport:false` | PASS |
| **T9 keduanya bersamaan** (dup NISN dalam file baris 1&2 + dup email database baris 3) → semua `DUPLICATE`, `canImport:false` | PASS |
| **T10 satu baris punya keduanya** (dup NISN dalam file + dup NISN database) → `DUPLICATE`, `duplicateNisnRows=[2]`, `issues` backend terbawa | PASS |

### Regression
- `npm run lint` PASS (tsc node + web).
- `npm run build` PASS — main 1,774.00 kB, preload 7.68 kB, renderer `index-CUVIQW5j.js` 930.12 kB.
- Grep artifact renderer: `NISN duplikat dengan baris`, `Email duplikat dengan baris`, `sudah terdaftar di database` → semua ada. `NOTE_DUPLICATE` lama → 0 referensi di `src/`.

## Compatibility
- `canImport` kembali memblokir import bila ada dup dalam file (kebutuhan "muncul SEBELUM Import" terpenuhi): dua baris NISN sama → `DUPLICATE` → `valid < total` → `canImport:false`.
- `duplicateNisnRows`/`duplicateEmailRows` = daftar `rowNumber` lain yang berbagi nilai yang sama (tanpa dirinya sendiri); dipakai `keterangan` untuk "duplikat dengan baris X".
- Dup database tetap murni dari backend (`PreviewDTO.errors`); renderer tidak menghitung ulang terhadap DB.
- Prioritas status: ERROR (validasi) > DUPLICATE (file/db) > ERROR (class) > VALID. Satu baris dengan beberapa issue menampilkan semua catatannya.
- Konsekuensi inherent backend (tidak berubah): backend hanya cek dup vs DB; dup antar-baris dalam file ditangani renderer (sekarang dipulihkan). Error sistem preview tetap menampilkan panel error dan menonaktifkan Import.

## Status
**DONE — berhenti, menunggu review Product Owner.** Tombol Import belum dihubungkan (placeholder), tanpa progress event, tanpa commit. (Laporan ini + 3 file modifikasi + `uat_wo6_p5a/preview-merge.smoke.ts` di working tree, belum di-commit.)
