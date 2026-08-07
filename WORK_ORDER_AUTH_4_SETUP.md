# WORK_ORDER_AUTH_4_SETUP.md

**WO:** AUTH-4 — Initial Setup Wizard (SetupPage) + AuthGate bootstrap redirect.
**Status:** DONE - READY review PO (revisi minor DITERAPKAN, tidak lanjut AUTH-5). **BELUM commit/push** (sesuai instruksi PO).

---

## 0. Revisi PO (DITERAPKAN)

- **Sebelum:** `AuthGate` merender langsung `SetupPage`/`LoginPage` di luar router (belum ada RouterProvider aktif saat belum login).
- **Revisi:** SetupPage & LoginPage **HARUS menjadi route** — terdaftar `/setup` & `/login`. `AuthGate` menjadi **pathless layout guard** di root router, **hanya menentukan navigasi** via `navigate()`:
  - `needsSetup=true` → `navigate('/setup')`
  - `authenticated=false` → `navigate('/login')`
  - `authenticated=true` → aplikasi normal (keluar `/setup`/`/login` bila berada di sana)
- **Tujuan PO:** semua halaman auth tetap di dalam Router — AUTH-5/6/7 bisa dilanjutkan tanpa mengubah arsitektur.
- **Kontrak AUTH-2 & AUTH-3 TIDAK diubah.**

---

## 1. Ringkasan

- **Keputusan PO (via pertanyaan):** buat **LoginPage placeholder minimal** (tanpa form/fungsionalitas login) karena repo belum punya LoginPage/SetupPage sama sekali. Placeholder menampilkan teks "Halaman login akan tersedia pada tahap berikutnya." — form login & arah `authenticated=false` penuh adalah WO berikutnya.
- **Lingkup AUTH-4:** renderer-only. Panggil `window.electronAPI.auth.status()` saat bootstrap → arahkan: `needsSetup=true` → SetupPage; `authenticated=false` → LoginPage (placeholder); `authenticated=true` → aplikasi (RouterProvider). SetupPage memvalidasi UI (username wajib, password 8–128, konfirmasi cocok), memanggil `auth.setup()`, lalu auto-login (status disegarkan → dashboard).
- **TIDAK diubah:** AUTH-2 (AuthService/Session), AUTH-3 (IPC/preload bridge), schema/migration, backend main/preload, `src/routes/index.tsx` (router tidak disentuh), forgot/reset/change-password UI, multi-user, role, audit, route guard penuh.

## 2. File

### Baru (5)
| File | Peran |
|------|-------|
| `src/auth/setup-validation.ts` | Validasi form **murni renderer** (username trim non-kosong, password min 8 / max 128, confirm === password) → `SetupFormErrors`. Tanpa akses AuthService/Prisma/Repository/SessionManager (RFC §1.4). |
| `src/auth/AuthGate.tsx` | **Pathless layout guard** di root router (route `element: <AuthGate />`): baca `auth.status()` → splash loading / retry saat error; **hanya navigasi** `navigate('/setup')` / `navigate('/login')` / `navigate('/')`; render `<Outlet />`; expose `AuthGateContext.refreshStatus()` untuk SetupPage. |
| `src/pages/auth/SetupPage.tsx` | Route `/setup` — form setup (Username*, Password*, Konfirmasi Password*), error per-field, banner error, tombol "Buat Admin & Masuk" + state processing; sukses → `auth.setup()` → `refreshStatus()` (auto-login, AuthGate menavigasi ke dashboard). |
| `src/pages/auth/LoginPage.tsx` | Route `/login` — placeholder login (tanpa form) per keputusan PO. |
| `auth4_setup_smoke/smoke.ts` | Smoke validasi murni + assertion arsitektur revisi, tanpa DB/Electron — **23/23 PASS**. |

### Dimodifikasi (5)
| File | Perubahan |
|------|-----------|
| `src/routes/index.tsx` | Router dibungkus root guard: `{ element: <AuthGate />, children: [ {path:'/setup', element:<SetupPage/>}, {path:'/login', element:<LoginPage/>}, {path:'/', element:<AppLayout/>, children:[...existing...]} ] }`. |
| `src/renderer/App.tsx` | `NotificationProvider` → `RouterProvider router` (AuthGate kini di dalam router). |
| `src/utils/labels.ts` | +blok `AUTH` (15 label). |
| `tsconfig.web.json` | +include `src/auth/**/*`. |
| `tailwind.config.js` | +content `./src/auth/**/*.{js,ts,jsx,tsx}`. |

## 3. Alur Bootstrap (revisi — semua halaman auth di dalam Router)

1. `main.tsx` → `App` → `NotificationProvider` → `RouterProvider router`.
2. Router root = **pathless layout guard** `AuthGate` → `auth.status()` saat mount.
3. Status `null` → splash "Memuat..." (Outlet belum dirender); error → "Gagal memuat status autentikasi." + tombol "Coba Lagi".
4. `needsSetup=true` → `navigate('/setup')` (route `/setup` → `SetupPage`).
5. `needsSetup=false` && `authenticated=false` → `navigate('/login')` (route `/login` → `LoginPage` placeholder).
6. `authenticated=true` → aplikasi normal (`AppLayout` + halaman); bila berada di `/setup`/`/login` → `navigate('/')`.

Setup sukses → `auth.setup()` me-login otomatis (kontrak AUTH-3 mengembalikan `AuthResultDTO` dan sesi aktif) → `refreshStatus()` (via `AuthGateContext`) → `authenticated=true` → AuthGate `navigate('/')` → dashboard. Renderer **tidak pernah** mengakses `AuthService`/Prisma/Repository/SessionManager — hanya `window.electronAPI.auth.*`.

## 4. Validasi

| Gate | Hasil |
|------|-------|
| `npm run lint` | PASS (tsc node + web) |
| `npm run build` | PASS — main 2,061.38 kB · preload 11.46 kB · renderer `index-Iy0tLeL0.js` 1,201.00 kB |
| Smoke `auth4_setup_smoke` | **23/23 PASS** (STEP 1–8 validasi murni; STEP 9 arsitektur revisi: route `/setup` & `/login` terdaftar, `AuthGate` root guard, TIDAK merender SetupPage/LoginPage langsung, navigasi via `navigate()` + `<Outlet />`) |
| Grep bundle renderer | `Setup Awal Admin`=1 · `Halaman login akan tersedia pada tahap berikutnya.`=1 · `/setup`=6 · `/login`=6 · `needsSetup`=3 · `authenticated`=3 |
| `prisma migrate diff` | "This is an empty migration." (schema tidak disentuh) |

**Catatan bundle:** main & preload byte-size di atas mengikuti baseline terakhir; perbedaan dari baseline AUTH-3/WO-6 berasal dari perubahan WO lain yang **belum di-commit** di working tree (setting service/logo/dll) — AUTH-4 hanya menyentuh renderer (`src/auth`, `src/pages/auth`, `src/routes/index.tsx`, `App.tsx`, labels, tsconfig, tailwind), tidak ada perubahan main/preload.

## 5. Keputusan & Catatan

- **LoginPage placeholder** (PO approved): tanpa form — menghindari UI login non-fungsional sebelum kontrak login diwarnai.
- **Route `/setup` & `/login` didaftarkan di `src/routes/index.tsx`** (revisi PO) — seluruh halaman auth berada di dalam Router; `AuthGate` adalah **pathless layout guard** yang hanya menavigasi berdasarkan `auth.status()` dan merender `<Outlet />`. Menghindari flash konten salah rute dengan splash "Memuat..." selama status belum siap / sedang redirect (guard render-gate).
- **`AuthGateContext.refreshStatus()`** — SetupPage memicu re-read `auth.status()` setelah setup sukses; AuthGate lalu `navigate('/')` (auto-login ke dashboard). Tanpa ini, state `needsSetup` yang lama akan men-redirect balik ke `/setup`.
- **Validasi UI = renderer pure** (`validateSetupForm`) — headless-testable, tanpa IO; guard keamanan final tetap di Main Process (AUTH-2/AUTH-3), bukan di renderer.
- **`noValidate`** pada form — validasi via `validateSetupForm` (konsisten pola form eksisting), bukan browser-native.
- `autoComplete="new-password"` pada password setup; `autoFocus` pada username.

## 6. Scope Discipline

- **TIDAK** menyentuh AUTH-2 (AuthService/Session/Argon2id) & AUTH-3 (IPC/preload) — kontrak `electronAPI.auth` dipakai apa adanya.
- **TIDAK** `forgot`, reset, change-password UI, multi-user, role, audit trail, route guard penuh (halaman lain tetap dirender AuthGate sebagai guard, belum per-route).
- Hanya `src/routes/index.tsx` yang ditambah (root guard + 2 rute); `AppLayout`, Sidebar, dan halaman lain TIDAK dimodifikasi.
- Working tree berisi perubahan WO lain yang belum di-commit — **TIDAK** ikut commit AUTH-4.
