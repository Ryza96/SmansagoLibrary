# WORK ORDER AUTH-3 — Wiring IPC Auth

Status: DONE — menunggu review PO (tidak lanjut WO berikutnya).

## Ringkasan

- Source of Truth: `RFC_AUTH_ARCHITECTURE.md` (SSOT, APPROVED & LOCKED) §4.1/§4.4 + keputusan PO (API di-expose sebagai **`window.electronAPI.auth`**, bukan `window.api.auth` — instruksi literal dibatalkan demi konsistensi RFC §4.4 & seluruh domain).
- Scope AUTH-3: **wiring IPC / preload / env.d.ts** di atas `AuthService` (AUTH-2, ter-commit `efc73b8`). **TANPA** UI, route guard, TopBar, bootstrap guard, perubahan schema/migration/service.

## File

| File | Perubahan |
|------|-----------|
| `electron/ipc/auth.ipc.ts` | **BARU** — `registerAuthHandlers(service: AuthService): void`, 5 channel `auth:status/setup/login/logout/changePassword` (RFC §4.1), async pass-through tanpa try/catch (error AppError lolos ke wrapper Electron) |
| `electron/preload/auth.preload.ts` | **BARU** — `authAPI.auth.*`, `ipcRenderer.invoke`, input **ber-tipe DTO** (`SetupAdminDTO`/`LoginAdminDTO`/`ChangePasswordDTO`) |
| `electron/preload/index.ts` | `import { authAPI }` + `...authAPI` di `electronAPI` (contextBridge `window.electronAPI.auth.*`) |
| `electron/ipc/index.ts` | +import type `AuthService`, +`registerAuthHandlers`, +field `authService` di signature, +pemanggilan |
| `electron/main/bootstrap.ts` | Container +`authService`; instantiasi `new AuthService(new AdminRepository(), new PasswordHasher(), new SessionManager())` |
| `src/renderer/env.d.ts` | blok `auth` (5 method) bertipe dari `src/shared/dto/auth` |

TIDAK diubah: schema/migration, `AuthService`, DTO, config, errorHandler, UI/routes/sidebar/labels, renderer lain.

## Keputusan

1. **Exposure = `window.electronAPI.auth`** — keputusan PO; konsisten RFC §4.4 (`...authAPI` di spread `electronAPI`) & seluruh domain eksisting.
2. **Preload ber-tipe DTO** — mengikuti pola `report.preload.ts` (bukan `Record<string, unknown>` ala enrollment) agar kontrak DTO AUTH-2 dipakai di kedua sisi IPC.
3. **Handler pass-through murni** — seluruh guard & validasi di `AuthService` (Main = penegak keamanan, renderer hanya UX, RFC §1.4). Error (AppError `statusCode`+`type`+`message`) sengaja tidak di-catch; renderer menerima `Error` dengan `message` dari service.
4. **Secret tidak pernah keluar Main** (RFC §1.4/§11.3) — handler mengembalikan DTO (`AuthStatusDTO`/`AuthResultDTO`/`AuthOkDTO`) tanpa `passwordHash`/`sessionId`; dibuktikan smoke.

## Validation PASS

1. Smoke `auth3_ipc_smoke/smoke.ts` **39/39** (fresh DB temp, 5 migration):
   - Kontrak channel: persis 5 `auth:*`, tanpa channel non-auth.
   - Handler pass-through dengan service asli: status (DB kosong), setup, setup ulang → AppError 400 `Setup admin sudah pernah dilakukan`, login salah → 401 `Username atau password salah`, changePassword tanpa session → 401 `Sesi tidak aktif`, login case-insensitive, logout idempoten.
   - **AppError propagation**: statusCode (400/401) + message lolos handler utuh (handler tidak menelan/mengubah error).
   - Kontrak preload: 5 panggilan `invoke` dengan channel & argumen yang tepat; **tidak ada `passwordHash`/`sessionId` di argumen IPC**.
   - Teknik smoke: mock `electron` via override `Module._load` (Node 22: `require('module')` mengembalikan class Module — assignment `_load` writable; `import * as Module from 'module'` meng-emit namespace object getter-only → dilarang), lalu `createRequire` dinamis untuk `auth.ipc.ts`/`auth.preload.ts` ASLI.
2. `npm run lint` PASS (tsc node+web).
3. `npm run build` PASS — main **2,061.38 kB** (+15.05 dari WO-6 baseline 2,046.33 = AuthService+Argon2id+IPC), preload **11.46 kB** (+0.47 = authAPI), renderer 1,190.50 kB (perubahan dari WO lain uncommitted, bukan AUTH-3).
4. Grep bundle: `auth:status`×2, `auth:setup/login/logout/changePassword`×1 di main; masing-masing ×1 di preload.
5. `prisma migrate diff --from-migrations --to-schema-datamodel` = "This is an empty migration." (schema tidak disentuh).

## Pelajaran (retain)

- **Mocking `electron` untuk uji IPC headless**: di Node 22, `Module._load` writable HANYA bila diambil dari class Module via `require('module')`. `import * as Module from 'module'` di-emit tsc commonjs sebagai namespace object (`#<Object>`) dengan `_load` getter-only → assignment TypeError. Pola: `createRequire(__filename)('module')`, simpan `originalLoad`, override dengan guard `request === 'electron'` → `fakeElectron`, lalu `createRequire` dinamis require `auth.ipc.ts`/`auth.preload.ts` (file asli hasil tsc) **setelah** hook dipasang.
- **Handler pass-through harus benar-benar tidak menangkap error** — buktikan smoke: AppError `statusCode`+`message` yang dilempar service tetap utuh setelah melewati `ipcMain.handle`. Ini satu-satunya kontrak error ke renderer (electron serialize `Error.message` saja).
- **Preload typed DTO** memberi kontrak dua arah: renderer compile-check signature, main menerima input yang sudah dinormalisasi tipe — pattern baru lebih kuat daripada `Record<string, unknown>` (pola lama enrollment dipertahankan apa adanya, bukan ditarik balik).
- **Secret-guard diuji pada dua level**: (1) DTO hasil handler tidak punya `passwordHash`/`sessionId`; (2) argumen `invoke` (payload yang dikirim renderer→main) juga tidak memuat secret — seluruh key argumen hanya `username`/`password`/`currentPassword`/`newPassword`/`setup` dll (input kredensial memang dikirim, itu wajar; yang dilarang keluar = hash & session).
- **Ukuran bundle bukti wiring**: main & preload naik persis sesuai modul yang di-wire; renderer tidak boleh berubah oleh WO backend-only. Bila renderer berubah tanpa alasan, cek scope.
- **`auth:status`×2 di bundle main** wajar (string muncul di registrasi + lokasi lain) — verifikasi kontrak = semua 5 channel hadir, bukan hitungan eksak.
