# DATABASE_URL Startup Audit

- **Tanggal:** 2026-08-05
- **Mode:** READ ONLY — investigasi tanpa perubahan source, tanpa commit, tanpa push.
- **Gejala:** `npm run dev` (electron-vite dev) gagal start dengan `PrismaClientInitializationError: Environment variable not found: DATABASE_URL`, padahal `.env` ada di root repo dengan `DATABASE_URL="file:./aplibrary.db"`.

---

## Ringkasan Eksekutif

**Root cause: `DATABASE_URL` TIDAK pernah dimuat ke `process.env` aplikasi.** Tidak ada `dotenv.config()` di seluruh source, electron-vite tidak memuat `.env` ke `process.env` proses main (hanya prefix `VITE_*`), dan Prisma runtime 5.22 **tidak** auto-load `.env` pada setup ini karena generated client memiliki `relativeEnvPaths.rootEnvPath = null`. Satu-satunya sumber `DATABASE_URL` adalah **environment OS/terminal** tempat `npm run dev` dijalankan.

Dengan kata lain: aplikasi TIDAK pernah membaca `.env`. Ia hanya bekerja ketika terminal yang menjalankannya sudah punya `DATABASE_URL` di environment (mis. sisa sesi smoke yang pernah `$env:DATABASE_URL=...`). Terminal baru yang bersih → startup gagal.

---

## Jawaban 5 Pertanyaan Audit

### Q1 — Di mana `dotenv.config()` dipanggil?

**TIDAK ADA.** Grep seluruh source (`grep -r "dotenv" electron/ src/ scripts/ *.ts *.cjs`) = 0 kemunculan kode. `dotenv` hanya muncul di `package-lock.json` sebagai dependency **transitif** (`dotenv: 16.6.1`, `dotenv-expand: 11.0.7`) milik Prisma/Vite — tidak pernah di-require oleh source. `package.json` TIDAK mencantumkan `dotenv` di `dependencies` maupun `devDependencies`.

### Q2 — Apakah dipanggil sebelum PrismaClient dibuat?

Tidak berlaku (tidak ada panggilannya). PrismaClient dibuat di **dua** tempat, keduanya tanpa env-loading:
- `electron/main/database.ts` — `initDatabase()`: `prisma = new PrismaClient()` lalu `$connect()`.
- `src/main/repositories/base/prisma.ts` — singleton `getPrisma()`: `prisma ??= new PrismaClient()`.

### Q3 — Apakah `initDatabase()` dipanggil sebelum `dotenv.config()`?

Bootstrap (`electron/main/index.ts`): `app.whenReady()` → `await initDatabase()` → `databaseReconciliationService.run()` → `createContainer()` → `registerAllHandlers()` → `settingService.get()` → `createWindow()`. Tidak ada panggilan `dotenv.config()` di posisi mana pun — sebelum maupun sesudah.

### Q4 — Apakah electron-vite mengubah working directory atau path `.env`?

**Tidak mengubah CWD, dan tidak memuat `.env` ke proses main.**
- `electron-vite` 2.3.0: `startElectron(root)` → `spawn(electronPath, [entry, ...args], { stdio: 'inherit' })` tanpa `cwd`/`env` → proses Electron mewarisi environment terminal apa adanya, CWD = direktori tempat `npm run dev` dijalankan.
- `loadEnv(mode, envDir=process.cwd(), prefixes=['VITE_','MAIN_VITE_','PRELOAD_VITE_','RENDERER_VITE_'])` hanya mengekspos variabel berprefix `VITE_`-family untuk `import.meta.env` renderer — `DATABASE_URL` (tanpa prefix) tidak pernah disuntikkan, dan mekanisme ini pun tidak menulis ke `process.env` main.
- `processEnvDefine()` hanya memetakan `process.env` → `process.env` (no-op), tidak membake nilai.

### Q5 — Commit/perubahan terakhir yang mengubah startup?

**TIDAK ADA perubahan yang menghilangkan dotenv — dotenv tidak pernah ada.**
- `electron/main/index.ts` terakhir diubah commit `73dc5f6` (menambahkan `await databaseReconciliationService.run()` — tidak menyentuh env/DB).
- `electron/main/database.ts` & `electron.vite.config.ts` lahir di `437b50a`, tak berubah sejak.
- `git log --all` TIDAK menemukan commit yang menambah/menghapus `dotenv.config()`.
- `.env` di-gitignore (`.gitignore` baris 27-30) sehingga tidak pernah di-track.

---

## Bukti Mekanisme Env-Loading

### 1. Prisma runtime 5.22 — env loading via path yang di-embed
`node_modules/@prisma/client/runtime/library.js` fungsi `zt({ rootEnvPath, schemaEnvPath })` memuat `.env` HANYA jika path-nya ter-embed pada generated client:
- L408: `rootEnvPath: config.relativeEnvPaths.rootEnvPath && path.resolve(...)`
- L409: `schemaEnvPath: config.relativeEnvPaths.schemaEnvPath && path.resolve(...)`

Generated client `node_modules/.prisma/client/index.js`:
- L357: `"sourceFilePath": "D:\...\APLibrary\prisma\schema.prisma"` (schema ter-embed absolute)
- L359-360: `"relativeEnvPaths": { "rootEnvPath": null }` — **TIDAK ada schemaEnvPath, rootEnvPath null** → runtime TIDAK memuat `.env` apa pun.

**Mengapa `rootEnvPath` null:** nilai ini di-embed saat `prisma generate` terakhir (timestamp client 05/08 10:09 — saat smoke suite R-4/R-5/R-6). Prosedur smoke selalu menjalankan `migrate deploy` dari **workdir `prisma/`** dengan `DATABASE_URL` di-set via `$env:` → Prisma CLI tidak "menemukan" `.env` relative terhadap dir schema (`.env` ada di repo root, bukan `prisma/.env`), sehingga meng-embed `null`.

### 2. Uji empiris (temp, di luar repo)
File `C:\Users\hp\AppData\Local\Temp\opencode\r6-gate\envtest.js`:
```
CWD: D:\kontenyou\web\New folder\APPSCANNER\APLibrary   (repo root, .env ADA di sini)
delete process.env.DATABASE_URL → new PrismaClient().$connect()
ERR: error: Environment variable not found: DATABASE_URL.
```
→ Meski `.env` berada di CWD, Prisma runtime **tidak** memuatnya. Konfirmasi langsung hipotesis.

### 3. Bundle main tidak membake DATABASE_URL
`Select-String out/main/index.js -Pattern "DATABASE_URL"` = 0 kemunculan → referensi `process.env.DATABASE_URL` dievaluasi runtime, bukan konstanta build.

---

## Mengapa Sebelumnya "Berfungsi"?

Aplikasi hanya jalan ketika environment terminal memiliki `DATABASE_URL`. Contoh skenario nyata: sesi PowerShell tempat smoke dijalankan pernah `$env:DATABASE_URL = "file:C:/..."` — variabel bertahan di sesi itu, lalu `npm run dev` di terminal yang sama sukses. Terminal baru (tanpa setenv) → gagal. Tidak ada sumber env-loading otomatis di aplikasi.

---

## Opsi Perbaikan (REKOMENDASI — TIDAK diterapkan, menunggu persetujuan)

| # | Opsi | Penjelasan | Catatan |
|---|------|-----------|---------|
| **A** | Tambah `dotenv` dependency + `dotenv.config()` di `electron/main/index.ts` **sebelum** `await initDatabase()` | Deterministik, tidak bergantung di mana generate dijalankan | Paling robust; butuh `npm i dotenv` |
| **B** | Buat `prisma/.env` (salin dari `.env` root) lalu regenerasi `prisma generate` | Prisma CLI embed `schemaEnvPath` → runtime auto-load saat `migrate deploy` dari workdir `prisma/` | Perlu `prisma generate` ulang tiap schema berubah; rapuh bila generate dijalankan dari CWD lain |
| **C** | Set `DATABASE_URL` di Environment Variables Windows (persistent) | Selalu tersedia di semua terminal | Di luar repo; bisa konflik antar proyek |
| **D** | Regenerasi `prisma generate` dari repo ROOT (bukan `prisma/`) | rootEnvPath ter-embed ke `.env` root → runtime auto-load | Paling murah; tapi hasil bergantung CWD generate (rapuh bila smoke kembali run dari `prisma/`) |

**Rekomendasi: Opsi A** (explicit `dotenv.config()`) — menghilangkan seluruh ketergantungan pada CWD generate dan env OS. Jika ingin tetap "Prisma-native", Opsi B adalah kompromi.

---

## File Terkait (untuk referensi fix)

- `electron/main/index.ts` — tempat `dotenv.config()` harus dipanggil (sebelum `initDatabase()`).
- `electron/main/database.ts` — `initDatabase()` (PrismaClient #1).
- `src/main/repositories/base/prisma.ts` — singleton `getPrisma()` (PrismaClient #2).
- `electron.vite.config.ts` — main external `['@prisma/client']`; tanpa plugin env.
- `node_modules/.prisma/client/index.js` L357-360 — `relativeEnvPaths.rootEnvPath = null`.
- `node_modules/@prisma/client/runtime/library.js` L408-409 — mekanisme env-loading Prisma.
- `node_modules/electron-vite/dist/chunks/lib-CMs-qhOt.cjs` — `loadEnv`/`startElectron`.
- `prisma/schema.prisma` — `url = env("DATABASE_URL")`.
- `.env` / `.env.example` — `DATABASE_URL="file:./aplibrary.db"`; `.env` di-gitignore; `prisma/.env` TIDAK ada.

---

**Status: DONE (READ ONLY).** Tidak ada source yang diubah; tidak ada commit/push. Menunggu keputusan opsi perbaikan.
