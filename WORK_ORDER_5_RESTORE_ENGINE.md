# WORK ORDER 5 — Restore Engine (COMPLETE - READY review PO)

## Ringkasan
- Source of Truth: `ADR_001_DATA_PROTECTION_FINAL_DECISIONS.md` (FINAL APPROVED, SSOT) + `RFC_002_BACKUP_FILE_FORMAT.md` + `RFC_003_BACKUP_ENGINE_ARCHITECTURE.md` + `RFC_004_RESTORE_ENGINE_ARCHITECTURE.md`.
- Scope: **Restore Engine lengkap** — orkestrator `RestoreService` + `DatabaseRestoreHandler` (sisi kebalikan `DatabaseProvider`) + util filesystem murni + `SchemaVersionReader` reuse (WO-4) + `BackupVerifier` reuse (gate awal, WO-4) + domain restore (`RestoreStatus`, `RestoreDomainError`) + `RestoreHandlerRegistry` (kontrak WO-3) + wiring penuh ke Container bootstrap. **TANPA** UI, IPC/preload/env.d.ts, RestoreHandler lain (asset/log), Scheduler, Encryption, Align/migrasi-on-restore, dan DB live TIDAK direlokasi ke userData (ADR-001 §8.2 Q2–Q5 = WO masa depan).
- Keputusan arsitektur yang dipegang (ADR-001 §6/§7/§9 + RFC-004 §3/§4/§5): SATU run restore = SATU sesi `RST-<uuid8>`; single-flight per engine; gate awal gagal → STOP tanpa menyentuh live; snapshot aman (VACUUM INTO) WAJIB sebelum swap; swap = SATU-SATUNYA titik tulis live (disconnect → arsip live lama → salin staging → reconnect); schema backup lebih BARU → ditolak (forward protect, tanpa downgrade); schema backup lebih LAMA → ditolak (migrasi-on-restore / Align belum didukung v1); gagal swap/post-verify → ROLLBACK OTOMATIS ke snapshot; sukses → snapshot dipertahankan di `temp/restore-snapshots/<sessionId>.db` (retensi untuk audit/recovery manual); seluruh artefak sesi dibersihkan via try/finally.

## File Baru (7 + 1 file tunggal)
### Domain (murni, `src/main/domain/restore/`)
| File | Isi |
|------|-----|
| `restore-status.ts` | `RESTORE_STATUS` = `SUCCESS` / `FAILED` / `CANCELLED` + `isRestoreStatus` (config leaf, pola backup-status) |
| `domain-error.ts` | `RestoreDomainError extends Error` |

### Infra (`src/main/infrastructure/restore/`)
| File | Isi |
|------|-----|
| `schema-compare.ts` | `compareSchemaVersions(backup, current)` murni → `'same' \| 'older' \| 'newer' \| 'unknown'`. `equals` di cek duluan (same); kedua nama wajib pola `^\d{8,}_` (timestamp migration) → selainnya `unknown` (jalur aman); selisih string → older/newer. |
| `fs-utils.ts` | `resolveWithin(baseDir, relativePath)` — guard path hasil extract agar tidak keluar area staging (pertahanan kedua setelah `isRelativeManifestPath`); `moveFilePreserving(source, target)` — rename dgn fallback copy+unlink (lintas volume); `removeSideFiles(databaseFile)` — hapus `-wal`/`-shm` best-effort. |
| `database-restore.handler.ts` | `DatabaseRestoreHandler` implements `RestoreHandler` + `SafeSnapshotCapable` (`isSafeSnapshotCapable` type guard). `id = ProviderId.of({name:'database', version:'1.0.0'})`, `kind=DATABASE`, `requirement='required'`. `stage()` salin DB extract → staging handler; `verifyStaged()` = ukuran + sha256 vs entri manifest + `PRAGMA integrity_check` pada staging (via `PrismaClient` point-ke-staging); `captureSafeSnapshot()` = `VACUUM INTO '<snapshotDir>/aplibrary.db'` via `getPrisma()` live (WAJIB, ADR-001 §7 prinsip 5); `swapToLive()` = **satu-satunya titik tulis live** — disconnect client → `removeSideFiles` → arsip live lama ke archiveDir (move) → move staging → live; gagal tengah → best-effort pulihkan live dari arsip; `finally` reconnect; `restoreFromSafeSnapshot()` = pulihkan live dari snapshot (jaringan pengaman); `cleanup()` = hapus staging handler. |
| `restore.service.ts` | **Orkestrator**. `createRestoreDirs(tempDir)` → `RestoreDirs` (root `temp/restore` + intake/extract/stage/archive/snapshot). `RestoreService({verifier, schemaVersionReader, handlerRegistry, paths, liveDatabaseFile})`. `run({backupFilePath, isCancelled?})` → `RestoreRunResult {status, sessionId, startedAt, finishedAt, sourcePath, schemaVersionBefore, schemaVersionRestored, files, totalBytes, warnings, errors, needsRestart, rollbackPath}`. Pipeline RFC-004 §4/§5: single-flight guard → sesi `RST-<uuid8>` → reset `temp/restore` → cancel-check → intake (copy sumber ke staging lokal) → **gate awal** (verifier.verify = wadah+manifest+checksum+integritas; backupVersion > 1 → ditolak; tepat satu entri DATABASE) → cancel-check → extract (per entri via `resolveWithin`, anti-traversal) → stage+verify per entri (handler `matches` tepat 1; stage; verifyStaged) → cancel-check → **schema gate** (read schema live via `SchemaVersionReader`; `compareSchemaVersions` — newer → "downgrade skema tidak didukung", older → "migrasi-on-restore (Align) belum didukung v1", unknown → "kompatibilitas skema tidak dapat ditentukan") → **snapshot aman WAJIB** per handler (SafeSnapshotCapable → `captureSafeSnapshot`; required tanpa capability → ditolak) → **swap** (handler.swapToLive; gagal → rollbackAll) → **post-verify** (`PRAGMA integrity_check` + `_prisma_migrations` terakhir == schema backup, via `PrismaClient` point-ke-live; gagal → rollbackAll) → SUCCESS (`needsRestart=true`) → `finally`: cleanup handler + simpan snapshot ke `temp/restore-snapshots/<sessionId>.db` (copy rollbackPath) + hapus rootDir restore; `_activeSessionId` di-reset. `verifyLiveAfterSwap` murni helper. |

### Tunggal (`src/main/infrastructure/`)
| File | Isi |
|------|-----|
| `database-path.ts` | `resolveLiveDatabaseFile(databaseUrl, schemaDir?)` murni — parse URL `file:` (absolut Windows/POSIX/relatif vs schemaDir/cwd; normalisasi backslash), non-`file:` → fallback path apa adanya. Live DB belum direlokasi (ADR-001 §8.2 Q2–Q5) sehingga file live di-resolve dari `DATABASE_URL`. |

## Dimodifikasi (2)
- `electron/main/bootstrap.ts` — Container menambah `restoreHandlerRegistry`, `databaseRestoreHandler`, `restoreService`. `createContainer(paths, restoreWiring?)` menerima wiring opsional (untuk uji injectable): `RestoreService` dibangun dari `BackupVerifier({tempDir})` (reuse WO-4), `SchemaVersionReader` (reuse), `handlerRegistry` (kontrak WO-3), `paths`, `liveDatabaseFile` (dari `restoreWiring?.liveDatabaseFile ?? resolveLiveDatabaseFile(DATABASE_URL, paths.root)`). `DatabaseRestoreHandler` dibangun dari `createRestoreDirs(paths.tempDir)` + wiring disconnect/reconnect (default `disconnectPrisma()+closeDatabase()` / `connectPrisma()+initDatabase()`). `restoreHandlerRegistry.register(databaseRestoreHandler)`.
- `electron/main/index.ts` — `createContainer(infra.paths, {...})` mengirim wiring nyata: `liveDatabaseFile` dari `resolveLiveDatabaseFile(DATABASE_URL, path.join(app.getAppPath(),'prisma'))`, disconnect/reconnect menggunakan `disconnectPrisma()/closeDatabase()` dan `connectPrisma()/initDatabase()` (import baru dari `repositories/base/prisma` dan `./database`).

## TIDAK Diubah
Schema/migration (`prisma migrate diff` = "This is an empty migration."), DB dev, IPC/preload/env.d.ts/renderer/UI (belum ada channel restore — WO-6 UI), RestoreHandler lain (asset/log — belum ada provider), Align/migrasi-on-restore, Scheduler, Encryption, manifest/provider/path domain (WO-1/WO-2/WO-3), Backup Engine (WO-4).

## Validation PASS
1. `npm run lint` (tsc node+web) — PASS.
2. `npm run build` (electron-vite; main chunk **2,036.59 kB** — +19.77 dari WO-4 2,016.82; preload **9.95 kB identik**; renderer **1,147.66 kB identik** baseline) — PASS.
3. Smoke `wo5_restore_smoke/smoke.ts` — **103/103 PASS** (fresh DB temp `file:C:/...` + `prisma migrate deploy` 4 migration; dihapus setelah run):
   - **Pure (tanpa DB):** `compareSchemaVersions` 10 (same trim/identik, older, newer, unknown×4, non-timestamp, older-vs-older); `createRestoreDirs` 6 (rootDir `temp/restore` + 5 subdir unik di bawahnya); `resolveLiveDatabaseFile` 8 (absolut Win/POSIX, relatif+schemaDir, relatif tanpa schemaDir→cwd, non-file fallback, backslash normalize, empty→cwd); `fs-utils` 8 (`resolveWithin` dalam/`.`/melarikan diri throw `di luar area staging`/absolut throw; `moveFilePreserving` target tertulis + sumber hilang; `removeSideFiles` `-wal`/`-shm` dihapus + db utama utuh); `liveDatabaseFile` resolve + file ada; `isSafeSnapshotCapable` + `RestoreHandlerRegistry.register` terdaftar.
   - **DB-backed round-trip:** probe `smoke_probe` marker A di live → `BackupService.run` (WO-4) SUCCESS (filePath ada) → `RestoreService.run` SUCCESS (sessionId `RST-`, schemaVersionBefore/Restored === `20260803_wo2_f2a_master_data_akademik`, files 1, totalBytes>0, needsRestart, tanpa error/warning, rollbackPath diisi, snapshot dipertahankan di `temp/restore-snapshots/<sessionId>.db` non-kosong, live tetap A + integrity ok).
   - **Swap bukti file diganti:** tambah B ke live → backup2 (A+B) → restore isi A → live kembali hanya A, B hilang (file benar-benar diganti, bukan di-merge).
   - **Idempoten:** restore ulang SUCCESS, live tetap A.
   - **Gate awal (live tidak tersentuh):** file backup hilang → FAILED `tidak ditemukan`; file bukan zip → FAILED `zip`; DB dalam wadah di-tamper → FAILED `sha256`; semua kasus: live tetap A tanpa B.
   - **Schema gate:** backup schema lebih baru (timestamp artifisial) → FAILED `downgrade` + schemaBefore/Restored terisi; lebih lama → FAILED `Align`; unknown → FAILED `kompatibilitas`; semua: live tetap A.
   - **backupVersion 2** (wadah custom via helper `buildArchiveWithMeta`) → FAILED `tidak didukung`.
   - **CANCELLED:** `isCancelled: () => true` → status CANCELLED tanpa error/rollback, live tetap A.
   - **Single-flight:** handler `GatedRestoreHandler` (override `stage()` block) → run kedua ditolak `RestoreDomainError` "sedang berjalan" (`restore lain sedang berjalan`), run pertama tetap SUCCESS, live tetap A, snapshot sesi dipertahankan.
4. `prisma migrate diff` = "This is an empty migration." (schema tidak disentuh).
5. Grep bundle main: `RestoreService`/`DatabaseRestoreHandler`/`resolveLiveDatabaseFile`/`compareSchemaVersions` **ter-render** (ter-wire di bootstrap). Channel `restores:*` = 0 (belum ada IPC — WO-6 UI).

## Arsitektur
- **Engine tidak tahu UI/IPC** — `RestoreService` hanya service + DTO hasil; pemanggilan lewat wiring infra nanti (WO-6 UI).
- **Pipeline dipimpin Service; handler hanya eksekusi per-entri** — `RestoreService` mengorkestrasi intake→gate→extract→stage→schema→snapshot→swap→post-verify→rollback→cleanup; `DatabaseRestoreHandler` menerima perintah tiap fase dan menyentuh filesystem/sqlite. `isSafeSnapshotCapable` membedakan handler yang bisa snapshot (database) dari yang belum.
- **Infra boleh filesystem; domain murni** — komponen infra (`src/main/infrastructure/restore/`) menyentuh fs/zip/sqlite; hasilnya objek domain murni (`RestoreRunResult`, `RestoreStatus`); `schema-compare.ts` murni tanpa IO (diuji headless).
- **Snapshot aman (VACUUM INTO) = jaringan pengaman wajib** — dibuat dari live via `getPrisma()` SEBELUM swap; gagal → restore ditolak; sukses → snapshot dipertahankan (`temp/restore-snapshots/<sessionId>.db`) untuk audit/recovery manual; rollback otomatis (restoreFromSafeSnapshot) dipakai bila swap/post-verify gagal.
- **Wiring disconnect/reconnect = injectable** — `RestoreWiring {liveDatabaseFile, disconnectLiveClients, reconnectLiveClients}` memungkinkan uji injeksi handler yang sama yang dipakai produksi; default produksi memutus/menyambung `disconnectPrisma()+closeDatabase()` dan `connectPrisma()+initDatabase()`.

## Catatan
- Smoke WO-5 memakai `BackupService` (WO-4) asli untuk membuat wadah `.apbackup` dari DB probe + `BackupVerifier` asli untuk gate awal — membuktikan Restore berpasangan penuh dengan Backup engine yang sama (round-trip), bukan fixture dummy.
- `adm-zip` (WO-4) dipakai `RestoreService` untuk extract; `BackupVerifier` (WO-4) untuk gate awal — reuse tanpa duplikasi.
- DB live TIDAK dipindahkan ke userData pada WO-5 (ADR-001 §8.2 Q2–Q5 = WO masa depan); `resolveLiveDatabaseFile` membuat wiring sudah siap saat relokasi terjadi.
- WO-5 tidak berhenti di Architecture Gate karena batch data-protection (WO-1..WO-5) dikerjakan beruntun; status sementara **READY review PO**, akan direview bersama setelah WO-5 selesai.
- WO-6 (UI Backup & Restore) sesuai keputusan PO **TIDAK dibuka** pada sesi ini.
