# WORK ORDER 4 REVISION 2 — Preview Quality (COMPLETE — READY review PO)

> Source of Truth: `IMPORT_MEMBER_ARCHITECTURE_SPEC.md` v3.0 (REVISION FINAL, APPROVED).
> Rev 2: Logic & Architecture WO-4 **APPROVED**. Perubahan terbatas pada **kualitas tampilan Preview**.
> Parser, validation engine, duplicate detection algorithm, database, service, RFC, dan arsitektur **TIDAK diubah**.

## Objective
1. Pastikan source code akhir bersih (tanpa import ganda / `<tr>` ganda / kolom Status ganda).
2. Pesan validasi spesifik per field ("Nama wajib diisi.", "Jenis Kelamin tidak valid.", dst.) — bukan generik.
3. Keterangan duplikat menyebut nomor baris konflik ("Duplikat dengan baris 12.", "Duplikat dengan baris 12, 28.").
4. Status Preview memakai Title Case dari LABELS ("Valid", "Error", "Duplicate") — bukan hardcode.
5. Kolom Keterangan membungkus teks dengan baik (tidak keluar tabel).
6. Jumlah kolom tetap: Baris, Nama, Kelas, NISN, Status, Keterangan.

## Files Modified
| # | File | Perubahan |
|---|------|-----------|
| 1 | `src/utils/labels.ts` | `MESSAGES` → fungsi template per field: `requiredValue(label)` → `"{label} wajib diisi."`, `invalidGender(label)`/`invalidDate(label)` → `"{label} tidak valid."`; `NOTE_DUPLICATE` → `(baris) => "Duplikat dengan baris {baris}."`; `STATUS_VALID`→"Valid", `STATUS_ERROR`→"Error", `STATUS_DUPLICATE`→"Duplicate" |
| 2 | `src/components/members/MemberImportDialog.tsx` | + helper `nisnKey(value)` (normalisasi NISN untuk display), `duplicateWith(row, rows)` (daftar nomor baris saudara), `errorMessage(error)` kini memanggil template `MESSAGES[key](label)`; `keterangan(row, rows)`; + `STATUS_LABEL` map (Title Case dari LABELS); badge Status render `STATUS_LABEL[row.status]`; sel Keterangan + `break-words`; TIDAK ada perubahan struktur kolom |

## Validation
- `npm run lint` PASS
- `npm run build` PASS (main 1,760.11 kB · preload 7.26 kB · renderer 925.16 kB)

## Technical Notes
- **Kebersihan source (poin 1):** diverifikasi ulang — `MemberImportDialog.tsx` memiliki tepat satu blok import per modul,
  satu `<tr>` header + satu template `<tr>` baris, satu kolom Status. Artefak "import ganda / `<tr>` ganda / Status ganda"
  pada laporan sebelumnya adalah **artefak diff**, bukan isi file.
- **Pesan validasi (poin 2):** pesan dihasilkan dari `MESSAGES[key](label)` — `label` sudah membawa nama field yang
  benar dari validation engine (Nama, Kelas, Jenis Kelamin, NISN, Alamat, No. WhatsApp, Tanggal Lahir). Validation
  engine **tidak diubah**; hanya interpretasi `{messageKey, label}` di renderer yang dibuat spesifik.
- **Duplikat (poin 3):** `duplicateWith(row, rows)` menghitung saudara NISN sama (normalisasi `trim(String(value))`
  — identik dengan kriteria deteksi, namun hanya untuk **menampilkan** nomor baris; algoritma deteksi status tetap
  di service dan tidak disentuh). Daftar baris memakai urutan file (ascending), dipisah `", "`. Contoh terverifikasi:
  baris 2/12/28 ber-NISN sama → baris 2 = "Duplikat dengan baris 12, 28.", baris 12 = "Duplikat dengan baris 2, 28.",
  baris 28 = "Duplikat dengan baris 2, 12.".
- **Status Title Case (poin 4):** `STATUS_LABEL: Record<MemberPreviewStatus, string>` memetakan ke
  `LABELS.MEMBER_IMPORT.STATUS_VALID/STATUS_ERROR/STATUS_DUPLICATE` ("Valid"/"Error"/"Duplicate");
  nilai status (uppercase `VALID`/`ERROR`/`DUPLICATE`) hanya dipakai sebagai key internal, tidak pernah dirender.
- **Wrapping (poin 5):** sel Keterangan `whitespace-pre-line` (newline untuk multi-error) + `break-words`
  (pesan panjang membungkus dalam kolom); tabel `w-full` di dalam `overflow-x-auto`.
- **Jumlah kolom (poin 6):** tetap 6 kolom — Baris, Nama, Kelas, NISN, Status, Keterangan.
- Sanity check output pesan (logika identik helper dialog): semua contoh sesuai spesifikasi (lihat bawah).
- TIDAK ada perubahan parser / validation engine / duplicate detection / database / service / RFC / arsitektur /
  IPC / preload / env.d.ts / dependency / smoke test.

## Hasil Preview Terbaru (deskripsi — tanpa screenshot GUI)
Tabel preview setelah unggah file (kolom: Baris | Nama | Kelas | NISN | Status | Keterangan):

```
| Baris | Nama          | Kelas     | NISN      | Status   | Keterangan                          |
|-------|---------------|-----------|-----------|----------|-------------------------------------|
| 2     | Budi Santoso  | X MIPA 1  | 0123456789| Valid    | -                                   |
| 3     | Siti Aminah   | XI IPS 2  | 0123456789| Duplicate| Duplikat dengan baris 2.            |
| 4     | Dewi Lestari  | XII MIPA 3| 0011223344| Valid    | -                                   |
| 5     | (kosong)      | X MIPA 1  | 9988776655| Error    | Nama wajib diisi.                   |
| 6     | Andi Pratama  | (kosong)  | 1112223334| Error    | Kelas wajib diisi.\nAlamat wajib diisi. |
```

Keterangan:
- Status memakai Title Case (Valid / Error / Duplicate) dari LABELS.
- Baris `3` menampilkan nomor baris sumber duplikat ("Duplikat dengan baris 2."); bila lebih dari satu saudara
  ditampilkan semua ("Duplikat dengan baris 12, 28.").
- Baris error menampilkan satu pesan per baris; multi-error digabung dengan newline (kolom Keterangan membungkus
  otomatis, tidak keluar tabel). Contoh verifikasi 5 field kosong:
  "Nama wajib diisi. / Kelas wajib diisi. / NISN wajib diisi. / Alamat wajib diisi. / No. WhatsApp wajib diisi."
  (masing-masing pada baris terpisah).

## Status
**DONE — Architecture Gate BERHENTI**, menunggu review Product Owner. Tidak commit, tidak lanjut Work Order berikutnya.
