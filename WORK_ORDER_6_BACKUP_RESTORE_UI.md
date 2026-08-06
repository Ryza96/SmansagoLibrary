# WORK ORDER 6 — BACKUP & RESTORE USER INTERFACE

**Status:** DONE — READY review PO (tidak lanjut WO berikutnya)
**Source of Truth:** ADR_001_DATA_PROTECTION_FINAL_DECISIONS.md (FINAL APPROVED, SSOT) + RFC_002_BACKUP_FILE_FORMAT.md + RFC_003_BACKUP_ENGINE_ARCHITECTURE.md + RFC_004_RESTORE_ENGINE_ARCHITECTURE.md + laporan WO-1..WO-5
**Date:** 2026-08-06

---

## Objective

Menyelesaikan **WORK ORDER 6 — Backup & Restore User Interface**: UI **client-only** di atas engine yang sudah APPROVED (Backup Engine WO-4 + Restore Engine WO-5). Renderer TIDAK menurunkan angka/progress/status — seluruh nilai tampilan dibangun oleh **controller layer** (`BackupUIController`/`RestoreUIController`/`BackupInspector`) di `src/main/services/`, lalu lint/build/smoke PASS → commit + push → STOP menunggu review PO.

Dua keputusan desain dikonfirmasi PO:
1. **"Pilih Folder" dibatalkan** — backup page menampilkan **fixed path** (`userData/backup/manual`) + tombol **"Buka Folder"**; engine menulis ke lokasi tetap (ADR-001 §8.2).
2. **Progress = controller-paced INDICATIVE** — stage 1 backup = **preflight ASLI engine** (`BackupService.runPreflight`), stage 2..6 di-paced 350ms selama `engine.run()` berjalan; seluruh 8 stage restore di-paced (restore bersifat atomic — internal engine tidak boleh bocor ke UI).

## Scope

### Di luar scope (WAJIB tidak disentuh)
- BackupService (WO-4), RestoreService (WO-5), Provider, Manifest, DatabaseProvider, Domain, RFC, ADR
- Schema / migration / database dev (tidak ada perubahan DB)
- Scheduler, Encryption, relokasi DB ke userData (ADR-001 §8.2 Q2–Q5)
- RestoreHandler asset/configuration/log (belum ada provider-nya)

### Keputusan PO yang mengikat
- **K1** — Lokasi backup FIXED (`userData/backup/manual`); tanpa picker folder.
- **K2** — Progress indicative (controller-paced); stage 1 backup = preflight ASLI.
- **K3** — Toast WAJIB; **DILARANG** `alert()`/`confirm()`/browser dialog.
- **K4** — Renderer TIDAK menurunkan angka; seluruh nilai (nama file, ukuran, durasi, counts Buku/Anggota/Eksemplar, schema version) dihitung main.

---

## Implementation

### Lokasi
```
src/shared/dto/backup-ui.ts          — kontrak renderer ↔ main (stage 7+8, DTO hasil)
src/main/services/backup-ui.service.ts — controller layer (BackupInspector + BackupUIController + RestoreUIController)
electron/ipc/backup-ui.ipc.ts        — 8 channel IPC + progress push (event.sender.send)
electron/preload/backup-ui.preload.ts — backupUIAPI (backupUI.* + restoreUI.*)
src/pages/backup/BackupPage.tsx      — halaman Backup (UI)
src/pages/restore/RestorePage.tsx    — halaman Restore (UI)
```

### Desain tiap komponen

| Komponen | Isi |
|---|---|
| **`backup-ui.ts` (DTO)** | `BACKUP_UI_STAGES` 7 (validate/collect/manifest/compress/verify/finalize/complete); `RESTORE_UI_STAGES` 8 (validate/extract/verify/snapshot/restore/verify-after/cleanup/complete); `BackupUIProgressEvent`/`RestoreUIProgressEvent {stage,current,total,startedAt}`; `BackupUISummary {status,fileName,filePath,sizeBytes,backupDir,startedAt,finishedAt,durationMs,warnings,errors}`; `BackupFileInfo` (info file .apbackup SEBELUM konfirmasi — manifest + counts); `RestoreUIResult {status,sessionId,schemaVersionBefore/Restored,needsRestart,durationMs,...}`; `BackupTargetInfo`/`OpenFolderResult`/`PickBackupResult` |
| **`BackupInspector`** | Baca `.apbackup` UNTUK UI: `BackupVerifier.verify` (rantai 7 cek engine) → manifest (backupDate ISO, appVersion, schemaVersion, backupVersion) → extract DB dari wadah ke temp → `new PrismaClient({datasources:{db:{url}}})` → count `book`/`member`/`bookCopy` → cleanup temp. **Read-only**: tidak pernah menyentuh DB live. Counts TIDAK ada di manifest (ADR-001 §8.2 Q5 open) → dihitung di sini. |
| **`BackupUIController`** | `getTargetInfo()` → `{backupDir, sampleFilename (buildBackupFilename), extension}`. `run()` → emit validate/1 → **preflight ASLI** (`backupService.runPreflight`; gagal → FAILED) → race pacing 350ms × [collect,manifest,compress,verify,finalize] vs `engine.run()` → SUCCESS → emit complete/7; summary dibangun main. |
| **`RestoreUIController`** | `run()` → emit validate/1 → race pacing 350ms × [extract,verify,snapshot,restore,verify-after,cleanup,complete] vs `restoreService.run()` → SUCCESS → emit complete/8; hasil schemaVersionBefore/Restored/needsRestart/durationMs dari engine. |
| **`backup-ui.ipc.ts`** | channel `backupUI:getTargetInfo`/`openFolder` (via `shell.openPath`)/`run`/`progress` (push via `event.sender.send`) + `restoreUI:pickBackup` (dialog openFile filter `.apbackup` label "Backup Aplikasi Perpustakaan")/`inspect`/`run`/`progress`. |
| **`backup-ui.preload.ts`** | `backupUI.*` + `restoreUI.*`; `onProgress` subscribe/unsubscribe pola member (kembalikan `() => void`). |
| **`BackupPage.tsx`** | `getTargetInfo()` → fixed `backupDir` + `sampleFilename`; tombol **Buka Folder** (`openFolder()` → toast error bila `ok===false`); tombol **Mulai Backup** → `run()` + subscribe progress → progress bar 7 stage (`current/total` + label) → card ringkasan sukses/warning/gagal (nama file, ukuran MB/KB/B, lokasi, durasi detik) + daftar warnings/errors; unsubscribe pada unmount & after run. |
| **`RestorePage.tsx`** | tombol **Pilih File Backup** (dialog OS) → `inspect(filePath)` → info card: Nama File, Ukuran, Tanggal Backup (id-ID), App Version, Schema Version, Backup Version, Jumlah Buku/Anggota/Eksemplar + banner invalid bila `ok===false`; banner peringatan "DB saat ini akan diganti isi backup" + tombol **Restore** → `confirm()` danger (NS-1 ConfirmDialog, promise) → `run()` + progress 8 stage → hasil sukses (schemaVersionBefore → schemaVersionRestored, durasi, needsRestart) / gagal; toast via `useNotification`. |

### Wiring (Dimodifikasi 7 file)
- `electron/main/bootstrap.ts` — Container +`backupUIController`/`restoreUIController`/`backupInspector` (dibangun setelah `restoreService`); masuk interface `Services`.
- `electron/ipc/index.ts` — `registerBackupUIHandlers({backupUIController, restoreUIController, backupInspector})` setelah `registerReportHandlers`.
- `electron/preload/index.ts` — spread `...backupUIAPI`.
- `src/renderer/env.d.ts` — blok `backupUI` + `restoreUI` (tipe via `import('../../src/shared/dto/backup-ui')`).
- `src/utils/navigation.ts` — `ROUTES.BACKUP='/backup'`, `ROUTES.RESTORE='/restore'`.
- `src/utils/labels.ts` — blok `LABELS.BACKUP_RESTORE` (label UI lengkap).
- `src/routes/index.tsx` — rute `backup` + `restore` (sebelum `settings`).
- `src/components/layout/Sidebar.tsx` — menu "Backup" + "Restore" (ikon `DatabaseBackup`) antara Laporan dan Pengaturan.

### Teknologi notifikasi
- Infra NS-1 (`NotificationProvider` + `useNotification()`) — **zero dependency**; `confirm()` promise danger.
- DILARANG `alert()`/`confirm()` browser — verifikasi grep halaman baru = 0 match (satu-satunya `confirm(` di RestorePage adalah `useNotification().confirm`, diizinkan).

---

## Validation

| Gate | Hasil |
|---|---|
| `npm run lint` (tsc node + web) | PASS |
| `npm run build` | PASS (main `index.js` **2,046.33 kB** · 194 modul; preload **10.99 kB** · 22 modul; renderer `index-BRypEzV8.js` **1,181.23 kB** · 1,950 modul + `index-B4kSjDhW.css` 41.42 kB) |
| Smoke `wo6_backup_restore_ui_smoke/smoke.ts` | **59/59 PASS** (fresh DB temp + `prisma migrate deploy` 4 migration) |
| `prisma migrate diff` | "This is an empty migration." (schema tidak disentuh) |
| Grep bundle main+preload | `backupUI:getTargetInfo`/`openFolder`/`run`/`progress` + `restoreUI:pickBackup`/`inspect`/`run`/`progress` = 1/1 di main & preload |
| Grep bundle renderer | `Mulai Backup`/`Lokasi Penyimpanan`/`Buka Folder`/`Pilih File Backup`/`Restore Data` ter-render; `alert(`/browser `confirm(` di halaman baru = 0 |

### Cakupan smoke (59 assertions)
- **Pure (tanpa DB):**
  - `BACKUP_UI_STAGES` 7 urutan PO (validate…complete); `RESTORE_UI_STAGES` 8 urutan PO (validate…complete); stage pertama `validate`, terakhir `complete`.
- **DB-backed (fresh DB, engine ASLI WO-4/WO-5):**
  - `getTargetInfo` — backupDir === backupManualDir; sampleFilename ber-pola `APLibrary-backup-<YYYYMMDD>-<HHmmss>-<8>.apbackup`; extension `.apbackup`.
  - Seed 2 Book + 3 Member + 4 BookCopy (counts deterministik).
  - **`BackupUIController.run`** — status SUCCESS; fileName `.apbackup`; filePath ada di backupManualDir; sizeBytes > 0; durationMs >= 0; tanpa error; progress: event pertama `validate/1`, `total` 7, current non-menurun, event terakhir `complete/7`.
  - **`BackupInspector.inspect`** (.apbackup nyata) — ok; bookCount=2 / memberCount=3 / copyCount=4; schemaVersion === `20260803_wo2_f2a_master_data_akademik`; backupVersion=1; appVersion=0.1.0; backupDate ISO valid; sizeBytes == stat; tanpa error.
  - **`inspect` file hilang** → ok false + error `tidak dapat dibaca`; **bukan zip** → ok false + errors tidak kosong.
  - **`RestoreUIController.run`** (round-trip Backup→Restore) — status SUCCESS; sessionId `RST-`; schemaVersionBefore/Restored === F2a; needsRestart; durationMs >= 0; tanpa error; progress: pertama `validate/1`, `total` 8, non-menurun, terakhir `complete/8`.
  - **Pasca restore** — books 2 / members 3 / copies 4 tetap (round-trip mengembalikan isi backup); integritas live ok.
  - **Restore file rusak** → FAILED + errors tidak kosong + TIDAK ada event `complete` + event pertama `validate/1`.

---

## Decision

| # | Keputusan | Alasan |
|---|---|---|
| D1 | **Controller layer terpisah dari engine** (`src/main/services/backup-ui.service.ts`) | Dilarang mengubah engine (WO-1..WO-5 APPROVED). Controller HANYA membungkus: memanggil `BackupService`/`RestoreService` apa adanya, membangun nilai tampilan, headless-testable tanpa Electron. |
| D2 | **Progress indicative (controller-paced)** | Keputusan PO: stage 1 backup = preflight ASLI (keputusan nyata engine), sisanya di-paced 350ms; restore atomic → seluruh 8 stage di-paced. Renderer tidak tahu internal engine. |
| D3 | **Counts Buku/Anggota/Eksemplar dihitung `BackupInspector` dari DB di dalam wadah** | Manifest TIDAK memuat counts (ADR-001 §8.2 Q5 open). Inspector read-only: verify engine → extract DB ke temp → PrismaClient point-ke-snapshot → count → cleanup. Tidak pernah menyentuh DB live. |
| D4 | **Lokasi backup FIXED + "Buka Folder"** | Keputusan PO #1 — engine menulis ke `userData/backup/manual`; `getTargetInfo` menampilkan path + contoh nama file; `openFolder` membuka folder via `shell.openPath` (bukan picker tujuan). |
| D5 | **Toast + ConfirmDialog (NS-1), zero `alert()`/`confirm()`** | Mandat PO — seluruh feedback via `useNotification()`; konfirmasi restore berbahaya memakai `confirm()` promise danger; verifikasi grep halaman baru. |
| D6 | **Renderer TIDAK menurunkan angka** | Konsisten WO-2/P-4/Dashboard/Report — formatSize/formatDuration/formatDate hanyalah format tampilan; ukuran byte/durasi ms/status/version datang dari DTO main. |
| D7 | **Progress di-subscribe hanya selama run** | `onProgress` subscribe/unsubscribe pola member; cleanup pada unmount (`unsubscribeRef`) mencegah leak listener saat navigasi. |
| D8 | **Smoke memakai engine ASLI + wadah nyata** | `BackupUIController.run` → `.apbackup` nyata di disk → `BackupInspector.inspect` membuktikan file yang sama terbaca; `RestoreUIController.run` mengembalikan isi backup (round-trip penuh). Bukan fixture dummy. |

---

## Next

- **BERHENTI — menunggu review Product Owner.**
- Commit + push: fitur WO-6 (controller + IPC + preload + UI + routes + sidebar + labels) + smoke + laporan + update `AGENTS.md`.
- Backlog (WO masa depan, tidak dibuka): relokasi DB ke userData (ADR-001 §8.2 Q2–Q5), scheduler, encryption, handler asset/log, `alert()`/`confirm()` migrasi lanjutan (NS-2+).
