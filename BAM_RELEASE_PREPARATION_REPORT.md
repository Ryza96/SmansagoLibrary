# BAM RELEASE PREPARATION REPORT (v0.1.1)

Repositori: `D:\kontenyou\web\New folder\APPSCANNER\APLibrary`
Cabang: `main` — TIDAK ada commit/push pada WO ini. Status: **READY FOR UAT**.

---

## 1. Ringkasan Eksekutif

Persiapan rilis v0.1.1 (BAM) selesai dan seluruh gate pembuktian LULUS:

| Gate | Hasil |
|------|-------|
| Rename identitas APLibrary → BAM (source) | PASS |
| Version 0.1.0 → 0.1.1 | PASS |
| Build gates (tsc node+web, electron-vite, electron-builder) | PASS |
| Ikon BAM pada app + `BAM.exe` + installer | PASS |
| Smoke Backup & Restore (fresh DB) | 73/73 + 59/59 PASS |
| Instalasi bersih → DB kosong (schema 9 migration) | PASS |
| Upgrade 0.1.0 → 0.1.1 → data lama dipertahankan | PASS |
| Window startup maximize | PASS (showCmd=3) |
| Tentang (About) menampilkan BAM + 0.1.1 | PASS (statis, lihat §10) |

**FINAL VERDICT: BAM RELEASE PREPARATION READY FOR UAT.**

---

## 2. Verifikasi Sumber (Rename + Version)

Seluruh perubahan identitas user-visible di-verifikasi di source:

- `package.json`: `version: 0.1.1`, `description: "Aplikasi Perpustakaan Desktop - BAM"`. **TANPA `productName`** — sengaja dipertahankan agar `app.getName()` = `aplibrary` dan `userData` tetap `%APPDATA%\aplibrary` (jaminan preservasi data saat upgrade). `package-lock.json` baris 3 & 9 ikut di-update.
- `src/utils/app.ts`: `NAME = 'BAM'`, `VERSION = '0.1.1'`.
- `src/utils/labels.ts`: `AUTH.APP_NAME = 'BAM'`.
- `src/renderer/index.html`: `<title>BAM</title>`.
- `src/components/layout/TopBar.tsx`: menampilkan "BAM".
- `src/main/infrastructure/backup/backup.service.ts:82`: nama file backup `BAM-backup-<timestamp>-<8>.apbackup` (sebelumnya `APLibrary-backup-…`).
- `electron/main/repositories/setting.repository.ts:7`: default `libraryName: 'BAM'` (default instalasi baru).
- `src/pages/SettingsPage.tsx`: blok About menampilkan `APP.NAME` + `appInfo?.version ?? '—'` + `© <tahun> BAM`.

**KEEP STABLE (TIDAK diubah):** appId `com.kontenyou.aplibrary`; nama paket `aplibrary`; nama file DB `aplibrary.db`; `MANIFEST_FORMAT = 'aplibrary-backup'` (manifest.ts:14); `userData` `%APPDATA%\aplibrary`; riwayat migration. Tidak ada perubahan schema/migration/data.

---

## 3. Verifikasi Build

Gates dijalankan pada working tree BAM (tanpa `npm run lint` — script tersebut TIDAK ada di package.json; project ini tidak memiliki lint gate, gate resminya tsc + build):

1. `npx tsc --noEmit -p tsconfig.node.json` → **PASS**
2. `npx tsc --noEmit -p tsconfig.web.json` → **PASS**
3. `npx electron-vite build` → **PASS** (main / preload / renderer ter-build)
4. `npx electron-builder --win` → **PASS** (exit 0, §4)

---

## 4. Verifikasi Artifak

### Installer
- `dist\BAM Setup 0.1.1.exe` — **101,002,792 bytes**, dibuat 13/08/2026 21:39.
- `dist\BAM Setup 0.1.1.exe.blockmap`, `latest.yml`, `builder-debug.yml` ikut ter-generate.

### asar (resources\app.asar)
- `package.json` dalam asar: `name=aplibrary`, `version=0.1.1`, **`productName` KOSONG** (diverifikasi via `npx asar extract-file`; hasil byte-identik dengan `package.json` repo — tanpa kerusakan).

### BAM.exe (post `afterPack` rcedit)
| Properti | Nilai |
|----------|-------|
| ProductName | BAM |
| FileDescription | BAM |
| FileVersion | 0.1.1 |
| ProductVersion | 0.1.1 |
| OriginalFilename | BAM.exe |
| CompanyName | KontenYou |
| Icon | ter-embed (rcedit `--set-icon resources/icon.ico`; `ExtractAssociatedIcon` 32×32 terbaca) |

### Ikon
- `resources\icon.ico` (73,693 B, 6 ukuran 16–256 px, PNG-compressed) di-generate dari `C:\Users\hp\Desktop\BAM.png` via `scripts/generate-bam-icon.cjs`.
- `electron-builder.yml`: `win.icon: resources/icon.ico`, `productName: BAM`, `shortcutName: BAM`, `win.signAndEditExecutable: false`, `afterPack: scripts/after-pack.cjs`.

### Installer blocker winCodeSign
Ekstraksi cache winCodeSign tetap gagal (symlink macOS — mesin tanpa Developer Mode/admin). Solusi final yang diterapkan:
- `signAndEditExecutable: false` (tanpa sertifikat, signing memang dilewati — log: "no signing info identified, signing is skipped").
- Ikon + versi exe di-embed **manual** via hook `afterPack` (`scripts/after-pack.cjs`) yang memanggil `rcedit-x64.exe` dari cache `C:\Users\hp\AppData\Local\electron-builder\Cache\winCodeSign\014371263\rcedit-x64.exe`. Log build: `[after-pack] BAM icon + version embedded into BAM.exe`.

Dampak kosmetik yang tersisa: metadata shortcut/ikon **installer** dieksekusi electron-builder (tidak melalui rcedit), namun karena `BAM.exe` di-install sudah ber-icon, shortcut hasil install akan mewarisi ikon BAM.

---

## 5. Verifikasi Identitas BAM (bundle)

Grep pada bundle hasil build (`out\`):

| Bundle | APLibrary | BAM |
|--------|-----------|-----|
| renderer (`index-*.js`) | 0 | 3 (title/BAM) |
| main (`index.js`) | 4 | 4 |
| preload | 0 | 0 |

- 4 match "APLibrary" di bundle main = **Prisma DMMF ter-generate**: `Setting.libraryName @default("APLibrary")` di metadata generator. **BUKAN** user-visible runtime; TIDAK diubah (catatan teknis, §12).
- 2 dari 4 match "BAM" di main = DMMF `@default("BAM")` (setting.repository default baru); 2 lain = kode BAM.

---

## 6. Smoke Test Backup & Restore (fresh DB)

Metodologi: kompilasi tsconfig sementara (`C:\Users\hp\AppData\Local\Temp\opencode\bam-wo-smoke\tsconfig.json`) — include HANYA file smoke (bukan `src/main/**` yang menarik bwip-js), `"strict": false` (pitfall `gateResolve?.()` tipe `never`), module commonjs + moduleResolution node, `paths: { "@prisma/client": ["src/generated/prisma/index.d.ts"] }`, baseUrl/rootDir = repo root. Fresh DB per suite (`file:C:\...` + `npx prisma migrate deploy` workdir `prisma\` + `NODE_PATH=<repo>\node_modules`).

- `wo4_backup_smoke\smoke.ts` → **73/73 PASS**, termasuk "filename diawali `BAM-backup-<timestamp>`".
- `wo6_backup_restore_ui_smoke\smoke.ts` → **59/59 PASS**, termasuk "`target.sampleFilename` ber-awalan `BAM-backup-`".

Kedua file smoke di-update ke ekspektasi `BAM-backup-` (perubahan di working tree, lihat §13).

---

## 7. Verifikasi Instalasi Bersih (empty DB)

Runtime packaged (`dist\win-unpacked\BAM.exe`) dijalankan dengan `--user-data-dir=C:\Users\hp\AppData\Local\Temp\opencode\bam-userdata-test` (redirection userData **terbukti dihormati**).

Log startup:
```
[DataInfra] Production data root: ...\bam-userdata-test
[DataInfra] Directories ensured: 11 created, 1 existed
[Migrations] bootstrap: 9 applied, 0 skipped
[DB] SQLite connected successfully
[RECONCILE] InventorySequence lastNumber=0 maxInventoryNumber=0 synced=true
```

Verifikasi DB hasil (node:sqlite): **18 tabel hadir**; seluruh tabel data = **0 baris**; hanya bootstrap default: `Setting=1` (default `libraryName="BAM"` — rename ter-render bahkan di instalasi baru) dan `InventorySequence=1` (prefix INV).

**KESIMPULAN: instalasi bersih → DB kosong ber-schema lengkap (9 migration) tanpa crash. PASS.**

---

## 8. Verifikasi Upgrade 0.1.0 → 0.1.1 (preservasi data)

`%APPDATA%\aplibrary\database\aplibrary.db` (389,120 B, mtime 11/08/2026 09:28) adalah DB **live milik build packaged lama** — bukti nyata jalur upgrade. Untuk keamanan, DB lama di-*copy* (TANPA menyentuh asli) ke `C:\Users\hp\AppData\Local\Temp\opencode\bam-userdata-upgrade\database\aplibrary.db`, lalu BAM 0.1.1 dijalankan terhadapnya:

```
[Migrations] bootstrap: 2 applied, 7 skipped
[DB] SQLite connected successfully
[RECONCILE] InventorySequence lastNumber=11 maxInventoryNumber=11 synced=false
```

Perbandingan jumlah baris (BACKUP = DB versi lama; UPGRADE = DB setelah dibuka 0.1.1):

| Tabel | Backup | Upgrade |
|-------|--------|---------|
| Book / BookCopy / Member | 1 / 11 / 1 | 1 / 11 / 1 |
| Author / Publisher / Category | 1 / 1 / 1 | 1 / 1 / 1 |
| AcademicYear / Curriculum / Class | 1 / 0 / 0 | 1 / 0 / 0 |
| MemberEnrollment / Promotion* | 0 / 0 | 0 / 0 |
| Borrow / BorrowDetail | 0 / 0 | 0 / 0 |
| Setting / InventorySequence / Admin / AdminSession | 1 / 1 / 1 / 1 | 1 / 1 / 1 / 1 |

Jumlah baris **IDENTIK** pada seluruh tabel. DB upgrade hanya bertambah 2 migration (bootstrap mengejar 2 migration yang belum applied oleh build lama — `20260810_wo_book_cover` & `20260811_wo_member_photo`), data lengkap dipertahankan. Reconciliation menyinkronkan urutan inventory (11 = maksimum dari 11 eksemplar) — perilaku health-check yang benar.

**KESIMPULAN: 0.1.1 membuka DB lama dengan data utuh. PASS.** (DB asli `%APPDATA%\aplibrary` TIDAK tersentuh — mtime tetap, hash tetap, lihat §11.)

---

## 9. Verifikasi Window Maximize

BAM.exe dijalankan, main window di-inspect via `GetWindowPlacement` (P/Invoke user32) 7 detik setelah launch:

```
MAXIMIZE : showCmd=MAXIMIZED(3)  rect=(43,0)-(1366,728)
```

`showCmd=3` = SW_SHOWMAXIMIZED. Work-area 1366×728 (layar 1366×768 − taskbar) — window **maximized saat startup** sesuai `electron/main/index.ts` (`ready-to-show → maximize() → show()`). **PASS.**

---

## 10. Verifikasi Tentang (About)

- About di `SettingsPage.tsx` merender `APP.NAME` (`'BAM'` dari `src/utils/app.ts`) + `appInfo?.version ?? '—'`.
- `appInfo.version` berasal dari `app.getVersion()` (electron/ipc/app.ipc.ts:21), yang pada packaged membaca `version` dari `resources\app.asar` `package.json` = **0.1.1**.
- Bukti statis: asar package.json version 0.1.1 (§4) + wiring `app:info` → `app.getVersion()` terkonfirmasi.
- **Rekomendasi:** konfirmasi visual tunggal oleh PO pada halaman Pengaturan → blok Tentang.

---

## 11. Keamanan Data

- DB live `%APPDATA%\aplibrary\database\aplibrary.db` **TIDAK pernah dibuka oleh pengujian** — seluruh uji runtime memakai `--user-data-dir` (redirection terverifikasi). mtime tetap `08/11/2026 09:28:28` sebelum & sesudah uji; hash SHA-256 sama.
- Backup read-only disimpan di `C:\Users\hp\AppData\Local\Temp\opencode\bam-userdata-backup\aplibrary.db`.
- Tidak ada perubahan schema/migration/DB, tidak ada seed/reset, tidak ada logika startup destruktif.

---

## 12. Keterbatasan & Catatan Teknis

1. **4 match "APLibrary" di bundle main** = Prisma DMMF `@default("APLibrary")` ter-generate (metadata Setting, tidak user-visible). Dibiarkan; TIDAK ada "APLibrary" di renderer/preload.
2. **`signAndEditExecutable: false`** → metadata exe & ikon di-embed manual via hook `afterPack` (rcedit). Ini adalah solusi tetap untuk env tanpa Developer Mode/admin (winCodeSign cache gagal ekstrak symlink). Tanpa sertifikat, penandatanganan tidak mungkin dan memang dilewati.
3. **Konfirmasi visual PO disarankan:** hasil cetak / dialog printer / halaman About / tampilan maximized memerlukan mata manusia; otomatisasi membuktikan state & konten, bukan piksel.
4. **Artifak lama `dist\APLibrary Setup 0.1.0.exe`** masih tersisa di `dist\` (sengaja dibiarkan, bukan bagian WO ini).
5. **Dua pitfall teknik yang terekam** (agar tidak terulang): (a) `afterPack` memakai `context.packager.appInfo` (bukan `appInfo`) dan `spawnSync` args TANPA tanda kutip ter-embed; (b) PowerShell 5.1 tidak mendukung operator ternary `? :`.
6. **`borrow_card_uat_smoke`** memiliki kegagalan pre-existing (17 PASS / 14 FAIL) yang terbukti TIDAK terkait WO ini — ditindaklanjuti di WO terpisah (tech debt).
7. Fitur committed lain (Member Photo, Book Cover, Borrowing Rights, Student placement, dsb.) TIDAK disentuh.

---

## 13. Status

- **FINAL VERDICT: BAM RELEASE PREPARATION READY FOR UAT.**
- Seluruh gate source, build, artifact, smoke (73/73 + 59/59), instalasi bersih, upgrade preservasi, maximize, dan identitas BAM LULUS.
- **TIDAK ada commit/push** pada WO ini (menunggu review PO). `git status --short` akhir menampilkan perubahan working tree (§13 catatan di bawah).
- Berikutnya (atas keputusan PO): instalasi `BAM Setup 0.1.1.exe` pada mesin bersih + mesin yang memiliki data 0.1.0, konfirmasi visual window maximized, About (BAM 0.1.1), lalu rilis.

Perubahan working tree saat laporan ditulis:
```
 M electron-builder.yml
 M electron/main/index.ts
 M electron/main/repositories/setting.repository.ts
 M package-lock.json
 M package.json
 M src/components/layout/TopBar.tsx
 M src/main/infrastructure/backup/backup.service.ts
 M src/pages/SettingsPage.tsx
 M src/renderer/index.html
 M src/utils/app.ts
 M src/utils/labels.ts
 M wo4_backup_smoke/smoke.ts
 M wo6_backup_restore_ui_smoke/smoke.ts
?? resources/
?? scripts/after-pack.cjs
?? scripts/generate-bam-icon.cjs
```
