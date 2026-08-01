# RELEASE_ARTIFACT_AUDIT.md

**Audit: Apakah executable yang dijalankan Product Owner berasal dari build terbaru?**

- **Mode:** READ ONLY — tidak build, tidak package, tidak menjalankan aplikasi, tidak automation, tidak mengubah file.
- **Status:** SELESAI — menunggu review Product Owner.

---

## 1. TIMESTAMP REPORT

### 1.1 Artifact package saat ini (`dist/`)

| Item | Timestamp | Ukuran |
|------|-----------|--------|
| `dist/` | **01/08/2026 13:13:01** | — |
| `dist/win-unpacked/` | **01/08/2026 13:12:13** | — |
| `dist/win-unpacked/APLibrary.exe` | **01/08/2026 13:12:17** | 188.784.128 bytes |
| `dist/win-unpacked/resources/app.asar` | **01/08/2026 13:12:13** | 52.312.227 bytes |
| `dist/APLibrary Setup 0.1.0.exe` (NSIS installer) | 01/08/2026 13:13:00 | 94.007.552 bytes |
| `dist/APLibrary Setup 0.1.0.exe.blockmap` | 01/08/2026 13:13:01 | 98.233 bytes |
| `dist/latest.yml` | 01/08/2026 13:13:01 | 346 bytes |

### 1.2 Build (`out/`) saat ini

| Item | Timestamp |
|------|-----------|
| `out/main/index.js` | 01/08/2026 13:06:05 |
| `out/preload/index.js` | 01/08/2026 13:06:05 |
| `out/renderer/index.html` | 01/08/2026 13:06:10 |
| `out/renderer/assets/index-DiqpmWbM.js` | 01/08/2026 13:06:10 |
| `out/renderer/assets/index-C0K5vrFJ.css` | 01/08/2026 13:06:10 |

### 1.3 Implementasi Sprint 10 (source working tree)

| File | Timestamp |
|------|-----------|
| `src/utils/navigation.ts` (route `BOOK_IMPORT`) | 31/07/2026 19:17:22 |
| `src/pages/BooksPage.tsx` (tombol Import) | 31/07/2026 19:17:38 |
| `src/routes/index.tsx` (route `/books/import`) | 31/07/2026 19:27:14 |
| `src/pages/BookImportPage.tsx` | 31/07/2026 23:45:57 |
| `src/utils/labels.ts` (label `BOOK.IMPORT`/`IMPORT.*`) | 01/08/2026 12:24:42 |
| `src/pages/BookImportPreviewPage.tsx` (commit button WO-2) | 01/08/2026 12:24:47 |

### 1.4 Referensi artifact lama (yang PO jalankan)

- Package `dist/win-unpacked/` lama: **31/07/2026 10:24:35** (dibuktikan di `SPRINT10_WO2_INVESTIGATION.md`; `app.asar` lama berisi **0** string import).

> **Catatan transparan:** Timestamp `dist/` hari ini (13:07–13:13) dihasilkan oleh upaya **WO-2.1 "Release Verification" yang kemudian DIBATALKAN** (build 13:06 + package 13:07–13:13). Audit ini READ ONLY — tidak ada build/package/run tambahan; hanya membaca state saat ini.

---

## 2. BUILD HISTORY

| # | Tanggal/Waktu | Kejadian | Bukti |
|---|---------------|----------|-------|
| 1 | 31/07/2026 10:24 | Package lama dibuat (electron-builder) dari kode **sebelum** fitur import | `dist/` lama 31/07 10:24; INVESTIGATION: `app.asar` lama 0 string import |
| 2 | 31/07/2026 16:01 | Commit `437b50a "release: v1.0 release candidate"` — **tidak memuat fitur import** | `git log`; `git ls-tree 437b50a` → 0 file import |
| 3 | 31/07 19:17 s/d 01/08 12:24 | Implementasi Sprint 5–10 di working tree (incl. WO-2) | timestamp source §1.3; 31 file modified + 77 untracked (uncommitted) |
| 4 | 01/08/2026 13:06 | Build terbaru `out/` (electron-vite) | `out/` timestamp §1.2 |
| 5 | 01/08/2026 13:07–13:13 | Package terbaru `dist/` (electron-builder) — dalam sesi WO-2.1 yang dibatalkan | timestamp §1.1 |

### 2.1 Apakah `npm run dist` pernah dijalankan setelah WO-2?

**TIDAK.** `npm run dist` **bukan script yang ada** di `package.json` — menjalankannya akan error `Missing script: "dist"`. Script packaging yang tersedia:

```
package:win = electron-vite build && electron-builder --win --config electron-builder.yml
```

Bukti: `package.json` scripts = `dev, build, preview, postinstall, prisma:*, lint, lint:eslint, lint:fix, format, format:check, package:win`. **Tidak ada `dist`.**

Yang **pernah** dijalankan setelah WO-2 selesai: `electron-builder --win` pada 01/08 13:07–13:13 (bagian dari WO-2.1 yang dibatalkan). Sebelum hari itu, package terakhir = 31/07 10:24 (sebelum implementasi Sprint 10 selesai — terbukti source BooksPage 31/07 19:17 > 31/07 10:24).

---

## 3. ARTIFACT COMPARISON

### 3.1 Metode

Ekstrak `dist/win-unpacked/resources/app.asar` (baca-only, ke temp di luar repo) → bandingkan SHA256 tiap bundle terhadap `out/` (build hari ini dari working tree).

### 3.2 Hasil: **Artifact dist = Build working tree (IDENTIK)**

| File di app.asar | SHA256 di asar | SHA256 di `out/` | Match |
|------------------|----------------|------------------|-------|
| `out/main/index.js` | `EC72D9AA…4573A9` | `EC72D9AA…4573A9` | **YES** |
| `out/preload/index.js` | `85D6FAAF…0143077` | `85D6FAAF…0143077` | **YES** |
| `out/renderer/index.html` | `6605B89F…5ABAEB` | `6605B89F…5ABAEB` | **YES** |
| `out/renderer/assets/index-C0K5vrFJ.css` | `08F0D7F6…60CD11` | `08F0D7F6…60CD11` | **YES** |
| `out/renderer/assets/index-DiqpmWbM.js` | `C1FCBAE5…1D8255` | `C1FCBAE5…1D8255` | **YES** |

### 3.3 Konten fitur di artifact saat ini

Grep string pada `app.asar` saat ini:

| String | Kemunculan |
|--------|-----------|
| `Import Buku` | 6 |
| `BOOK_IMPORT` | 11 |
| `books/import` | 3 |
| `imports:match` | 2 |
| `BACK_TO_BOOKS` | 2 |

→ **Fitur Sprint 10 + WO-2 HADIR di artifact dist saat ini.**

### 3.4 Working Tree vs artifact yang PO jalankan (31/07)

- **TIDAK identik.** `app.asar` lama (31/07) = **0** kemunculan `Import Buku`/`BOOK_IMPORT`/`books/import`/`imports:match` (bukti tersimpan di `SPRINT10_WO2_INVESTIGATION.md`; artifact lama sudah di-overwrite oleh package baru, jadi tak bisa di-hash ulang).
- Tidak ada salinan `APLibrary.exe` lain di sistem (scan `%USERPROFILE%` depth 4 dan `D:\kontenyou` depth 3) → satu-satunya executable ter-package = `dist/win-unpacked/APLibrary.exe`.

---

## 4. ROOT CAUSE

**Executable yang dijalankan Product Owner saat melaporkan tombol "Import Buku" hilang = artifact LAMA (package 31/07/2026 10:24), bukan dari build terbaru.**

Alasan berurutan:

1. Implementasi Sprint 10 (incl. WO-2) berada di **working tree yang belum di-commit**; commit `437b50a` (31/07 16:01) sama sekali tidak memuat fitur import.
2. Package terakhir sebelum hari ini dibuat **31/07 10:24 — sebelum** implementasi Sprint 10 selesai (source Sprint 10 baru berubah 31/07 19:17 s/d 01/08 12:24). Bundle di dalamnya tidak punya tombol, route, label, maupun channel import.
3. `npm run dist` tidak pernah dijalankan (script tidak ada); alur packaging = `package:win`/`electron-builder`, yang terakhir dieksekusi untuk kode lama tersebut.
4. PO membuka executable lama → tidak melihat "Import Buku". Bukan bug source; source & file aktif sudah benar (terbukti di `SPRINT10_WO2_INVESTIGATION.md`).
5. **State hari ini:** `dist/` telah di-repackage pada 01/08 13:07–13:13 (dalam sesi WO-2.1 yang dibatalkan) dan kini **byte-identical dengan build terbaru** (§3). Artinya, executable lama yang PO pakai sudah tidak lagi ada di `dist/` dev ini — tetapi **PO belum menerima/menjalankan package baru ini**; executable yang mereka jalankan tetap versi lama sampai package baru didistribusikan.

---

## 5. RECOMMENDATION

1. **Distribusikan package terbaru ke PO.** Artifact yang valid & sudah terbukti berisi seluruh implementasi Sprint 5–10:
   - `dist/win-unpacked/APLibrary.exe` (unpacked), atau
   - `dist/APLibrary Setup 0.1.0.exe` (installer NSIS, 01/08 13:13).
   Setelah PO menjalankan package ini, tombol "Import Buku" dan alur `Buku → Import Buku → Preview → Import` akan tampil.
2. **Verifikasi cepat tanpa automation** (sudah dilakukan audit ini): SHA256 asar==out MATCH + grep `Import Buku`=6, `imports:match`=2 di `app.asar` → artifact = build terbaru. Tidak perlu remote debugging / menjalankan aplikasi untuk membuktikan provenance.
3. **Catatan packaging:** package hari ini dibuat dengan konfigurasi `win.signAndEditExecutable: false` (temp config) karena kendala lingkungan — ekstraksi winCodeSign gagal membuat symlink `darwin` tanpa privilege (admin/Developer Mode) di mesin ini. Dampak: icon default Electron & metadata version tidak di-edit oleh rcedit; **fungsi aplikasi tidak terpengaruh**. Untuk rilis resmi, jalankan packaging di lingkungan ber-Developer Mode/admin, atau atur sertifikat signing.
4. **SOP (anti-terulang):** setiap WO selesai → jalankan `npm run package:win` → verifikasi `app.asar` memuat string fitur → distribusikan package baru → PO menguji artifact terbaru (bukan aplikasi terinstal lama).
5. **Git hygiene:** commit seluruh working tree (31 modified + 77 untracked) setelah persetujuan PO, agar artifact dapat direproduksi dari git. Hapus/arsipkan package lama agar tidak tertukar.

---

*Sumber bukti: `Get-Item` timestamp §1, `package.json` scripts §2.1, `asar extract` + `Get-FileHash -Algorithm SHA256` §3.2, grep string §3.3, `git log`/`git status` §2, `SPRINT10_WO2_INVESTIGATION.md` §1.4/§4.*
