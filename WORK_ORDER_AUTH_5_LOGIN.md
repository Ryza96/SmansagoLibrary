# WORK_ORDER_AUTH_5_LOGIN.md

**WO:** AUTH-5 — Login Experience.
**Status:** DONE - READY review PO (setelah REVISI 1 & REVISI 2). **BELUM commit/push** (menunggu review Product Owner).

---

## 1. Ringkasan

- **LoginPage fungsional** (route `/login`): field Username + Password, tombol **Masuk**, memakai `window.electronAPI.auth.login()`; sukses → refresh status (AuthGate `navigate('/')` → Dashboard); gagal → pesan dari AuthService ditampilkan **di halaman** (bukan `alert()`).
- **REVISI 1 — kontrak error DTO, tanpa `instanceof Error`:** renderer membaca pesan error melalui kontrak **`AuthErrorDTO`** (`message`, `code?`) lewat helper murni `authErrorMessageOf`/`authErrorCodeOf`/`authErrorPayload`. Tidak ada dependensi pada `instanceof Error` di LoginPage maupun TopBar.
- **REVISI 2 — Logout di TopBar (Account Action):** menu Logout dipindah dari Sidebar ke **TopBar** (ikon `LogOut`, `title` "Logout", dekat area user + tombol Settings) → `auth.logout()` → `refreshStatus()` → AuthGate `authenticated=false` → `navigate('/login')`. **Sidebar hanya berisi navigasi aplikasi.**
- **Loading state:** tombol disabled + spinner (`Loader2 animate-spin`) + guard `if (submitting) return` (no double submit).
- **Error state:** banner merah di dalam kartu (via `setSubmitError`); logout gagal → `notify.error()` (toast NS-1).
- **AuthGate TETAP penentu utama:** `auth.status()` → `navigate('/')` (Dashboard) atau `navigate('/login')`; tidak ada perubahan arsitektur AUTH-4.
- **BELUM TERMASUK:** Change Password, Forgot Password, Remember Me, Multi User, Session Timeout, Lock Screen.

## 2. File

### Baru (3)
| File | Peran |
|------|-------|
| `src/auth/login-validation.ts` | Validasi login **murni renderer** (username trim non-kosong, password non-kosong) → `LoginFormErrors`. Tanpa akses AuthService/Prisma/Repository/SessionManager (RFC §1.4). |
| `src/auth/auth-error.ts` | Helper kontrak error DTO (REVISI 1): `authErrorPayload`/`authErrorMessageOf`/`authErrorCodeOf` — membaca `message` (dan `code` bila tersedia) dari nilai reject apa pun **tanpa `instanceof Error`**. Murni renderer. |
| `auth5_login_smoke/smoke.ts` | Smoke validasi + assertion kontrak UI/arsitektur (REVISI) — **42/42 PASS**. |

### Dimodifikasi (4)
| File | Perubahan |
|------|-----------|
| `src/shared/dto/auth.ts` | +`AuthErrorDTO { message; code? }` (kontrak error AUTH untuk renderer — aditif, tipe saja). |
| `src/pages/auth/LoginPage.tsx` | Placeholder → form login penuh; catch memakai `authErrorMessageOf` (REVISI 1). |
| `src/components/layout/TopBar.tsx` | +Account Action **Logout** (REVISI 2): `handleLogout` via `useAuthGate().refreshStatus` + `useNotification`, ikon `LogOut`, loading state; error via `authErrorMessageOf`. |
| `src/utils/labels.ts` | +`LOGIN_BUTTON`/`LOGIN_PROCESSING`/`ERR_PASSWORD_REQUIRED`/`LOGOUT`/`LOGOUT_FAILED`; **hapus** `LOGIN_COMING_SOON` (tidak lagi dipakai). |

### Direvert (REVISI 2)
| File | Perubahan |
|------|-----------|
| `src/components/layout/Sidebar.tsx` | Logout DIHAPUS total (icon `LogOut`, `useAuthGate`, `useNotification`, `handleLogout`, tombol `mt-auto`) — kembali murni navigasi aplikasi. |

## 3. Alur

### Login
1. `LoginPage` submit → `validateLoginForm` (guard renderer murni) → `window.electronAPI.auth.login({ username, password })`.
2. Sukses → `await refreshStatus()` (AuthGate re-read `auth.status()` → `authenticated=true`) → AuthGate `navigate('/', { replace: true })` → Dashboard.
3. Gagal (reject) → `setSubmitError(authErrorMessageOf(err, SUBMIT_ERROR_DEFAULT))` — kontrak `AuthErrorDTO`, tanpa `instanceof Error`; tombol kembali aktif.

### Logout (TopBar — Account Action)
1. TopBar `handleLogout` → `window.electronAPI.auth.logout()`.
2. `await refreshStatus()` → AuthGate `authenticated=false` → `navigate('/login')`.
3. Gagal → `notify.error(authErrorMessageOf(err, LOGOUT_FAILED))` — toast NS-1, tanpa `alert()`.

## 4. Validasi

| Gate | Hasil |
|------|-------|
| `npm run lint` | PASS (tsc node + web) |
| `npm run build` | PASS — main 2,061.38 kB · preload 11.46 kB · renderer `index-DC9zGA2b.js` 1,206.62 kB |
| Smoke `auth5_login_smoke` (REVISI) | **42/42 PASS** (validasi login; kontrak `AuthErrorDTO` [message/code/fallback/non-objek/null/Error-tanpa-instanceof]; LoginPage `auth.login` + `authErrorMessageOf` + tanpa alert/confirm + loading + **tanpa `instanceof Error`**; TopBar `auth.logout` + label + `LogOut` + tanpa `instanceof Error`; Sidebar tanpa Logout/useAuthGate/useNotification/mt-auto; AuthGate tetap penentu; scope exclusion tanpa remember/forgot/change-password) |
| Grep bundle renderer | `auth.login`=4 · `auth.logout`=3 · `Memverifikasi`=1 · `Gagal logout.`=1 |
| Grep source | `instanceof Error` di LoginPage=0 · TopBar=0 · `auth.logout` di Sidebar=0 |
| `prisma migrate diff` | "This is an empty migration." (schema tidak disentuh) |

## 5. Revisi (Review PO)

### REVISI 1 — Renderer tanpa `instanceof Error`
- **Kontrak:** `src/shared/dto/auth.ts` +`AuthErrorDTO { message: string; code?: string }` — shape yang dibaca renderer dari nilai reject apa pun (Electron menyampaikan Error ber-`.message`; `.code` opsional bila main menyediakannya).
- **Helper:** `src/auth/auth-error.ts` — `authErrorMessageOf(err, fallback)` / `authErrorCodeOf(err)` / `authErrorPayload(err)`. Type guard struktural (`typeof err === 'object' && err !== null` + `message` string non-empty), **bukan** `instanceof Error`.
- **Konsumen:** LoginPage (login gagal) & TopBar (logout gagal).
- **Scope:** `AuthErrorDTO` hanyalah tipe aditif di shared DTO — AUTH-2 (AuthService/Session), AUTH-3 (IPC/preload/env.d.ts), AUTH-4 (AuthGate/routing) **TIDAK diubah** (bundle main & preload byte-identik baseline AUTH-5 rilis).

### REVISI 2 — Logout di TopBar (Account Action)
- Logout dipindah dari Sidebar → TopBar, diletakkan di area akun (sebelah ikon User + tombol Settings, sebelum window controls), `title` memakai `LABELS.AUTH.LOGOUT`.
- Sidebar dikembalikan menjadi **navigasi aplikasi murni** (tanpa auth/notification imports, tanpa action bawah `mt-auto`).
- Logika logout identik (kontrak `auth.logout()` → `refreshStatus()` → AuthGate redirect ke `/login`); hanya lokasi UI yang berubah.

## 6. Scope Discipline

- **TIDAK** menyentuh AUTH-2 (AuthService/Session) & AUTH-3 (IPC/preload) — kontrak `electronAPI.auth.login/logout` dipakai apa adanya; bundle main/preload identik baseline.
- **TIDAK** Change Password, Forgot Password, Remember Me, Multi User, Session Timeout, Lock Screen.
- **TIDAK** mengubah `AuthGate`, `src/routes/index.tsx`, schema, migration.
- Working tree berisi perubahan WO lain yang belum di-commit — **TIDAK** ikut commit AUTH-5.
