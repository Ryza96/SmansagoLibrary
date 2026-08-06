# WORK ORDER 4 — Backup Engine (COMPLETE - READY review PO)

## Ringkasan
- Source of Truth: `ADR_001_DATA_PROTECTION_FINAL_DECISIONS.md` (FINAL APPROVED, SSOT) + `RFC_002_BACKUP_FILE_FORMAT.md` + `RFC_003_BACKUP_ENGINE_ARCHITECTURE.md` + `RFC_004_RESTORE_ENGINE_ARCHITECTURE.md`.
- Scope: **Backup Engine lengkap** — engine orkestrator `BackupService` + 4 komponen infra (`SchemaVersionReader`, `ManifestBuilder`, `BackupPackager`, `BackupVerifier`) + wiring `BackupService`/`providerStagingDirs` ke Container bootstrap. **TANPA** UI, IPC/preload/env.d.ts, Restore (WO-5), Scheduler, Encryption, Manifest/Provider/Path (WO-1/WO-2/WO-3 sudah selesai).
- Keputusan arsitektur yang dipegang (ADR-001 §4/§6/§9): SATU run backup = SATU sesi; preflight gagal → batalkan SEBELUM menulis; provider WAJIB gagal → FAILED; provider OPSIONAL gagal → dilewati → SUCCESS_WITH_WARNING; pembatalan di titik antar-fase → CANCELLED tanpa file permanen; single-flight per engine; selalu cleanup (provider + staging) via try/finally; output final di `backup/manual`; `.apbackup` = ZIP berisi `manifest.json` + file staging; manifestSha256 dihitung atas payload TANPA checksums.

## File Baru (8)
### Domain (murni, `src/main/domain/backup/`)
| File | Isi |
|------|-----|
| `domain-error.ts` | `BackupDomainError extends Error` |
| `backup-status.ts` | `BACKUP_STATUS` = `SUCCESS` / `SUCCESS_WITH_WARNING` / `FAILED` / `CANCELLED` + `isBackupStatus` |
| `backup-session.ts` | `BackupSessionId` VO (non-kosong ≤128) + `BackupSession.of({id, startedAt})` (Date valid) |

### Infra (`src/main/infrastructure/backup/`)
| File | Isi |
|------|-----|
| `schema-version.reader.ts` | `SchemaVersionReader.read()` → `SchemaVersion` dari **migration terakhir yang applied** (`rolled_back_at IS NULL AND finished_at IS NOT NULL`, ORDER BY `started_at DESC`); tanpa migration → throw `BackupDomainError`. Dipakai meta.schemaVersion — bukti skema DB saat backup. |
| `manifest-builder.ts` | `ManifestEntrySource {relativePath, stagingPath, kind}`; `providerKindToManifestKind` (database→database, asset→asset, log→log; **configuration → throw** — tidak ada pasangan di manifest entry kind); `buildManifestPayloadJson` (format+meta+files+summary tanpa checksums); `computeManifestSha256`; `ManifestBuilder.build({appVersion, appName, schemaVersion, createdAt, engine, entries})` — baca file staging, hitung SHA-256 per entri + sizeBytes, summary `{files, totalBytes}`, meta `{backupVersion:1, type:'full', integrity:'ok', engine}`. |
| `packager.ts` | `BackupPackager.package({entries, manifestJson, outputPath})` → `{outputPath, sizeBytes}`; ZIP via `adm-zip` (`addLocalFile(localPath,'',name)` per entri + `addFile('manifest.json', Buffer)`); `writeZipPromise(target, {overwrite:true})`; `MANIFEST_FILENAME='manifest.json'`, `APBACKUP_EXTENSION='.apbackup'`. |
| `verifier.ts` | `BackupVerifier({tempDir})`. `verify(containerPath)` → `{ok, messages, manifest, containerSha256}`. Rantai cek: (1) file ada; (2) ZIP valid + `manifest.json` ada; (3) JSON valid + `ManifestValidator.validate`; (4) `manifestSha256` cocok dengan payload; (5) per-entri `sizeBytes`+`sha256` di dalam wadah; (6) ekstrak DB ke temp → `PRAGMA integrity_check`; (7) `containerSha256` seluruh file wadah. |
| `backup.service.ts` | **Orkestrator**. `BackupService({providerRegistry, schemaVersionReader, manifestBuilder, packager, verifier, paths, providerStagingDirs})`. `run({appVersion, appName, engine?, isCancelled?})` → `BackupRunResult {status, sessionId, startedAt, finishedAt, filePath, sizeBytes, manifest, warnings, errors}`. Alur: single-flight guard → sesi `BKP-<uuid>` → preflight → cek cancel → collect provider (WAJIB dulu, lalu OPSIONAL) → staging via `resolveStagedPath` (guard path keluar staging) → build manifest → package ke staging → **verify round-trip wadah staging** → finalisasi copy ke `backup/manual/APLibrary-backup-YYYYMMDD-HHmmss-<8char>.apbackup` → cleanup. `runPreflight()`: `database-integrity` (PRAGMA live via `getPrisma()`) + `target-directory` (mkdir+W_OK) + keputusan provider (skema `decideProviderPreflight`, tanpa method preflight di kontrak Provider — kesiapan sumber dibuktikan di collect). `buildBackupFilename` pure + diuji. |

## Dimodifikasi (2)
- `electron/main/bootstrap.ts` — Container menambah `backupService` (dibangun dari `providerRegistry`, `SchemaVersionReader`, `ManifestBuilder`, `BackupPackager`, `BackupVerifier({tempDir: paths.tempDir})`, `paths`) + `providerStagingDirs: Map([[databaseProvider.id.fullName, paths.tempDir]])` (pemetaan lokasi staging per provider).
- `electron/main/index.ts` — log `[DataInfra]` tetap; container dibangun setelah `bootstrapDataInfrastructure()` (path infra sudah siap).

## TIDAK Diubah
Schema/migration (`prisma migrate diff` = "This is an empty migration."), DB dev, IPC/preload/env.d.ts/renderer/UI (belum ada channel backup), Restore, Scheduler, Encryption, manifest/provider/path domain (WO-1/WO-2/WO-3), provider staging behavior.

## Validation PASS
1. `npm run lint` (tsc node+web) — PASS.
2. `npm run build` (electron-vite; main chunk **2,016.82 kB**) — PASS.
3. Smoke `wo4_backup_smoke/smoke.ts` — **73/73 PASS** (fresh DB temp; dihapus setelah run):
   - **Pure (tanpa DB):** `buildBackupFilename` (format `APLibrary-backup-YYYYMMDD-HHmmss-<8>.apbackup`); `providerKindToManifestKind` 3 mapping + configuration → throw; `BackupDomainError`; single-flight guard; sesi status.
   - **DB-backed:** `SchemaVersionReader` → `20260803_wo2_f2a_master_data_akademik`; builder (meta/entries/summary/checksum payload tanpa self); packager round-trip (ZIP berisi manifest.json + aplibrary.db); verifier rantai penuh (valid, tamper sizeBytes, tamper sha256, tamper manifest.json, DB corrupt, missing manifest); service penuh SUCCESS (file ada di backupManualDir, status SUCCESS), CANCELLED (tanpa file permanen), SUCCESS_WITH_WARNING (provider optional gagal), FAILED (preflight gagal / required provider gagal), single-flight.
4. `prisma migrate diff` = "This is an empty migration." (schema tidak disentuh).
5. Grep bundle main: `aplibrary-backup`/`manifestSha256`/`BackupService` **ter-render** (ter-wire di bootstrap) — berbeda WO-2 (domain murni 0 match). `applications:backup*` channel = 0 (belum ada IPC).

## Arsitektur
- **Engine tidak tahu UI/IPC** — `BackupService` hanya service + DTO hasil; pemanggilan lewat wiring infra nanti (WO berikutnya).
- **Infra boleh filesystem; domain murni** — komponen infra (`src/main/infrastructure/backup/`) membaca file/ZIP; hasilnya objek domain murni (`Manifest`, `BackupRunResult`).
- **Satu-satunya titik tulis final = service** (`copyFileSync` ke `backupManualDir` setelah verify lulus).
- **providerStagingDirs** — kontrak `BackupProvider` (WO-3) tidak menyediakan jalur staging; pemetaan `providerId.fullName → stagingDir` disediakan di wiring (bootstrap), di-resolve aman (`resolveStagedPath` guard path traversal).

## Catatan
- `adm-zip` ditambahkan ke `package.json`/lockfile pada WO-4 (dependency baru, dipakai packager).
- WO-4 tidak berhenti di Architecture Gate karena batch data-protection (WO-1..WO-5) dikerjakan beruntun; status sementara **READY review PO**, akan direview bersama setelah WO-5 selesai.
- Restore = WO-5 (RFC-004): memakai `BackupVerifier.verify` (gate §3) + unpack + `RestoreHandler` (kontrak WO-3) + swap.
