# WORK ORDER AUTH-2 — Authentication Foundation

## Ringkasan
- Source of Truth: `RFC_AUTH_ARCHITECTURE.md` (APPROVED & LOCKED, SSOT). Scope: **fondasi autentikasi backend** — `Admin` model + migration, `AdminRepository`, `PasswordHasher` (Argon2id via `@node-rs/argon2`), `PasswordPolicy`, in-memory `SessionManager`, `AuthService` (setup/login/logout/changePassword/status), DTO kontrak.
- **TANPA** IPC, preload, env.d.ts, bootstrap/Container, UI, route guard, TopBar. Belum ada wiring — AuthService berdiri sendiri.
- REV-1 dikunci: username disimpan **trim-only, kapitalisasi dipertahankan**; login **case-insensitive** via `findByUsernameCaseInsensitive`. REV-2 (`fullName`): TIDAK diimplementasikan. REV-4: password lama **tidak pernah** dapat ditampilkan kembali (hanya diverifikasi Argon2id).

## File Baru (7 source + 1 smoke)
| File | Isi |
|------|-----|
| `prisma/schema.prisma` (mod) | Model `Admin`: `id` uuid, `username` @unique, `passwordHash`, `passwordChangedAt?`, `lastLoginAt?`, `createdAt`, `updatedAt`, `@@index([username])`. Single-admin invariant = Service layer (SQLite tanpa DB constraint) |
| `prisma/migrations/20260807_auth1_admin/migration.sql` | Additive: CREATE TABLE Admin + `Admin_username_key` unique + `Admin_username_idx`; tanpa ALTER |
| `src/shared/config/auth.ts` | `PASSWORD_POLICY` {min 8, max 128}, `ARGON2_PARAMS` {memoryCost 65536, timeCost 3, parallelism 1, outputLen 32}, `ARGON2_ALGORITHM_ID` (literal 2, Argon2id), `ARGON2_VERSION` 19 — leaf node tanpa import |
| `src/shared/dto/auth.ts` | `AuthStatusDTO`, `SetupAdminDTO`, `LoginAdminDTO`, `ChangePasswordDTO`, `AuthResultDTO`, `AuthOkDTO`. **Tanpa** passwordHash/sessionId (secret tidak keluar Main, RFC §1.4/§11.3) |
| `src/main/services/password-policy.ts` | `validatePassword`/`isValidPassword` murni: 8..128, tanpa syarat kompleksitas (REV-3) |
| `src/main/services/password-hasher.ts` | `PasswordHasher` (hash/verify/needsRehash) + `parseArgon2Phc` murni (regex PHC). verify = constant-time library (RFC §11.2) |
| `src/main/repositories/admin.repository.ts` | `count`/`create`/`findById`/`findByUsernameCaseInsensitive`/`updatePassword`/`updateLastLogin` — extends `BaseRepository` |
| `src/main/services/session-manager.ts` | Session in-memory (RFC §3.1, bukan entitas DB): `open` (replace session lama), `get`, `currentAdmin`, `close`, `isAuthenticated` |
| `src/main/services/auth.service.ts` | `status`/`setup`/`login`/`logout`/`changePassword` — seluruh guard & validasi di Service (Main = penegak keamanan, RFC §1.4/§11.4) |
| `auth2_auth_smoke/smoke.ts` | **69/69 PASS** |

## Modifikasi
- `electron.vite.config.ts`: external `['@prisma/client', 'sharp', '@node-rs/argon2']` — addon native N-API **tidak boleh di-bundle** rollup (load via `createRequire` saat runtime).

## Keputusan Teknis
- **Argon2id** (RFC §11.1): 64 MiB / 3 iterasi / 1 thread; `@node-rs/argon2@^2.0.2` (N-API stable ABI, kompatibel Electron 33; paket `argon2` DITOLAK — butuh Node ≥22). Salt acak per hash, ter-encode di PHC string.
- **Login case-insensitive (REV-1)**: SQLite tidak mendukung `mode: 'insensitive'` → pencarian memakai findMany + filter lowercase di JS. Tabel Admin maksimal 1 baris (invariant) sehingga aman & murah.
- **Setup (RFC §7, K5)**: hanya sekali — guard `count() === 0` di Service; sukses → session dibuka + `lastLoginAt` diperbarui.
- **Pesan 401 seragam** `Username atau password salah` untuk user tak ada & password salah (anti user-enumeration/timing, RFC §11.2) — `AppError(statusCode, type, message)` dari `electron/main/errorHandler.ts`.
- **ChangePassword (RFC §10)**: guard session aktif; `currentPassword` diverifikasi Argon2id; session TETAP aktif; `passwordChangedAt` dicatat.
- **Logout idempoten** (RFC §9): tanpa session tetap `{ ok: true }`.
- **needsRehash**: deteksi hash non-argon2id / param lama (versi, memory, time, parallelism) → sinyal re-hash saat login; **v1 tanpa jalur re-hash otomatis** (backlog).

## Validation
1. `npm run lint` (tsc node + web) — PASS.
2. `npm run build` — PASS (main 2,053.63 kB · preload 11.06 kB · renderer 1,190.50 kB).
3. Smoke `auth2_auth_smoke` **69/69 PASS** pada fresh DB temp (5 migrations): policy 10, hasher 16, session 9, setup+status 9, login 6, changePassword 7, logout idempoten 5, repository 7.
4. `prisma migrate diff --from-migrations --to-schema-datamodel` = "This is an empty migration." (no drift; migration additive murni).
5. **Grep bundle main**: `argon2id` / `Setup admin sudah pernah` / `SessionManager` / `password-policy` / `@node-rs/argon2` = 0 match — bukti AuthService **belum ter-wire** (tree-shaken) dan argon2 external.
6. DB temp dibersihkan; DB live dev tidak pernah disentuh.

## Pelajaran (retain)
- **Native addon wajib di-`external` di electron.vite.config** — `@node-rs/argon2` memakai `createRequire` untuk memuat `.node` platform-specific saat runtime; bila di-bundle rollup, `require` dinamis rusak (MODULE_NOT_FOUND). Pola sama `@prisma/client`/`sharp`.
- **Smoke AuthService harus memulai dari DB kosong untuk menguji `setup`** (guard `count()===0`); pengujian repository yang `create` admin dilakukan SETELAH alur Service (atau di DB terpisah).
- **Login case-insensitive ≠ lowercase saat persist** — REV-1 menyimpan kapitalisasi asli (trim-only); normalisasi lowercase hanya pada lookup; assertion smoke: simpan `"Kepala Perpus"`, login `"KEPALA PERPUS"` → sukses, `status.username` mengembalikan bentuk asli.
- **Pesan 401 seragam adalah kontrak smoke** (`message.includes('Username atau password salah')`) — konsisten pola AppError layer lain.
- **`const enum` dari library tidak bisa direferensikan saat isolatedModules** (TS2748) → gunakan literal numerik `ARGON2_ALGORITHM_ID = 2` dengan komentar sumbernya.
- **REV-4 dibuktikan secara arsitektur**: `ChangePasswordDTO` hanya menerima `currentPassword` (diverifikasi), tidak ada DTO/metode yang mengembalikan `passwordHash`; smoke hanya memastikan verify benar/salah.
- Compile smoke: `npx tsc --module commonjs --target es2022 --moduleResolution node --esModuleInterop --skipLibCheck --rootDir . --outDir <tmp>\out auth2_auth_smoke/smoke.ts` (argon2 tanpa `exports` field → pola commonjs+node, BUKAN node16); run dengan `DATABASE_URL` absolute `file:C:/...` + `NODE_PATH=<repo>\node_modules`; fresh DB per run (`prisma migrate deploy` dari workdir `prisma/`).

## Status
**DONE - READY review PO** (tidak membuka WO berikutnya). Belum commit — menunggu review Product Owner.
