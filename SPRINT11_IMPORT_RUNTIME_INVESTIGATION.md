# SPRINT11 — Import Buku "no-op" Runtime Investigation (WO11H)

**Date:** 01/08/2026 · **Mode:** READ ONLY (no code changes) · **Status:** DONE

## 1. Ringkasan

PO melaporkan: **Pipeline sampai Preview berhasil**, tetapi setelah mengklik tombol **Import Buku** tidak ada yang terjadi — tidak ada loading, tidak ada sukses, tidak ada error, tidak ada data baru.

**Kesimpulan akhir:**
1. **No-op yang dilaporkan PO TIDAK dapat direproduksi pada build saat ini.** Alur lengkap `Pilih File → Lanjut → Preview → Import Buku → "Import selesai"` **BERHASIL** di `out/` build 01/08 17:59, diverifikasi lewat runtime CDP dengan **DB kosong fresh** maupun **salinan DB dev asli**.
2. **Root cause no-op = bug penanganan file (WO11G), SUDAH DIPERBAIKI.** Bug `FileUploadDropzone.handleFiles` (reset `input.value` sebelum `files` dibaca → file tidak pernah terbaca → preview/import tidak pernah berjalan) adalah satu-satunya mekanisme "buntu diam-diam" di seluruh rantai. WO11G sudah memperbaikinya dan runtime smoke 16/16 PASS.
3. **Penemuan terpisah (RELEASE blocker):** paket `dist/win-unpacked/APLibrary.exe` (build 16:48) **CRASH di startup** — `Cannot find module '.prisma/client/default'`. Folder `.prisma` (direktori tersembunyi, berisi Prisma client generated) **tidak ikut ter-package** ke `app.asar` karena glob `node_modules/**/*` di electron-builder default mengecualikan dotfile. Aplikasi tidak pernah sampai ke UI → **PO tidak mungkin menjalankan build paket ini** untuk pengujian import.

## 2. Metodologi

- Launch aplikasi asli (`electron .`) dengan `--remote-debugging-port`, drive lewat CDP (WebSocket) untuk meniru interaksi UI nyata: `Runtime.evaluate` klik elemen, `DOM.setFileInputFiles` untuk pilih file.
- Tiga skenario:
  - **A. Build saat ini + DB kosong fresh** (`fresh.db`, via `prisma migrate deploy`) → port 9333
  - **B. Build saat ini + salinan DB dev asli** (`real.db`) → port 9337
  - **C. Paket `dist/win-unpacked/APLibrary.exe`** (build 16:48) → port 9334–9336
- Verifikasi hasil lewat query DB langsung (Prisma client smoke) dan inspeksi `app.asar`.

## 3. Temuan Per-Skenario

### 3.1 Skenario A & B — Build saat ini (`out/`, 17:59) → **PASS**

Alur yang dijalankan via CDP (identik interaksi PO):
1. Buka route `/books/import` → `BookImportPage` render.
2. Pilih file via `DOM.setFileInputFiles` (file template `Template_Import_Buku_v2.0.xlsx`) → tombol **Lanjut** aktif.
3. Klik **Lanjut** → parse & validasi → navigasi ke `/books/import/preview`.
4. Preview tampil: header ternormalisasi, 11 baris / 19 kolom, "Struktur workbook valid."
5. Klik **Import Buku** → status berubah → **"Import selesai" muncul di layar.**
6. Tidak ada console error / uncaught exception.

**Hasil DB (Skenario A, DB kosong):** BOOKS=2, COPIES=3, AUTHORS=2, PUBLISHERS=2, CATEGORIES=2. `InventorySequence` = `{id:'default', prefix:'INV', lastNumber:3}`.

**Hasil DB (Skenario B, DB dev asli):** sukses tanpa error; copy baru bertambah dari 10 → sesuai.

### 3.2 Skenario C — Paket `dist/win-unpacked/APLibrary.exe` (16:48) → **CRASH di startup**

```
Uncaught Exception:
Error: Cannot find module '.prisma/client/default'
Require stack:
- D:\...\dist\win-unpacked\resources\app.asar\node_modules\@prisma\client\default.js
- D:\...\dist\win-unpacked\resources\app.asar\out\main\index.js
```

- Window tampil dengan judul **"Error"**, aplikasi mati.
- **Akar masalah:** `node_modules/.prisma/` (direktori hasil `prisma generate`, berisi `client/*.js`) tidak ada di dalam `app.asar`. Daftar `node_modules` dalam asar hanya: `@prisma`, `bwip-js`, `read-excel-file`, `lucide-react`, dll. **Tanpa `.prisma`.**
- **Mengapa:** electron-builder memperlakukan folder `files: ["node_modules/**/*"]` dengan glob yang tidak mencocokkan dotfile (default `dot:false`). `.prisma` adalah hidden directory → ter-skip seluruhnya.
- `@prisma/client/default.js` di dalam asar melakukan `require('.prisma/client/default')` (relatif) → resolve ke `app.asar\node_modules\.prisma\client\default.js` → tidak ada → crash.
- `asarUnpack` sudah benar untuk `node_modules/.prisma/client/**`, `extraResources` sudah mengirim `query_engine-windows.dll.node` + `schema.prisma`, dan `templates/` — tetapi **semua itu sia-sia karena folder sumber `.prisma` tidak pernah masuk daftar `files`**.
- **Konsekuensi:** PO **tidak mungkin** menjalankan build paket ini — ia crash sebelum UI. Laporan no-op import tidak bisa berasal dari build paket.

## 4. Verifikasi Rantai Button → Handler (Jawaban Q1–Q8)

| # | Pertanyaan | Jawaban |
|---|-----------|---------|
| Q1 | Tombol Import Buku di Preview menuju handler yang benar? | **YA.** `BookImportPreviewPage.handleCommit` → `await window.electronAPI.imports.match(validatedWorkbook.canonicalRows)` → `setImportSuccess(true)`; catch → `setImportError`. Dikonfirmasi identik di bundle `out/` (17:59) dan di asar (16:48). |
| Q2 | Payload yang dikirim benar? | **YA.** `canonicalRows` (array `CanonicalRow`). Preload mengirim via `ipcRenderer.invoke('imports:match', ...)`. |
| Q3 | Ada INSERT ke DB saat match? | **YA.** `bookImportService.importBooks` melakukan insert Book + BookCopy (dan entitas relasi via AutoCreateService). DB fresh setelah import: 2 buku, 3 eksemplar, 2 penulis, 2 penerbit, 2 kategori. |
| Q4 | Ada exception/guard yang membungkam? | **TIDAK** di source saat ini. Rantai lengkap `handleCommit → invoke → matchingEngine → autoCreateService → bookImportService` terbukti berjalan sukses. |
| Q5 | Mengapa PO melihat no-op? | **Build basi.** No-op adalah gejala bug `FileUploadDropzone` (WO11G): `input.value` di-reset sebelum `files` dibaca → file tidak terbaca → `onFileChange` tidak pernah terpanggil → status "Lanjut" tidak pernah aktif → klik Import Buku tidak pernah mencapai handler. WO11G memperbaikinya (baca file dulu, baru reset) + runtime smoke 16/16. |
| Q6 | Apakah no-op masih ada di build saat ini? | **TIDAK.** Terbukti dengan Skenario A & B (runtime PASS). |
| Q7 | Build paket bisa dipakai PO? | **TIDAK.** Crash di startup (`.prisma` tidak ter-package). Ini defect packaging terpisah. |
| Q8 | Rekomendasi follow-up? | Lihat §6. |

## 5. Temuan Tambahan

- **Dua PrismaClient terpisah:** `electron/main/database.ts` (modul-level `prisma`, via `initDatabase`) vs `src/main/repositories/base/prisma.ts` (singleton `getPrisma`). Tidak menyebabkan masalah pada alur import, tapi merupakan duplikasi yang perlu dicatat.
- **Build artifact saat ini konsisten:** `out/` dibangun 01/08 17:59 (renderer `index-BPGTLYLy.js`) — lebih baru dari paket 16:48, dan berisi perbaikan WO11G. Verifikasi isi asar vs out/ menunjukkan handler & UI import identik.
- **DevToolsActivePort** userData terakhir = port 9337 (Skenario B) — konfirmasi sesi runtime kita yang terakhir berjalan.

## 6. Rekomendasi

1. **Untuk menutup no-op PO:** PO perlu diuji ulang dengan build yang **sudah memuat perbaikan WO11G** (build `out/` 17:59 atau paket baru). Pada build tersebut alur import berhasil end-to-end.
2. **RELEASE blocker — perbaiki packaging (WO baru, di luar scope investigasi ini):**
   - Tambahkan pola eksplisit di `electron-builder.yml` `files`: `node_modules/.prisma/**/*` (atau pindahkan seluruh Prisma client ke lokasi non-dotfile), lalu `npm run package:win` dan **verifikasi** `app.asar` berisi `node_modules/.prisma/client/default.js`.
   - Tambahkan ke aturan baku: "setiap build paket wajib diverifikasi dengan meluncurkan `dist/win-unpacked/APLibrary.exe` — bukan hanya `electron .`".
3. **Prosedur review PO (retain):** uji selalu pada **artifact `dist/` yang baru di-package**, bukan `out/` (karena `electron .` memakai `out/` langsung dan dapat bekerja walau paket rusak).

## 7. Artifak

- Driver CDP: `C:\Users\hp\AppData\Local\Temp\opencode\wo11import\driver.mjs`, `driver-realdb.mjs`, `driver-packaged.mjs`, `probe.cjs`, `probe2.cjs`
- DB uji: `fresh.db` (kosong), `real.db` (salinan DB dev), `fresh2.db`
- Isi asar diekstrak di: `C:\Users\hp\AppData\Local\Temp\opencode\wo11import\asar`
- Konfigurasi packaging: `electron-builder.yml` (dotfile `.prisma` tidak ter-cover `files`)

## 8. Status

**DONE — READ ONLY.** Tidak ada kode yang diubah. Temuan utama: no-op import sudah diperbaiki oleh WO11G dan terverifikasi PASS pada build saat ini; defect packaging `.prisma` di `dist/` adalah isu RELEASE terpisah yang menunggu WO baru.
