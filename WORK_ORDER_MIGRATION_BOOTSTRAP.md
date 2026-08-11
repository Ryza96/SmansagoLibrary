# WORK ORDER — MIGRATION BOOTSTRAP (Installer Audit Fix #3)

## Ringkasan

Menutup temuan **Fix #3 (Installer Audit)**: pada **instalasi bersih** aplikasi packaged, database pengguna di `userData/database/aplibrary.db` baru kosong — aplikasi saat itu langsung `initDatabase()` → `databaseReconciliationService.run()` dan membaca tabel `InventorySequence` yang belum ada → crash sebelum window terbuka.

WO ini menyediakan **bootstrap migration ala `prisma migrate deploy`** yang dijalankan otomatis saat startup packaged: skema DB dibuat dari file migration yang sama yang dikelola dev (`prisma/migrations/`, disalin electron-builder ke `resources/migrations/`).

## Keputusan PO / Desain

- **Migration dev & production memakai source yang sama** (`prisma/migrations/`, 7 folder migration). Dev: `prisma migrate deploy` (tidak berubah). Production: `bootstrapMigrations()` menjalankan migration yang belum diterapkan, transaction-per-migration.
- **Format record `_prisma_migrations` identik dengan Prisma CLI** (8 kolom, `checksum` = sha256 file `migration.sql`, `started_at`/`finished_at` = epoch ms, `applied_steps_count` = jumlah statement). Keuntungan: DB hasil bootstrap **interchangeable** dengan DB hasil `migrate deploy` — `prisma migrate status` melaporkan *up to date*, dan backup/restore (WO-4/5) yang memakai `SchemaVersionReader` (baca migration terakhir di `_prisma_migrations`) bekerja tanpa perubahan.
- **Hanya berjalan saat `app.isPackaged`** — dev tidak terpengaruh (migration dev dikelola CLI). Posisi: SETELAH `bootstrapDataInfrastructure()` (direktori DB ada) dan SETELAH `DATABASE_URL` diarahkan ke userData (Fix #2), SEBELUM `initDatabase()` dan reconciliation.
- **Engine Prisma** sudah diarahkan `PRISMA_QUERY_ENGINE_LIBRARY` di module-scope `index.ts` (Fix #1) → `bootstrapMigrations` memakai `new PrismaClient()` yang sama, engine ter-resolve dengan benar di packaged.

## File

### Baru
| File | Isi |
|------|-----|
| `src/main/infrastructure/migrations/sql-split.ts` | `splitSqlStatements(sql)` murni — state machine: string tunggal/ganda (dengan escape `''`/`""`), line comment `--`, block comment `/* */`, statement diakhiri `;`. |
| `src/main/infrastructure/migrations/migration-bootstrap.ts` | `MIGRATIONS_TABLE_DDL` (CREATE TABLE IF NOT EXISTS `_prisma_migrations` persis kontrak Prisma 5.22), `computeMigrationChecksum` (sha256), `loadMigrationFiles` (urut lexicographic, abaikan `migration_lock.toml`, file non-dir), `ensureMigrationsTable`, `applyPendingMigrations` (skip applied, transaction-per-migration + INSERT record), `bootstrapMigrations` (fail-fast bila tidak ada migration). |
| `migration_bootstrap_smoke/smoke.ts` | **83 assertion** (lihat Validation). |

### Dimodifikasi
| File | Perubahan |
|------|-----------|
| `electron/main/index.ts` | Import `bootstrapMigrations`; di dalam `app.whenReady()` blok `app.isPackaged`: `bootstrapMigrations(path.join(process.resourcesPath, 'migrations'))` sebelum `initDatabase()`, log `[Migrations] bootstrap: N applied, M skipped`. |

### Tidak diubah
`schema.prisma`, migration (tidak ada migration baru — bootstrap memakai 7 file yang ada), `electron-builder.yml` (`extraResources` **sudah** memuat `prisma/migrations/ → resources/migrations/`), engine, Backup/Restore, DB dev, UI.

## Validation

1. **Smoke `migration_bootstrap_smoke` — 83/83 PASS** (fresh DB temp, tidak menyentuh DB dev):
   - Splitter murni (11): semicolon dalam string/identifier/comment diabaikan, escape `''`, whitespace-only → `[]`, komentar dipertahankan.
   - Checksum (4): 64 hex lowercase, deterministik, Buffer == string.
   - Loader (6): 7 file termuat urut lexicographic, checksum valid, statement non-kosong; dir kosong/tidak ada → `[]`.
   - **Statement counts sesuai plan (7):** adr002=47, wo13_procurement=3, wo13_revision1=2, wo2_f2a=14, auth1=3, auth7=4, wo_print=1.
   - DDL + `ensureMigrationsTable` (4): idempoten, 8 kolom persis Prisma.
   - Bootstrap segar (10): 7 applied/0 skipped, semua 19 tabel model ada, 7 baris `_prisma_migrations`, **checksum DB == sha256 file** untuk 7 file, `applied_steps_count` benar, insert+read via PrismaClient sukses.
   - Idempotensi (3): run kedua 0 applied/7 skipped, tidak duplikat baris.
   - **Rollback transaction-per-migration (5):** migrasi ber-statement gagal → throw, tabel dari migrasi gagal tidak jadi, migrasi sebelumnya tetap tercatat (commit per-migrasi).
   - Fail-fast (1): dir tanpa migration → throw.
   - **`prisma migrate status` (2):** exit 0 + "Database schema is up to date!" → membuktikan record `_prisma_migrations` hasil bootstrap **dibaca Prisma CLI sebagai valid** (checksum + format + counts benar).
2. **`npm run lint`** PASS (tsc node+web).
3. **`npm run build`** PASS (main 2,397.24 kB; preload 11.70 kB; renderer 1,240.61 kB).
4. **Bundle grep:** `bootstrapMigrations`×2, `[Migrations] bootstrap`×1, `_prisma_migrations`×5, `splitSqlStatements`×2 — modul ter-wire ke main bundle.
5. **DB dev tidak disentuh** — smoke memakai fresh DB temp (`file:C:/...`), dibersihkan setelah run.

## Status

**DONE — menunggu review PO.** Tidak membuka WO berikutnya.

## Pelajaran (retain)

- **Source tunggal migration dev & production** = file yang sama (`prisma/migrations/`). `electron-builder.yml` `extraResources` sudah menyimpan `prisma/migrations/ → resources/migrations/` sehingga `process.resourcesPath/migrations` berisi folder-folder ber-`migration.sql`. `migration_lock.toml` di-abaikan loader (bukan direktori ber-`migration.sql`).
- **Format `_prisma_migrations` harus persis Prisma** — `prisma migrate status` adalah penguji integritas terbaik: bila checksum/format/counts menyimpang, CLI menolak. `applied_steps_count` dibaca sebagai **BigInt** dari SQLite (jangan bandingkan `===` angka tanpa `Number()`, jangan `JSON.stringify` BigInt).
- **Transaction-per-migration** (bukan satu transaksi raksasa): kegagalan satu statement me-rollback hanya migrasi itu; migrasi sebelumnya tetap tercatat. Berbeda `prisma migrate deploy` (yang juga per-migration) → perilaku konsisten.
- **Splitting SQL harus state machine**, bukan `split(';')` — string SQL Prisma mengandung semicolon di dalam literal (`DEFAULT current_timestamp`, teks), komentar, dan identifier ber-quote; gunakan pendekatan karakter-per-karakter (tunggal/ganda/`--`/`/* */`) dengan dukungan escape `''`/`""`.
- **`new PrismaClient()` di bootstrap independen dari singleton app** (base/prisma `getPrisma()`) — aman dibuat sebelum `initDatabase()`; `finally` disconnect. Membaca `process.env.DATABASE_URL` saat konstruksi, sehingga urutan di `index.ts` (set DATABASE_URL Fix#2 → bootstrap → initDatabase) wajib dipertahankan.
- **`spawnSync('npx.cmd', ...)` di Node 22 Windows tanpa `shell: true` → `EINVAL`** (empty output, status null). Untuk menjalankan CLI Prisma dari smoke, gunakan `shell: process.platform === 'win32'`. Manual shell tidak menunjukkan masalah ini.
- **Posisi bootstrap = setelah data root & DATABASE_URL, sebelum initDatabase & reconciliation** — reconciliation membaca `InventorySequence` yang baru dibuat; window tidak boleh terbuka sebelum skema ada.
