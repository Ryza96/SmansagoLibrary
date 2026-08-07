# WORK_ORDER_AUTH_7_SESSION_PERSISTENCE.md

**WO:** AUTH-7 — Session Persistence (admin tetap login setelah restart aplikasi).
**Status:** DONE - menunggu review Product Owner.

---

## 1. Ringkasan

- **RFC disetujui PO (Opsi A):** session admin di-persist ke tabel **`AdminSession`** (SQLite/Prisma) agar admin **tetap login setelah restart aplikasi**. **TTL 24 jam absolute** (bukan sliding); **selalu persist** (tanpa checkbox Remember Me); diimplementasikan sebagai **satu WO AUTH-7** (bukan splitting).
- **Mekanisme:** token session = `randomBytes(32).toString('base64url')` (~43 karakter, bukan JWT) di `SESSION_CONFIG`. Saat `setup`/`login`, `SessionManager.open()` menulis satu baris `AdminSession` (single admin → replace: `deleteByAdminId` + `create`, expired di-`prune`); saat `logout`, `close()` **menghapus baris** (bukan set `revokedAt` — keputusan PO). Proses baru memulihkan session via `load()` (dipanggil lazy dari `AuthService.status()`/`changePassword()`), yang mengambil baris valid TERBARU (`expiresAt > now`).
- **Mirror in-memory tetap sumber kebenaran selama proses hidup** (`get()`/`currentAdmin()`/`isAuthenticated()` tetap sinkron — kontrak lama utuh). `load()` hanya berjalan saat mirror kosong. TTL absolute ditegakkan dua lapis: filter DB `expiresAt > now` (jalur load/restart) dan cek `expiresAt <= Date.now()` di `AuthService.ensureLoadedSession()` (proses yang hidup melewati 24 jam).
- **Keputusan PO (dokumentasi RFC):** `revokedAt` & `revalidatedAt` TIDAK dibuat (logout = hapus baris; TTL absolute; changePassword TIDAK memperpanjang). `load()` lazy (bukan eager di bootstrap). Migration **additive** (hanya CREATE TABLE + 3 index, tanpa ALTER) — pola `20260807_auth1_admin`.
- **Tanpa UI:** tidak ada perubahan renderer sama sekali (bundle renderer **byte-identik** dengan rilis AUTH-6 — bukti scope). Perilaku startup/RFC §5.4 (persist status setelah restart) dibuktikan di smoke.

## 2. File

### Baru (7)
| File | Peran |
|------|-------|
| `prisma/migrations/20260807_auth7_admin_session/migration.sql` | Additive: `CREATE TABLE AdminSession` (id, sessionId UNIQUE, adminId FK→Admin `ON DELETE CASCADE`, createdAt default now, expiresAt) + index `adminId`, `expiresAt`. |
| `src/shared/config/session.ts` | `SESSION_CONFIG` leaf node (pola `auth.ts`): `tokenBytes: 32`, `ttlHours: 24` — tanpa import. |
| `src/main/repositories/admin-session.repository.ts` | `AdminSessionRepository extends BaseRepository`: `create`, `findLatestValid` (join admin→username), `findValidBySessionId`, `deleteBySessionId`, `deleteByAdminId`, `deleteExpired`, `count`. |
| `auth7_session_smoke/smoke.ts` | Smoke AUTH-7 — **50/50 PASS** (fresh DB). |
| `AUTH_7_SESSION_DISCOVERY.md` | Discovery (PO decision record, Opsi A/B/C, pertanyaan yang mengarah ke keputusan). |
| `RFC_AUTH_SESSION_PERSISTENCE.md` | RFC — status **APPROVED** (PO). |
| `WORK_ORDER_AUTH_7_SESSION_PERSISTENCE.md` | Laporan ini. |

### Dimodifikasi (7)
| File | Perubahan |
|------|-----------|
| `prisma/schema.prisma` | +`model AdminSession` (id, sessionId @unique, adminId FK Cascade, createdAt default, expiresAt) + back-relation `adminSessions AdminSession[]` pada `Admin`. |
| `src/main/services/session-manager.ts` | `open()` → **async**, param `persist = true` (false utk uji in-memory murni), tulis baris DB; `load()` baru (async, lazy, mirror null → `findLatestValid`); `close()` → **async**, hapus baris. Getter sinkron tidak berubah. Constructor kini `(repo: AdminSessionRepository)`. |
| `src/main/services/auth.service.ts` | `setup()/login()` → `await open(admin)`; `logout()` → `await close()`; `changePassword()`/`status()` memakai `ensureLoadedSession()` (mirror → cek TTL → `load()`). |
| `electron/main/bootstrap.ts` | `createContainer` kini `new SessionManager(new AdminSessionRepository())`. |
| `auth2_auth_smoke/smoke.ts` | STEP 3 `SessionManager` → `new SessionManager(new AdminSessionRepository())` + `await open(..., false)`/`await close()`; seluruh `service.logout()` di-`await` (menghilangkan race async delete vs `load()`). |
| `auth3_ipc_smoke/smoke.ts` | Constructor `new SessionManager(new AdminSessionRepository())`. |
| `auth6_change_password_smoke/smoke.ts` | Constructor + `await service.logout()` (race yang sama). |

### TIDAK diubah
- `electron/ipc/auth.ipc.ts`, `electron/preload/auth.preload.ts`, `src/renderer/env.d.ts`, `src/shared/dto/auth.ts` (kontrak IPC & DTO tetap — tidak ada perubahan API renderer)
- `src/main/services/password-hasher.ts`, `password-policy.ts`, `src/main/repositories/admin.repository.ts`, `src/shared/config/auth.ts`
- Renderer (LoginPage/SetupPage/AuthGate/ChangePasswordPage), routes, labels, sidebar
- Schema selain `AdminSession`/`Admin`, migration lain (baseline & AUTH-1 tidak disentuh)

## 3. Alur

1. **Setup/Login** → `AuthService.setup()/login()` → `await sessionManager.open(admin)` → prune expired → replace baris admin → buat baris `AdminSession` (token 43 char, `expiresAt = now + 24h`). Mirror in-memory di-set.
2. **Restart aplikasi** → proses baru punya mirror kosong. `AuthGate` memanggil `auth:status` → `AuthService.status()` → `ensureLoadedSession()` → mirror null → `load()` → `findLatestValid` (row `expiresAt > now`) → mirror dipulihkan → `authenticated: true`. Admin TIDAK perlu login ulang.
3. **Melewati 24 jam** (proses tetap hidup) → `ensureLoadedSession()` mendeteksi `expiresAt <= Date.now()` → `close()` → logout paksa. Bila proses restart setelah expiry → `load()` tidak menemukan row valid → `authenticated: false` (wajib login).
4. **Login ulang** saat session ada → replace baris (single admin, maksimal satu baris valid).
5. **Logout** → `close()` → mirror dikosongkan (efek langsung) + baris DB **dihapus** → restart apa pun tetap unauthenticated.
6. **ChangePassword** → session dipulihkan bila perlu, tetapi **TIDAK memperpanjang** TTL & **TIDAK menghapus** baris — session tetap valid (kontrak AUTH-6).

## 4. Validasi

| Gate | Hasil |
|------|-------|
| `npm run lint` | PASS (tsc node + web) |
| `npm run build` | PASS — main **2,065.28 kB** (+3.90 dari AUTH-6) · preload **11.46 kB** · renderer **`index-DpHV7Q6T.js` 1,214.51 kB — byte-identik rilis AUTH-6** (bukti tanpa perubahan renderer) |
| Smoke `auth7_session_smoke` | **50/50 PASS** (fresh DB) — config & token format 43 char base64url; kondisi awal; `open(persist=false)` in-memory tanpa FK; setup persist (count 1, DTO tanpa bocor sessionId, token regex); **restart simulation** `load()` memulihkan session (sessionId == row DB, username, expiresAt ~24 jam); `status()` auto-restore pada proses baru; login replace (count tetap 1, sessionId baru); changePassword menjaga session & row; logout menghapus row → `load()` null; **expired row ditolak** (load null, status false, login prune + buat baru); repo unit (findValidBySessionId match/miss, deleteBySessionId, deleteByAdminId, deleteExpired). |
| Regression AUTH | **222/222 PASS** — `auth2_auth_smoke` 69 · `auth3_ipc_smoke` 39 · `auth4_setup_smoke` 23 · `auth5_login_smoke` 42 · `auth6_change_password_smoke` 49 (fresh DB utk auth2/3/6; auth4/5 murni). Total AUTH = **272 PASS, 0 FAIL**. |
| `prisma migrate diff --from-migrations --to-schema-datamodel` | "This is an empty migration." (tidak ada drift; migration AUTH-7 murni additive) |
| `prisma migrate deploy` (fresh + dev) | PASS — 6 migrations applied; dev DB `aplibrary.db` up to date |
| Grep bundle main | `AdminSession` = 9 · `adminSession` = 9 · `auth:status` = 2 (channel utuh) — wiring ter-render. Renderer `SESSION_CONFIG` = 0 (config hanya dipakai main). |

## 5. Keputusan & Catatan

- **Opsi A (tabel SQLite) dipilih PO** di atas Opsi B (file JSON) & Opsi C (electron-store) — queryable, ter-enforce FK, konsisten dengan pola repositori/BaseRepository, dan siap untuk multi-user di masa depan (RFC §5.4).
- **TTL 24 jam absolute** — `expiresAt` ditetapkan saat `open()` dan tidak pernah diperpanjang (changePassword tidak menyentuh). Keputusan PO: simpel & aman, bukan sliding (RFC §5.1).
- **Selalu persist, tanpa Remember Me** — sesi login apa pun dipertahankan; tidak ada checkbox UI. Keputusan PO (RFC §5.2).
- **Logout = hapus baris**, bukan `revokedAt` — invarian "logout berarti session mati selamanya" dijaga oleh ketiadaan baris; `findLatestValid` cukup (single admin). Kolom `revokedAt`/`revalidatedAt` yang ada di draft RFC **dibuang** (refinement saat implementasi, terdokumentasi).
- **Token = opaque random 32-byte base64url**, bukan JWT — tidak bisa didekode klien, entropi 256-bit, unique index `sessionId`. DTO `AuthStatusDTO`/`AuthResultDTO` TIDAK membocorkan token/sessionId (di-smoke).
- **Mirror in-memory tetap sinkron-source** selama proses hidup (zero-await untuk AuthGate yang sudah terlanjur sinkron) — `load()` hanya fallback saat mirror kosong; TTL dua lapis (DB filter + cek mirror).
- **`persist=false`** ada semata-mata untuk smoke in-memory murni (auth2 STEP 3 memakai admin fiktif yang tidak ada di DB, sehingga FK tidak boleh disentuh). Produksi selalu `persist=true`.
- **Race async logout vs load** — karena `close()` kini async (delete row), pemanggil wajib `await` sebelum operasi yang bergantung (mis. `changePassword` yang bisa memicu `load()`). Diperbaiki di smoke (auth2/auth6); di aplikasi IPC `auth:logout` sudah di-await oleh `ipcMain.handle`.

## 6. Scope Discipline

- **TIDAK** mengubah kontrak IPC/preload/env.d.ts/DTO auth — renderer byte-identik; UI (checkbox, session info, lock screen) di luar scope.
- **TIDAK** menambahkan Scheduler/cleanup berkala — prune hanya saat login (`deleteExpired`), sesuai RFC.
- **TIDAK** migrasi multi-user, session listing, atau revoke dari sisi lain.
- Working tree berisi perubahan WO lain yang belum di-commit — **hanya file AUTH-7 yang ikut commit** (staging parsial, isolasi tree).
