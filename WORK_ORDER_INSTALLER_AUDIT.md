# WORK ORDER INSTALLER AUDIT — Audit Read-Only Pipeline Packaged APLibrary

Status: **READ-ONLY / DISCOVERY** — tidak ada perubahan kode pada WO ini.
Tanggal: 2026-08-11
Scope: Audit keseluruhan jalur build & packaging `dist/win-unpacked` agar installer NSIS menghasilkan aplikasi yang **benar-benar jalan** di PC lain (fresh, tanpa node_modules/dev env), bukan hanya ter-install.

---

## 1. Ringkasan Eksekutif

**Hasil: installer saat ini TIDAK bisa dijalankan di PC lain.** Ada **3 blocker berurutan** — aplikasi ter-install namun mati sebelum window terbuka:

| # | Blocker | Lapisan | Dampak |
|---|---------|---------|--------|
| B1 | Generated Prisma client (`.prisma/client`) **tidak ikut ter-bundle** | electron-builder `files` | `require('@prisma/client')` → `require('.prisma/client/default')` gagal → crash |
| B2 | `DATABASE_URL` **tidak tersedia saat packaged** (`.env` tidak ter-bundle, tidak ada fallback) | `index.ts` / `database.ts` | `new PrismaClient()` tanpa env → throw `Environment variable not found: DATABASE_URL` |
| B3 | Path DB relatif `file:./aplibrary.db` **resolve ke dalam asar (read-only)** saat packaged | `database.ts` + Prisma runtime | Kalaupun B2 dilewati, DB hidup dibuat di dalam `app.asar` → gagal tulis |

Non-blocker (dokumentasi): ikon default Electron (folder `resources/` buildResources kosong); artefak `.tmp*` di dev `.prisma/client`; **Fix #3 (first-run bootstrap: buat skema DB otomatis) & Fix #4 (ikon) sengaja DITUNDA** oleh Product Owner.

---

## 2. Ruang Lingkup Audit

- Config packaging: `electron-builder.yml`, `package.json` (scripts/postinstall), `electron.vite.config.ts`.
- Isi `dist/win-unpacked`: `app.asar` (list file), `app.asar.unpacked`, `resources/` (extraResources).
- Jalur kode startup: `electron/main/index.ts`, `electron/main/database.ts`, `src/main/repositories/base/prisma.ts`, `src/main/infrastructure/database-path.ts`, `electron/main/infrastructure/bootstrap.ts`.
- Prisma runtime: `node_modules/@prisma/client/index.js`, `node_modules/@prisma/client/runtime/library.js` (logika resolve engine & env).

---

## 3. Temuan Detail

### 3.1 Konfigurasi electron-builder

```yaml
# electron-builder.yml
appId: com.kontenyou.aplibrary
productName: APLibrary
directories:
  buildResources: resources      # KOSONG → ikon default Electron (B4, ditunda)
  output: dist
files:
  - out/**/*
  - node_modules/**/*
  - "!node_modules/.prisma/client/*.node"     # ← kontradiktif
  - "node_modules/.prisma/client/*.node"      # ← kontradiktif (negasi lalu re-include)
extraResources:
  - from: node_modules/.prisma/client/
    to: prisma/client/
    filter: ["*.node", "schema.prisma"]        # engine + schema dikirim ke resources/
win: { target: nsis x64, signAndEditExecutable: false }
asarUnpack:
  - "**/*.node"
  - "node_modules/.prisma/client/**"
  - "node_modules/@img/**"
  - "node_modules/sharp/**"
```

Script build (`package.json`): `"build": "npm run typecheck && electron-vite build"`, `"package:win": "npm run build && electron-builder --win --config electron-builder.yml"`, `"postinstall": "electron-builder install-app-deps"`. `main: "./out/main/index.js"`.

### 3.2 B1 — Generated Prisma client tidak ter-bundle (BLOCKER)

Bukti empiris pada `dist/win-unpacked/resources/app.asar`:

```
Grep "\\.prisma" dalam app.asar  → 0 match (node_modules/.prisma/ TIDAK ada)
Grep "\\.node"  dalam app.asar  → hanya @img/sharp + @node-rs/argon2 (.node lain asar-unpacked)
```

- `node_modules/@prisma/client/index.js` baris 3:
  ```js
  ...require('.prisma/client/default')
  ```
  → resolved terhadap dir `@prisma/client` → **wajib ada** `node_modules/.prisma/client/default.js` di dalam package.
- `electron.vite.config.ts` men-`external` `['@prisma/client', 'sharp', '@node-rs/argon2']` → bundle main hanya berisi `require("@prisma/client")`, tidak inline. Jadi `@prisma/client` DAN `.prisma/client` harus hadir sebagai file di package.
- Akibat: glob `node_modules/**/*` TIDAK mencakup direktori dot (`.prisma`), dan dua baris `!`/re-include pada `files` hanya menyasar `*.node` (juga tidak ter-render karena parent dot-dir tidak masuk). Hasil: `default.js`/`index.js`/`schema.prisma` client hilang dari asar → crash saat `require('@prisma/client')`.

### 3.3 B2 — `DATABASE_URL` tidak tersedia saat packaged (BLOCKER)

- `electron/main/index.ts:12` `dotenv.config({ path: path.resolve(__dirname, '../../.env') })` — saat packaged `__dirname = resources/app.asar/out/main` → `../../.env` = `resources/app.asar/.env` (tidak ada). `dotenv.config()` (line 13) fallback CWD — tidak ada `.env` di CWD.
- `.env` TIDAK ikut di-bundle (bukan bagian `files`, dan `.env` adalah dot-file).
- `electron/main/database.ts:6` `new PrismaClient()` **tanpa** override `datasources` → membaca `process.env.DATABASE_URL` → `Environment variable not found: DATABASE_URL` → throw.
- Catatan: `getPrisma()` (stack baru `src/main/repositories/base/prisma.ts`) identik — `new PrismaClient()` tanpa override, bergantung env yang sama.

### 3.4 B3 — Path DB relatif resolve ke dalam asar saat packaged (BLOCKER)

- `.env` dev: `DATABASE_URL="file:./aplibrary.db"`.
- Prisma runtime (`runtime/library.js`) me-resolve URL `file:` relatif terhadap **direktori generated client** (`config.dirname`), yaitu `node_modules/.prisma/client` — dalam package: `resources/app.asar/node_modules/.prisma/client`. SQLite `file:./aplibrary.db` di situ → lokasi di dalam `app.asar` yang **read-only** → kalaupun B2 dilewati, koneksi/penulisan DB gagal.
- Konfirmasi infra: `src/main/infrastructure/database-path.ts` komentar baris 1–3 — "Live DB belum direlokasi ke userData (ADR-001 §8.2 Q2–Q5 = WO masa depan)". `bootstrapDataInfrastructure()` (WO-1) sudah menyiapkan `paths.databaseFile = <userData>/database/aplibrary.db` dan folder `database/` sudah di-ensure saat startup.

### 3.5 Verifikasi isi `dist/win-unpacked` (build lama, 31/07)

- `resources/app.asar` — ter-verifikasi isi (bukan byte-identical hanya untuk bundle renderer; audit ini = daftar file).
- `resources/app.asar.unpacked/node_modules` — hanya `@img`, `@node-rs`, `sharp`.
- `resources/prisma/client/` — `query_engine-windows.dll.node` (19,2 MB) + `schema.prisma` (extraResources berfungsi).
- `resources/templates/` — 2 template xlsx (berfungsi).
- `resources/app-update.yml` — owner `Ryza96`, repo `SmansagoLibrary`, `updaterCacheDirName: aplibrary-updater`.
- Tidak ada mekanisme `migrate deploy`/seed di jalur runtime (`grep migrate|deploy` di `electron/` + `src/main/` = 0 di jalur startup) → **Fix #3 (first-run bootstrap) diperlukan agar PC lain punya skema DB**.

### 3.6 Prisma engine resolve (konfirmasi runtime)

`runtime/library.js` urutan pencarian engine:
1. `process.env.PRISMA_QUERY_ENGINE_LIBRARY` — **tidak pernah diset** di source;
2. `require.resolve(queryEngineLib)` / `process.execPath` sibling;
3. `path.join(config.dirname, queryEngineFilename)` → `node_modules/.prisma/client/query_engine-windows.dll.node`.

Nama file engine Windows = `query_engine-windows.dll.node` (terkonfirmasi ada di dev `node_modules/.prisma/client/` dan extraResources). Karena engine di-unpack ke `resources/prisma/client/` oleh extraResources, penyetelan `PRISMA_QUERY_ENGINE_LIBRARY` ke path tersebut menghilangkan ketergantungan pada asar.

---

## 4. Rencana Perbaikan (hanya Fix #1 & #2 — disetujui PO; Fix #3 & #4 DITUNDA)

### Fix #1 — Bundle generated Prisma client + set `PRISMA_QUERY_ENGINE_LIBRARY`
- `electron-builder.yml` `files`: tambah `"node_modules/.prisma/client/**"` dan hapus dua baris `!`/re-include kontradiktif → seluruh client (JS + `schema.prisma`) ikut asar; engine `.node` tetap asar-unpacked via `asarUnpack`.
- `electron/main/index.ts`: saat `app.isPackaged`, set `process.env.PRISMA_QUERY_ENGINE_LIBRARY = <process.resourcesPath>/prisma/client/<engine-file>` **sebelum** `initDatabase()` — memakai salinan extraResources (file nyata di disk, bukan asar).

### Fix #2 — Relokasi live DB ke `userData` saat packaged (perlu approval PO, lihat §5)
- Saat `app.isPackaged`: `process.env.DATABASE_URL = 'file:' + infra.paths.databaseFile` (forward-slash) — di-set **setelah** `bootstrapDataInfrastructure()` (memberi `databaseFile`) dan **sebelum** `initDatabase()`.
- Dev (`npm run dev`) tetap memakai `.env` → `prisma/aplibrary.db`. **Perilaku dev TIDAK berubah.**
- `resolveLiveDatabaseFile` (restore) otomatis konsisten karena membaca `process.env.DATABASE_URL` yang sama.

### DITUNDA (di luar WO ini)
- **Fix #3** first-run bootstrap: `migrate deploy`/pembuatan skema otomatis saat DB belum ada → tanpa ini, PC fresh punya file DB kosong tanpa tabel (perlu WO terpisah).
- **Fix #4** ikon aplikasi: isi `resources/` buildResources (saat ini default Electron).

---

## 5. Rencana Migrasi Lokasi Database (Fix #2) — DRAFT UNTUK APPROVAL

**Prinsip: data nyata di mesin dev TIDAK dihapus, TIDAK dipindah paksa.**

| Aspek | Dev (sekarang) | Packaged (setelah Fix #2) |
|-------|----------------|---------------------------|
| Lokasi DB | `prisma/aplibrary.db` (relatif ke schema) | `%APPDATA%/APLibrary/database/aplibrary.db` (`userData`) |
| Sumber URL | `.env` `file:./aplibrary.db` | runtime `file:<userData>/database/aplibrary.db` |
| Perilaku | tidak berubah | DB dibuat di userData saat first connect |
| Data existing | **tetap di tempat, tidak disentuh** | tidak otomatis di-copy dari dev |

Poin yang perlu keputusan PO:
1. **Data dev (`prisma/aplibrary.db`) tidak otomatis dibawa** ke `userData` — bila PO ingin data yang sama tampil di aplikasi terpasang, gunakan fitur **Backup/Restore** (sudah ada) atau copy manual file DB. (Opsional: WO terpisah untuk "one-time copy" dengan prompt eksplisit — TIDAK dilakukan di Fix #2.)
2. **PC fresh**: Fix #2 membuat file DB di userData saat first launch, tapi **belum ada tabel** sampai Fix #3 (first-run bootstrap) dikerjakan. Simulasi "DB baru dibuat" tetap bisa diverifikasi dari keberadaan file & log koneksi.

---

## 6. Kontrol Validasi (target setelah Fix #1 + #2)

1. `npm run lint` → PASS
2. `npm run build` → PASS (ukuran bundle dilaporkan)
3. `package:win` → installer NSIS EXIT 0
4. `app.asar` list → `node_modules/.prisma/client/default.js` + `index.js` HADIR
5. `app.asar.unpacked` → `node_modules/.prisma/client/query_engine-windows.dll.node` HADIR
6. Log startup packaged: `[DataInfra] Production data root: <userData>` + `[DB] SQLite connected successfully` + `[RECONCILE] InventorySequence ...`
7. DB baru terbentuk di `<userData>/database/aplibrary.db` (first-run simulation di PC lain / mesin dev dengan profil terpisah)
8. `prisma migrate diff` dev → "No difference detected" (schema TIDAK disentuh)

---

## 7. Laporan Terkait

- Audit investigasi awal: `DATABASE_URL_STARTUP_AUDIT.md` (WO DATABASE_URL Fix, sudah rilis).
- Fondasi infra data (WO-1 Production Data Infrastructure): `WORK_ORDER_1_PRODUCTION_DATA_INFRASTRUCTURE.md`.
- Arsitektur data protection: `ADR_001_DATA_PROTECTION_FINAL_DECISIONS.md` (§8.2 Q2–Q5 = relokasi DB live).

Status: **DONE — READ-ONLY AUDIT** (belum ada perubahan kode). Eksekusi Fix #1 → laporan terpisah → menunggu approval rencana Fix #2.
