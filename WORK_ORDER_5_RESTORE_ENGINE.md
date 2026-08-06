# WORK ORDER 5 — RESTORE ENGINE

**Status:** DONE — READY review PO (belum lanjut WO berikutnya)
**Source of Truth:** ADR_001_DATA_PROTECTION_FINAL_DECISIONS.md (FINAL APPROVED, SSOT) + RFC_002_BACKUP_FILE_FORMAT.md + RFC_003_BACKUP_ENGINE_ARCHITECTURE.md + RFC_004_RESTORE_ENGINE_ARCHITECTURE.md
**Date:** 2026-08-06

---

## Objective

Membangun **Restore Engine** — kebalikan dari Backup Engine (WO-4): mengembalikan database live dari wadah `.apbackup` dengan jalur **aman dan dapat di-rollback**. Sesuai RFC-004 §3–§5 dan ADR-001 §6/§7/§9:

1. **Pipeline restore SATU sesi** — intake → gate awal → extract → stage+verify → schema gate → snapshot aman → swap → post-verify → rollback otomatis → cleanup, diorkestrasi oleh satu `RestoreService`.
2. **Swap sebagai satu-satunya titik tulis live** — penulisan DB live hanya boleh terjadi di fase swap oleh `DatabaseRestoreHandler` (invarian ADR-001 §3.3/§7; kontrak `RestoreHandler` WO-3).
3. **Snapshot aman (WAJIB)** — `VACUUM INTO` dari live SEBELUM swap sebagai jaringan pengaman; rollback otomatis bila swap/post-verify gagal; snapshot dipertahankan untuk audit/recovery manual.
4. **Schema gate dua arah** — backup lebih baru → ditolak (forward protect, tanpa downgrade); backup lebih lama → ditolak (Align/migrasi-on-restore belum didukung v1); unknown → ditolak (jalur aman).
5. **Single-flight** — satu restore aktif per engine.
6. **Wiring ke Container bootstrap** (injectable untuk uji) — tanpa UI, tanpa IPC.

---

## Scope

### Di luar scope (WAJIB tidak disentuh)
- UI Backup & Restore / IPC / preload / env.d.ts / renderer — WO-6 (TIDAK dibuka, keputusan PO)
- RestoreHandler untuk jenis data lain (asset/configuration/log) — belum ada provider-nya
- Align / migrasi-on-restore (menjalankan migration Prisma saat restore) — belum didukung v1
- Relokasi DB live ke `userData` (ADR-001 §8.2 Q2–Q5) — WO masa depan
- Scheduler / Encryption / Backup Engine (WO-4) / Manifest / Provider / Path domain (WO-1/WO-2/WO-3)
- Schema / migration Prisma / database dev (tidak ada perubahan DB)

### Keputusan PO yang mengikat (dari ADR-001 / RFC-004)
- **K1** — Engine = satu orkestrator yang memimpin pipeline; handler hanya eksekusi per-entri.
- **K2** — Gate awal gagal → STOP, live TIDAK tersentuh.
- **K3** — Snapshot aman dibuat WAJIB SEBELUM swap; gagal → restore ditolak.
- **K4** — `swapToLive` = SATU-SATUNYA titik tulis live (hanya dipanggil Swapper / RestoreService).
- **K5** — Schema backup lebih BARU → ditolak (tanpa downgrade); lebih LAMA → ditolak (Align belum didukung).
- **K6** — Gagal swap / verifikasi pasca → ROLLBACK OTOMATIS ke snapshot.
- **K7** — Single-flight: satu sesi restore aktif (`RST-<uuid8>`); run lain ditolak `RestoreDomainError`.

---

## Implementation

### Lokasi
```
src/main/domain/restore/
├── domain-error.ts       — RestoreDomainError (error domain murni)
└── restore-status.ts     — RESTORE_STATUS {SUCCESS, FAILED, CANCELLED} + isRestoreStatus

src/main/infrastructure/restore/
├── schema-compare.ts      — compareSchemaVersions (murni)
├── fs-utils.ts            — resolveWithin / moveFilePreserving / removeSideFiles
├── database-restore.handler.ts  — DatabaseRestoreHandler + SafeSnapshotCapable
└── restore.service.ts     — createRestoreDirs + RestoreService (orkestrator)

src/main/infrastructure/
└── database-path.ts       — resolveLiveDatabaseFile (murni)
```

Seluruh modul domain **murni** — nol import di luar folder `src/main/domain/restore/`. Komponen infra menyentuh filesystem/zip/sqlite; hasilnya objek domain murni. `DatabaseRestoreHandler` memakai `getPrisma()` dari `src/main/repositories/base/prisma.ts` (pola existing).

### Desain tiap komponen

| Komponen | Isi | Validasi |
|---|---|---|
| **RestoreStatus** | `SUCCESS` / `FAILED` / `CANCELLED` | `isRestoreStatus` |
| **compareSchemaVersions** | `(backup, current) → 'same'\|'older'\|'newer'\|'unknown'`; `equals` di cek duluan; keduanya wajib pola `^\d{8,}_` (timestamp migration) selainnya `unknown`; selisih string → older/newer | murni, headless |
| **fs-utils** | `resolveWithin` (anti-traversal — target harus di dalam baseDir); `moveFilePreserving` (rename + fallback copy/unlink lintas volume); `removeSideFiles` (hapus `-wal`/`-shm` best-effort) | murni, headless |
| **DatabaseRestoreHandler** | implements `RestoreHandler` + `SafeSnapshotCapable`; `id=database@1.0.0`, `kind=DATABASE`, `requirement=required`. `stage()` salin DB extract → staging handler; `verifyStaged()` = ukuran + sha256 vs entri manifest + `PRAGMA integrity_check` (PrismaClient point-ke-staging); `captureSafeSnapshot()` = `VACUUM INTO '<snapshotDir>/aplibrary.db'` via `getPrisma()` live; `swapToLive()` = disconnect → `removeSideFiles` → arsip live lama → move staging → reconnect (best-effort pulih live dari arsip bila gagal; `finally` reconnect); `restoreFromSafeSnapshot()` = pulihkan live dari snapshot; `cleanup()` = hapus staging | DB-backed |
| **RestoreService** | `RestoreService({verifier, schemaVersionReader, handlerRegistry, paths, liveDatabaseFile})`; `run({backupFilePath, isCancelled?})` → `RestoreRunResult {status, sessionId, startedAt, finishedAt, sourcePath, schemaVersionBefore, schemaVersionRestored, files, totalBytes, warnings, errors, needsRestart, rollbackPath}`; pipeline penuh | DB-backed |
| **resolveLiveDatabaseFile** | parse URL `file:` (absolut Windows/POSIX/relatif vs schemaDir/cwd; normalisasi backslash); non-`file:` → fallback path apa adanya; DB belum direlokasi ke userData | murni, headless |

### Pipeline `RestoreService.run` (RFC-004 §4/§5)
1. **Single-flight guard** — `_activeSessionId !== null` → `RestoreDomainError` ("restore lain sedang berjalan").
2. **Sesi** — `RST-<uuid8>`; reset `temp/restore`; cancel-check.
3. **Intake** — copy sumber backup ke `intake/` (lokal aman); file hilang → FAILED.
4. **Gate awal** — `BackupVerifier.verify` (WO-4): wadah + manifest + `manifestSha256` + per-entri size/sha256 + `PRAGMA integrity_check`; `backupVersion > 1` → ditolak; tepat satu entri `DATABASE` wajib.
5. **Extract** — per entri manifest via `resolveWithin` (anti-traversal).
6. **Stage + verify per entri** — handler `matches` tepat 1; `stage()`; `verifyStaged()`.
7. **Schema gate** — baca schema live (`SchemaVersionReader`, WO-4) → `compareSchemaVersions`; `newer` → "downgrade skema tidak didukung"; `older` → "migrasi-on-restore (Align) belum didukung v1"; `unknown` → "kompatibilitas skema tidak dapat ditentukan"; semua → FAILED tanpa menyentuh live.
8. **Snapshot aman (WAJIB)** — per handler `SafeSnapshotCapable` → `captureSafeSnapshot()`; required tanpa capability → ditolak; gagal → FAILED.
9. **Swap** — `handler.swapToLive(entry)`; gagal → `rollbackAll` (restoreFromSafeSnapshot) → FAILED.
10. **Post-verify** — `PrismaClient` point-ke-live: `PRAGMA integrity_check` + `_prisma_migrations` terakhir == schema backup; gagal → `rollbackAll` → FAILED.
11. **SUCCESS** — `needsRestart=true`; `finally`: cleanup handler + snapshot dipertahankan ke `temp/restore-snapshots/<sessionId>.db` (copy rollbackPath) + hapus rootDir restore + reset `_activeSessionId`.

### Wiring (Dimodifikasi 2 file)
- `electron/main/bootstrap.ts` — Container +`restoreHandlerRegistry`/`databaseRestoreHandler`/`restoreService`; `createContainer(paths, restoreWiring?)` menerima wiring opsional injectable (`liveDatabaseFile` + `disconnectLiveClients`/`reconnectLiveClients`); default disconnect/reconnect = `disconnectPrisma()+closeDatabase()` / `connectPrisma()+initDatabase()`; `restoreHandlerRegistry.register(databaseRestoreHandler)`.
- `electron/main/index.ts` — wiring nyata `createContainer(infra.paths, {...})`: `liveDatabaseFile` dari `resolveLiveDatabaseFile(DATABASE_URL, path.join(app.getAppPath(),'prisma'))`.

---

## Validation

| Gate | Hasil |
|---|---|
| `npm run lint` (tsc node + web) | PASS |
| `npm run build` | PASS (main chunk **2,036.59 kB** — +19.77 dari WO-4 2,016.82; preload **9.95 kB identik**; renderer **1,147.66 kB identik** baseline) |
| Smoke `wo5_restore_smoke/smoke.ts` | **103/103 PASS** (fresh DB temp + `prisma migrate deploy` 4 migration) |
| `prisma migrate diff` | "This is an empty migration." (schema tidak disentuh) |
| Grep bundle `out/main/index.js` | `RestoreService`=True, `DatabaseRestoreHandler`=True, `resolveLiveDatabaseFile`=True, `compareSchemaVersions`=True (ter-wire); channel `restores:*` di renderer = 0 (belum ada IPC/UI) |

### Cakupan smoke (103 assertions)
- **Pure (tanpa DB):**
  - `compareSchemaVersions` (10) — same identik/trim, older, newer, unknown×4 (tanpa timestamp, non-timestamp), older-vs-older.
  - `createRestoreDirs` (6) — rootDir `temp/restore` + 5 subdir unik di bawahnya (intake/extract/stage/archive/snapshot).
  - `resolveLiveDatabaseFile` (8) — absolut Win/POSIX, relatif+schemaDir, relatif tanpa schemaDir→cwd, non-`file:` fallback, backslash normalize, empty→cwd.
  - `fs-utils` (8) — `resolveWithin` dalam/`.`/`../` melarikan diri throw `di luar area staging`/absolut throw; `moveFilePreserving` target tertulis + sumber hilang; `removeSideFiles` `-wal`/`-shm` dihapus + db utama utuh.
  - liveDatabaseFile resolve + file ada; `isSafeSnapshotCapable`; handler terdaftar di `RestoreHandlerRegistry`.
- **DB-backed:**
  - **Round-trip** — probe `smoke_probe` marker A di live → `BackupService.run` (WO-4) SUCCESS → `RestoreService.run` SUCCESS (sessionId `RST-`, schemaVersionBefore/Restored === `20260803_wo2_f2a_master_data_akademik`, files 1, totalBytes>0, needsRestart, tanpa error/warning, rollbackPath diisi, snapshot retained non-kosong, live tetap A + integrity ok).
  - **Swap bukti file diganti** — tambah B ke live → backup2 (A+B) → restore isi A → live kembali hanya A, B hilang (file benar-benar diganti, bukan di-merge).
  - **Idempoten** — restore ulang SUCCESS, live tetap A.
  - **Gate awal (live tidak tersentuh)** — file hilang → FAILED `tidak ditemukan`; bukan zip → FAILED `zip`; DB dalam wadah di-tamper → FAILED `sha256`; ketiganya: live tetap A tanpa B.
  - **Schema gate** — lebih baru → FAILED `downgrade` + schemaBefore/Restored terisi; lebih lama → FAILED `Align`; unknown → FAILED `kompatibilitas`; ketiganya: live tetap A.
  - **backupVersion 2** (wadah custom) → FAILED `tidak didukung`.
  - **CANCELLED** — `isCancelled: () => true` → status CANCELLED tanpa error/rollback, live tetap A.
  - **Single-flight** — handler `GatedRestoreHandler` (override `stage()` block) → run kedua ditolak `RestoreDomainError` "sedang berjalan"; run pertama SUCCESS; live tetap A; snapshot sesi dipertahankan.

---

## Decision

| # | Keputusan | Alasan |
|---|---|---|
| D1 | **Pipeline dipimpin Service; handler hanya eksekusi per-entri** | RFC-004 §4/§5 — orkestrasi terpusat (gate, urutan, rollback) di `RestoreService`; `DatabaseRestoreHandler` menerima perintah tiap fase dan menyentuh filesystem/sqlite. `isSafeSnapshotCapable` membedakan handler yang bisa snapshot (database) dari yang belum. |
| D2 | **Snapshot aman (VACUUM INTO) = jaringan pengaman WAJIB** | ADR-001 §7 prinsip 5 — dibuat dari live SEBELUM swap; gagal → restore ditolak; sukses → dipertahankan (`temp/restore-snapshots/<sessionId>.db`) untuk audit/recovery manual; rollback otomatis (`restoreFromSafeSnapshot`) bila swap/post-verify gagal. |
| D3 | **Schema gate dua arah** | ADR-001 §6/§9 — backup lebih BARU → ditolak (forward protect, tanpa downgrade); lebih LAMA → ditolak (Align belum didukung v1); unknown → ditolak (jalur aman). `SchemaVersionReader` (WO-4) dibaca saat restore; `compareSchemaVersions` murni diuji headless. |
| D4 | **swapToLive = SATU-SATUNYA titik tulis live** | Invarian ADR-001 §3.3/§7, kontrak WO-3 — disconnect client → `removeSideFiles` (-wal/-shm) → arsip live lama → move staging → reconnect; `finally` reconnect menjamin client tidak tertinggal disconnect walau gagal. |
| D5 | **Wiring disconnect/reconnect = injectable (`RestoreWiring`)** | `createContainer(paths, restoreWiring?)` memungkinkan smoke memakai handler produksi yang sama; default produksi `disconnectPrisma()+closeDatabase()` / `connectPrisma()+initDatabase()`. |
| D6 | **Post-verify memakai `PrismaClient` point-ke-live** | `datasources.db.url = 'file:'+live.replace(/\\/g,'/')`, bukan `getPrisma()` singleton (yang sudah di-disconnect saat swap) — PRAGMA integrity_check + `_prisma_migrations` terakhir == schema backup. |
| D7 | **`resolveLiveDatabaseFile` murni di file terpisah** | Live DB belum direlokasi (ADR-001 §8.2 Q2–Q5) sehingga file live di-resolve dari `DATABASE_URL`; murni → headless-testable; wiring sudah siap saat relokasi terjadi. |
| D8 | **Smoke memakai `BackupService` + `BackupVerifier` (WO-4) ASLI** | Round-trip Backup→Restore membuktikan pasangan penuh dua engine, bukan fixture dummy; gate awal `verifier.verify` diuji dua arah (WO-4 validasi pembuatan, WO-5 gate pembacaan). |

---

## Next

- **BERHENTI — menunggu review Product Owner.** WO-6 (UI Backup & Restore) **TIDAK dibuka** sesuai keputusan PO.
- **Commit:** `b5df2e6` (WO-5 fitur + smoke + laporan + AGENTS.md; WO-3/WO-4 entri AGENTS.md yang tertunda ikut dilengkapi), sudah di-push ke `origin/main`.
