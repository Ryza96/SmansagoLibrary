# BUILD ARTIFACT AUDIT — asal renderer / preload / main yang dijalankan aplikasi

- **Tujuan:** audit build artifact — buktikan (atau bantah) bahwa kode yang dijalankan aplikasi berasal dari HEAD saat ini. Fakta saja, tanpa kesimpulan.
- **HEAD:** `7a2a4ab06c1a00ab12d1cf2415db322c324629e4` — 2026-08-05 10:19:08 +0700 (commit R-4).
- **Status:** BELUM RELEASE. Tidak ada commit/push, source dan smoke tidak diubah selama audit.
- **Alat:** `@electron/asar` (listPackage / extractAll), `Select-String`, `Get-FileHash`, `git log`.

---

## 1. Jalur build & yang dijalankan Electron (fakta konfigurasi)

| Item | Fakta | Sumber |
|---|---|---|
| `package.json` `main` | `"./out/main/index.js"` — Electron memuat main dari `out/` | package.json:5 |
| `npm run build` | `electron-vite build` | package.json:8 |
| output build | main→`out/main/index.js`, preload→`out/preload/index.js`, renderer→`out/renderer/*` | electron.vite.config.ts:8,17,26 |
| `npm run package:win` | `electron-vite build && electron-builder --win --config electron-builder.yml` | package.json:20 |
| file yang masuk package | `out/**/*` + `node_modules/**/*` (ke dalam `app.asar`) | electron-builder.yml `files:` |
| renderer bundle | nama file berisi content-hash (`index-<hash>.js`), dirujuk `out/renderer/index.html` | hasil build |
| dua cara aplikasi dijalankan | (a) dev/preview: Electron load `out/main/index.js` dari folder proyek; (b) ter-package: Electron load `out/main/index.js` **di dalam** `dist/win-unpacked/resources/app.asar` | package.json main + electron-builder |

---

## 2. Artifact `out/` (electron-vite build output — proyek)

| File | Bytes | LastWriteTime |
|---|---|---|
| `out/main/index.js` | 1,868,609 | 05/08/2026 10:57:19 |
| `out/preload/index.js` | 9,945 | 05/08/2026 10:57:19 |
| `out/renderer/index.html` | 528 | 05/08/2026 10:57:23 |
| `out/renderer/assets/index-z9hEr1Se.js` | 1,105,564 | 05/08/2026 10:57:23 |
| `out/renderer/assets/index-DJVLMi8L.css` | 39,216 | 05/08/2026 10:57:23 |

`out/renderer/index.html` mereferensikan: `./assets/index-z9hEr1Se.js` + `./assets/index-DJVLMi8L.css`.

**Relasi dengan HEAD & working tree:**
- HEAD commit R-4: 05/08 10:19:08. Build `out/`: 05/08 10:57 — **setelah** commit HEAD.
- Dua file source termodifikasi di working tree (tanpa commit): `report.repository.ts` mtime 05/08 10:55:18, `report.service.ts` 05/08 10:55:26 — **sebelum** build `out/` 10:57 → bundle memuat isi working tree saat ini.
- Hash bundle renderer `index-z9hEr1Se.js` = hash yang dirujuk `index.html` (konsisten).

---

## 3. Artifact `dist/` (electron-builder package output)

| Item | LastWriteTime |
|---|---|
| `dist/win-unpacked` | 03/08/2026 16:08:14 |
| `dist/win-unpacked/resources/app.asar` (52,451,218 B) | 03/08/2026 16:08:14 |
| `dist/APLibrary Setup 0.1.0.exe` | 03/08/2026 16:08:42 |
| `dist/latest.yml` `releaseDate` | `2026-08-03T09:08:43.696Z` = 03/08 16:08:43 +0700 |

**Perbandingan waktu:** `dist/` dibuat **03/08 16:08**; HEAD (R-4) dibuat **05/08 10:19** — selisih ~1 hari 18 jam; `dist/` lebih TUA dari HEAD.

---

## 4. Isi `app.asar` (hasil `@electron/asar extractAll`)

| Path di dalam asar | Bytes | Pembanding `out/` |
|---|---|---|
| `out/main/index.js` | 1,780,168 | out/main/index.js = 1,868,609 → **berbeda ukuran** |
| `out/preload/index.js` | 8,009 | out/preload/index.js = 9,945 → **berbeda ukuran** |
| `out/renderer/index.html` (528 B) | mereferensikan `./assets/index-BYfUl8e8.js` + `./assets/index-C3bv_ew0.css` | out/renderer/index.html mereferensikan `index-z9hEr1Se.js` + `index-DJVLMi8L.css` → **nama bundle berbeda** |
| `out/renderer/assets/index-BYfUl8e8.js` | 987,824 | out/renderer/assets/index-z9hEr1Se.js = 1,105,564 → **berbeda ukuran** |
| `out/renderer/assets/index-C3bv_ew0.css` | 36,457 | out/renderer/assets/index-DJVLMi8L.css = 39,216 → **berbeda ukuran** |
| `out/tsconfig.node.tsbuildinfo` | 63,100 | out/tsconfig.node.tsbuildinfo = 69,782 → **berbeda ukuran** |

---

## 5. Matriks penanda (marker) — fakta hitungan string di bundle

### 5.1 main bundle

| Marker | asar `out/main/index.js` | out `out/main/index.js` |
|---|---|---|
| `reports:` | **0** | 5 |
| `reports:overdues` | **0** | 1 |
| `dashboard:overview` | **0** | 1 |
| `promotions:findMany` | **0** | 1 |
| `printing:bookLabels` | 1 | (tidak dihitung) |

### 5.2 preload bundle

| Marker | asar `out/preload/index.js` | out `out/preload/index.js` |
|---|---|---|
| `reports:` | **0** | 6 |
| `dashboard:` | **0** | 2 |
| `promotions:` | **0** | 5 |

### 5.3 renderer bundle

| Marker | asar `index-BYfUl8e8.js` | out `index-z9hEr1Se.js` |
|---|---|---|
| `Laporan Keterlambatan` | **0** | 1 |
| `Laporan Peminjaman` | **0** | 1 |
| `Laporan Pengembalian` | **0** | (tidak dihitung) |
| `Masih Terlambat` | **0** | 1 |
| `Riwayat Promosi` | **0** | 5 |
| `Promosi` | **0** | (tidak dihitung) |
| `Tahun Ajaran` | 16 | (tidak dihitung) |
| `Import Buku` | 9 | (tidak dihitung) |

---

## 6. Kronologi git vs artifact (fakta)

| Waktu (+0700) | Fakta |
|---|---|
| 03/08 16:08:14 | `dist/` dibuild (app.asar, setup exe, latest.yml releaseDate 16:08:43) |
| 03/08 ≤16:08 | commit terakhir sebelum build dist: **`c35fa11`** (WO-11A AY-1b) |
| 05/08 04:25–06:07 | commit: borrow-card WO-1/WO-2/UAT, dashboard phase 1 (`c571692`) |
| 05/08 08:08–08:44 | commit: membership first-borrow (`415f9b5`), member class display (`50dd5b2`) |
| 05/08 09:25–10:19 | commit R-1 foundation (`de98134`), R-2 (`2203538`), R-3 (`ee65ce1`), **R-4 HEAD (`7a2a4ab`)** |
| 05/08 10:55 | edit working tree: `report.repository.ts`, `report.service.ts` |
| 05/08 10:57 | `npm run build` → `out/` diperbarui |

Fakta pendukung: `dist/win-unpacked/resources/prisma/client/schema.prisma` (skema DB yang dikemas app) SHA-256 `235A21DD…` ≠ `prisma/schema.prisma` SHA-256 `4665BD22…`.

---

## 7. Fakta yang dapat diverifikasi ulang

1. Ada DUA set bundle: `out/` (05/08 10:57, memuat semua marker R-1..R-4/dashboard/promotion) dan `app.asar` di `dist/` (03/08 16:08, TIDAK memuat marker reports/dashboard/promotion, hanya sampai fitur yang ada sebelum 03/08 16:08).
2. Nama file bundle renderer dan ukuran main/preload/renderer/css keduanya berbeda antara `app.asar` dan `out/` — bukan artifact yang sama.
3. Waktu pembuatan `dist/` (03/08 16:08) mendahului seluruh commit modul Report (05/08 09:25–10:19) dan seluruh commit dashboard/promotion-borrow-card (05/08).
4. `package.json` `main` = `./out/main/index.js`: dev/preview memuat dari `out/` proyek; package memuat dari `out/` di dalam `app.asar`.
5. Skema Prisma yang dikemas di `app.asar` berbeda hash dengan `prisma/schema.prisma` saat ini.
