# INSTALLER AUDIT �?" LAPORAN AKHIR GABUNGAN

Status: **SELESAI �?" menunggu review PO**
Tanggal: 2026-08-11
Platform: Windows x64

Laporan ini menggabungkan seluruh hasil audit installer APLibrary dari awal sampai final:
audit read-only pipeline packaged, eksekusi 3 fix blocker, uji installer NSIS sungguhan,
no-drift check, inspeksi insiden profil produksi, dan review git (tanpa commit).

---

## 1. Ringkasan Eksekutif

| Tahap | Hasil |
|-------|-------|
| Audit read-only pipeline packaged | 3 blocker berurutan ditemukan (B1/B2/B3) �?" installer TIDAK bisa jalan di PC lain |
| Fix #1 �?" engine Prisma | DONE �?" `PRISMA_QUERY_ENGINE_LIBRARY` diarahkan ke extraResources saat packaged |
| Fix #2 �?" `DATABASE_URL` userData | DONE �?" DB live dipindah ke `userData/database/aplibrary.db` saat packaged |
| Fix #3 �?" Migration Bootstrap | DONE �?" skema DB dibuat otomatis di instalasi bersih (WO terpisah) |
| No-drift check | PASS �?" fresh DB hasil bootstrap == schema.prisma (0 byte diff) |
| Uji installer NSIS sungguhan | PASS �?" silent install �?" exe terinstall berjalan (7 migration applied) �?" silent uninstall bersih |
| Inspeksi insiden `%APPDATA%\aplibrary` | Profil produksi nyata; DB dibuat di sana oleh run pertama tanpa `--user-data-dir`; TIDAK dihapus |
| Git review | Bersih �?" 6 file source dimodifikasi + 4 file/dir untracked (deliverable WO); TIDAK commit |

**Kesimpulan: installer kini menghasilkan aplikasi yang benar-benar jalan di PC fresh**
(skema DB dibuat otomatis, engine ter-resolve, DB live di userData), dibuktikan dengan
uji silent install/run/uninstall pada mesin nyata.

---

## 2. Audit Read-Only Pipeline Packaged (temuan awal)

Sumber lengkap: `WORK_ORDER_INSTALLER_AUDIT.md`.

Tiga blocker berurutan membuat aplikasi ter-install namun mati sebelum window terbuka:

| # | Blocker | Lapisan | Dampak |
|---|---------|---------|--------|
| B1 | Generated Prisma client (`.prisma/client`) tidak ikut ter-bundle | electron-builder `files` | `require('@prisma/client')` crash |
| B2 | `DATABASE_URL` tidak tersedia saat packaged (`.env` tidak ter-bundle) | `index.ts`/`database.ts` | `Environment variable not found: DATABASE_URL` |
| B3 | Path DB relatif `file:./aplibrary.db` resolve ke dalam asar (read-only) | `database.ts` + Prisma runtime | DB hidup dibuat di dalam `app.asar` �?" gagal tulis |

Non-blocker: ikon default Electron (ditunda PO), Fix #3 & #4 awalnya ditunda PO
(Fix #3 kemudian dieksekusi sebagai WO MIGRATION BOOTSTRAP; Fix #4 ikon masih backlog).

---

## 3. Fix yang Dieksekusi

### Fix #1 �?" Engine Prisma (dalam `electron/main/index.ts` + `electron-builder.yml` + `electron.vite.config.ts` + `prisma/schema.prisma` + `tsconfig.node.json`)

- Generated client dipindah ke `src/generated/prisma` (output `prisma generate`), alias
  `@prisma/client` di `electron.vite.config.ts` + `paths` di `tsconfig.node.json`.
- `electron-builder.yml`: `files` kini `!node_modules/.prisma/**`; extraResources
  `src/generated/prisma/ -> resources/prisma/client/` (engine `.node` + `schema.prisma`);
  asarUnpack tanpa `.prisma/client/**`.
- Saat `app.isPackaged && win32`: `process.env.PRISMA_QUERY_ENGINE_LIBRARY =
  <resourcesPath>/prisma/client/query_engine-windows.dll.node` di module scope `index.ts`
  (SEBELUM `initDatabase()`). Dev tidak terpengaruh.

### Fix #2 �?" DB live ke userData (dalam `electron/main/index.ts`)

- Saat `app.isPackaged`: `process.env.DATABASE_URL = 'file:' + infra.paths.databaseFile`
  (forward-slash), di-set SETELAH `bootstrapDataInfrastructure()` dan SEBELUM
  `initDatabase()`.
- Dev tetap memakai `.env` -> `prisma/aplibrary.db`. Perilaku dev TIDAK berubah;
  data dev TIDAK dihapus/dipindah paksa.

### Fix #3 �?" Migration Bootstrap (WO MIGRATION BOOTSTRAP)

Sumber lengkap: `WORK_ORDER_MIGRATION_BOOTSTRAP.md`.

- File baru: `src/main/infrastructure/migrations/sql-split.ts` (state machine split SQL),
  `src/main/infrastructure/migrations/migration-bootstrap.ts` (`bootstrapMigrations` ala
  `prisma migrate deploy`: transaction-per-migration + record `_prisma_migrations` persis
  kontrak Prisma 5.22), `migration_bootstrap_smoke/smoke.ts`.
- Saat `app.isPackaged`: `bootstrapMigrations(path.join(process.resourcesPath, 'migrations'))`
  sebelum `initDatabase()` dan reconciliation. Migration disalin `prisma/migrations/ ->
  resources/migrations/` oleh extraResources.
- **Interchangeable**: DB hasil bootstrap dibaca `prisma migrate status` sebagai
  *"up to date"* (checksum + format + counts valid) �?" backup/restore
  (`SchemaVersionReader`) bekerja tanpa perubahan.

---

## 4. No-Drift Check

Command:
```
npx prisma migrate diff --from-url "file:<fresh-sim>/database/aplibrary.db" --to-schema-datamodel prisma/schema.prisma --script
```
Hasil: **exit 0, output 0 byte** �?" fresh DB hasil `bootstrapMigrations` (7 migration
applied) identik dengan schema.prisma. Tidak ada drift.

---

## 5. Uji Installer NSIS Sungguhan

Lingkungan: mesin dev, profil install terpisah (`%TEMP%\opencode\nsis-install`), run
profil terpisah (`--user-data-dir`), silent mode.

| Langkah | Hasil |
|---------|-------|
| **Silent install** `APLibrary Setup 0.1.0.exe /S /D=<nsis-install>` | EXIT 0; 24 item; `APLibrary.exe`, `resources\prisma\client\query_engine-windows.dll.node`, `Uninstall APLibrary.exe` hadir |
| **Jalankan exe terinstall** (dengan `--user-data-dir` terisolasi) | Log startup IDENTIK build unpacked: `[DataInfra] Production data root` �?" `[Migrations] bootstrap: 7 applied, 0 skipped` �?" `[DB] SQLite connected successfully` �?" `[RECONCILE] InventorySequence lastNumber=0 ... synced=true`; PID di-stop setelah 22s |
| **Silent uninstall** `Uninstall APLibrary.exe /S` | EXIT 0; direktori install TERHAPUS (`INSTALL_DIR_EXISTS=False`) |

Bukti log run terinstall (memuat `[Migrations] bootstrap: 7 applied, 0 skipped`)
menegaskan rantai Fix #1 -> Fix #2 -> Fix #3 bekerja di instalasi terinstall,
bukan hanya di dev.

---

## 6. Inspeksi Insiden `%APPDATA%\aplibrary` (Profil Produksi Nyata)

**Konteks insiden:** run pertama simulasi "fresh PC" dijalankan TANPA `--user-data-dir`
sehingga memakai profil nyata `C:\Users\hp\AppData\Roaming\aplibrary` dan bootstrap
migration di sana.

**Temuan:**

- Profil tersebut adalah **profil produksi nyata** (data Chromium sejak 29/07/2026,
  folder `logs`/`assets\member-photos` sejak 06/08/2026), BUKAN profil buatan simulasi.
- `database\aplibrary.db` (389.120 B, 11/08 08:34:42) = DB hasil bootstrap 7 migration
  oleh run pertama tanpa `--user-data-dir` (fresh migrated empty DB).
- `temp\restore-snapshots\RST-bc9f27fb.db` (389.120 B, 07/08 21:50:48) = artefak
  **pra-sesi** (4 hari lebih dulu), sisa pekerjaan restore sebelumnya �?" bukan dari sesi ini.
- 12 folder DataInfra (database, settings, logs, assets\member-photos, assets\school-logo,
  assets\templates, temp, backup\manual, backup\scheduled) seluruhnya sudah ada.
- Tidak ada proses Electron/APLibrary yang berjalan (tidak ada orphan).

**Keputusan: profil produksi TIDAK dihapus** (kebijakan: jangan hapus tanpa perintah PO).
DB di dalamnya adalah hasil bootstrap kosong �?" data user yang lebih lama berada di
`prisma/aplibrary.db` dev, bukan di profil ini. Sisa penanganan (hapus/pertahankan DB
bootstrap di profil produksi, atau migrasi data dev) diserahkan ke PO.

---

## 7. Git Review (tanpa commit)

```
 M AGENTS.md                              (entri WO MIGRATION BOOTSTRAP)
 M electron-builder.yml                   (Fix #1)
 M electron.vite.config.ts                (Fix #1)
 M electron/main/index.ts                 (Fix #1 + Fix #2 + Fix #3)
 M prisma/schema.prisma                   (Fix #1 �?" generator output)
 M tsconfig.node.json                     (Fix #1 �?" paths @prisma/client)
?? FULL_AUDIT_REPORT.md                   (audit 8-area)
?? INSTALLER_AUDIT_FINAL_REPORT.md        (laporan ini)
?? WORK_ORDER_INSTALLER_AUDIT.md          (audit read-only pipeline)
?? WORK_ORDER_MIGRATION_BOOTSTRAP.md      (WO Fix #3)
?? migration_bootstrap_smoke/             (smoke 83 assertion)
?? src/generated/                         (output prisma generate �?" build artefact)
?? src/main/infrastructure/migrations/    (sql-split.ts + migration-bootstrap.ts)
```

`git diff --stat`: 6 file berubah, 70 insertions, 6 deletions.

Catatan:
- Semua perubahan source = deliverable Fix #1/#2/#3 + WO MIGRATION BOOTSTRAP.
- `src/generated/` adalah artefak `prisma generate` (output baru) �?" tidak ter-track,
  tersedia di `package:win` via extraResources. Bila ingin tidak pernah ter-commit,
  tambahkan ke `.gitignore` (keputusan PO).
- Tidak ada `package.json` berubah (tidak ada dependency baru).
- **TIDAK ada commit** sesuai instruksi.

---

## 8. Sisa Pekerjaan (backlog, bukan blocker)

1. **Fix #4 �?" ikon aplikasi**: isi `resources/` buildResources (saat ini default Electron).
2. **Data dev `prisma/aplibrary.db` tidak otomatis dibawa** ke `userData` �?" bila ingin data
   sama tampil di aplikasi terpasang, gunakan fitur Backup/Restore atau WO one-time copy.
3. **`src/generated/` gitignore** (opsional, keputusan PO).
4. Penanganan DB bootstrap kosong di profil produksi `%APPDATA%\aplibrary` (keputusan PO).

---

## 9. Laporan Terkait

- `WORK_ORDER_INSTALLER_AUDIT.md` �?" audit read-only pipeline packaged (B1/B2/B3).
- `WORK_ORDER_MIGRATION_BOOTSTRAP.md` �?" WO Fix #3, smoke 83/83.
- `FULL_AUDIT_REPORT.md` �?" audit menyeluruh 8 area (build, wiring, data, smoke, security, labels, deps, git).
- `DATABASE_URL_STARTUP_AUDIT.md` �?" investigasi awal DATABASE_URL (sudah rilis).
- `WORK_ORDER_1_PRODUCTION_DATA_INFRASTRUCTURE.md` �?" fondasi data root userData.
