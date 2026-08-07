# WORK_ORDER_AUTH_6_CHANGE_PASSWORD.md

**WO:** AUTH-6 — Ubah Password (Change Password).
**Status:** DONE - READY review PO. **BELUM commit/push** (menunggu review Product Owner).

---

## 1. Ringkasan

- **ChangePasswordPage fungsional** (route `/settings/change-password`): 3 field — Password Lama, Password Baru, Konfirmasi Password Baru — memakai `window.electronAPI.auth.changePassword({ currentPassword, newPassword })`. **confirmPassword adalah UI-only** (validasi renderer), tidak pernah dikirim ke main (kontrak DTO `ChangePasswordDTO` hanya 2 field).
- **Backend AUTH-2 sudah lengkap sejak awal** — AUTH-6 hanya konsumen UI:
  - `AuthService.changePassword` (`src/main/services/auth.service.ts:81-103`): butuh session aktif (`401 'Sesi tidak aktif'`), cek `'Password lama tidak sesuai'` (400), enforce `PASSWORD_POLICY` (`'Password minimal 8 karakter'` / `'Password maksimal 128 karakter'`), **session tetap aktif** setelah sukses.
  - Rantai IPC/preload/env.d.ts (`auth:changePassword`) sudah ada dan di-smoke di AUTH-2 (STEP 6). **Tidak diubah di AUTH-6.**
- **Validasi renderer murni** `src/auth/change-password-validation.ts`: Password Lama wajib (trim), Password Baru 8..128 (SSOT `PASSWORD_POLICY` dari `src/shared/config/auth.ts`), konfirmasi harus sama — pola persis `validateSetupForm` (mismatch hanya ter-trigger saat nilai berbeda, bukan saat keduanya kosong).
- **Error & success ditampilkan di halaman** (banner di dalam kartu), **tanpa `alert()`/`confirm()`**; error dibaca via kontrak `AuthErrorDTO` (`authErrorMessageOf`) **tanpa `instanceof Error`** (konsisten AUTH-5 REVISI 1).
- **Anti double-submit:** tombol disabled + spinner `Loader2 animate-spin` saat `submitting` + guard `if (submitting) return`.
- **Entry point di Settings:** kartu "Ubah Password" pada tab Keamanan kini `navigate(ROUTES.CHANGE_PASSWORD)` (badge `COMING_SOON` dihapus); kartu "Login Admin" **tetap** placeholder `COMING_SOON` (di luar scope).
- **Sukses:** pesan sukses di halaman + field di-reset (session tidak ditutup — pengguna tetap login).
- **BELUM TERMASUK:** Forgot/Reset Password, Multi User, Session Timeout, Lock Screen, Remember Me.

## 2. File

### Baru (4)
| File | Peran |
|------|-------|
| `src/auth/change-password-validation.ts` | Validasi form **murni renderer** (tanpa AuthService/Prisma/Electron) → `ChangePasswordFormErrors`; memakai `PASSWORD_POLICY` (SSOT). |
| `src/pages/auth/ChangePasswordPage.tsx` | Halaman Ubah Password penuh (3 field, loading, anti double-submit, error & success di halaman, back ke Settings, autoFocus Password Lama). |
| `auth6_change_password_smoke/smoke.ts` | Smoke AUTH-6 — **49/49 PASS** (Bagian A validasi murni 12, Bagian B service-level fresh DB 16, Bagian C kontrak UI 21). |
| `WORK_ORDER_AUTH_6_CHANGE_PASSWORD.md` | Laporan ini. |

### Dimodifikasi (4)
| File | Perubahan |
|------|-----------|
| `src/utils/labels.ts` | Blok `AUTH` + `CURRENT_PASSWORD`/`NEW_PASSWORD`/`ERR_CURRENT_PASSWORD_REQUIRED`/`CHANGE_PASSWORD_TITLE`/`CHANGE_PASSWORD_SUBTITLE`/`CHANGE_PASSWORD_BUTTON`/`CHANGE_PASSWORD_PROCESSING`/`CHANGE_PASSWORD_SUCCESS`/`CHANGE_PASSWORD_BACK`. |
| `src/utils/navigation.ts` | +`CHANGE_PASSWORD: '/settings/change-password'`. |
| `src/routes/index.tsx` | +route `settings/change-password` → `<ChangePasswordPage />`. |
| `src/pages/SettingsPage.tsx` | Kartu "Ubah Password" (tab Keamanan) → `onAction={() => navigate(ROUTES.CHANGE_PASSWORD)}`, **badge `COMING_SOON` dihapus**; kartu "Login Admin" **tidak disentuh** (tetap placeholder). |

### TIDAK diubah
- `src/main/services/auth.service.ts`, `src/main/services/password-policy.ts`, `src/main/services/session-manager.ts`
- `src/shared/dto/auth.ts` (DTO `ChangePasswordDTO` sudah ada), `src/shared/config/auth.ts` (`PASSWORD_POLICY` dibaca, tidak diedit)
- `electron/ipc/auth.ipc.ts`, `electron/preload/auth.preload.ts`, `src/renderer/env.d.ts`, `electron/main/bootstrap.ts`
- `LoginPage`, `SetupPage`, `AuthGate`, schema, migration

## 3. Alur

1. Settings → tab Keamanan → kartu "Ubah Password" → `navigate(ROUTES.CHANGE_PASSWORD)`.
2. User isi Password Lama / Password Baru / Konfirmasi → submit → `validateChangePasswordForm` (guard renderer murni; error per-field tampil di bawah input).
3. Valid → `window.electronAPI.auth.changePassword({ currentPassword, newPassword })` (confirmPassword TIDAK dikirim).
4. Sukses → `setChanged(true)` + banner sukses hijau di halaman + field di-reset (session tetap aktif — user tidak di-logout).
5. Gagal (reject) → `setSubmitError(authErrorMessageOf(err, SUBMIT_ERROR_DEFAULT))` — kontrak `AuthErrorDTO`, tanpa `instanceof Error`; tombol kembali aktif.

## 4. Validasi

| Gate | Hasil |
|------|-------|
| `npm run lint` | PASS (tsc node + web) |
| `npm run build` | PASS — main 2,061.38 kB · preload 11.46 kB · renderer `index-DpHV7Q6T.js` 1,214.51 kB |
| Smoke `auth6_change_password_smoke` | **49/49 PASS** — Bagian A (12): validasi form murni (lama wajib, min/max 8/128, mismatch, kombinasi, tanpa window/Electron). Bagian B (16, fresh DB): needsSetup→setup→logout→`changePassword tanpa session` ditolak `'Sesi tidak aktif'`→login ulang→password lama salah `'Password lama tidak sesuai'`→terlalu pendek/panjang→gagal tidak menutup session→sukses `ok:true`→session tetap aktif→login lama gagal `'Username atau password salah'`→login baru sukses→admin tetap 1 baris. Bagian C (21): ChangePasswordPage `auth.changePassword` + `validateChangePasswordForm` + `authErrorMessageOf` + tanpa `alert()` + tanpa `instanceof Error` + loading/disabled/spinner + guard double-submit + error/success di halaman + reset setelah sukses; SettingsPage navigasi `ROUTES.CHANGE_PASSWORD` + badge `COMING_SOON` tersisa **2** (Login Admin & Reset Data); route + label terpasang. |
| Regression AUTH | **134/134 PASS** — `auth2_auth_smoke` 69 · `auth4_setup_smoke` 23 · `auth5_login_smoke` 42 (fresh DB untuk auth2; auth4/auth5 murni). |
| Grep bundle renderer | `settings/change-password`=2 · `Ubah Password`=2 · `Password Lama`=2 · `Password Baru`=1 · `Simpan Perubahan`=3 · pesan mismatch=1 — ter-render. |
| `prisma migrate diff` | "This is an empty migration." (schema tidak disentuh) |

## 5. Keputusan & Catatan

- **Konfirmasi password = UI-only.** DTO `ChangePasswordDTO` hanya `{ currentPassword, newPassword }` (AUTH-2). Renderer menjalankan cek kecocokan sendiri; tidak ada field `confirmPassword` di payload IPC.
- **Session tidak ditutup saat sukses** (perilaku `AuthService.changePassword` yang sudah ada). Setelah ganti password, pengguna langsung bisa memakai password baru pada login berikutnya (dibuktikan smoke Bagian B).
- **Pola validasi konsisten `validateSetupForm`:** mismatch `newPassword !== confirmPassword` tidak ter-trigger saat kedua field kosong (kosong sudah ditangkap `ERR_CURRENT_PASSWORD_REQUIRED` / `ERR_PASSWORD_MIN`) — selaras dengan konvensi AUTH-4; smoke meng-assert perilaku ini.
- **Pesan hardcoded backend tidak diubah** (`'Sesi tidak aktif'`, `'Password lama tidak sesuai'`, `'Password minimal 8 karakter'`, `'Password maksimal 128 karakter'`, `'Username atau password salah'`) — smoke Bagian B membuktikan kontrak tetap.
- **Renderer tetap tanpa business logic auth** (RFC §1.4): halaman hanya memanggil IPC; validasi adalah guard UX, kebenaran final di main (`password-policy.ts`).

## 6. Scope Discipline

- **TIDAK** menyentuh AUTH-2 (AuthService/Session/password-policy), AUTH-3 (IPC/preload/env.d.ts/bootstrap), AUTH-4 (AuthGate/Login/Setup) — bundle main & preload **identik** baseline AUTH-5 (lint build delta: main/preload tidak berubah; hanya renderer yang bertambah).
- **TIDAK** Forgot/Reset Password, Multi User, Session Timeout, Lock Screen, Remember Me.
- **TIDAK** mengubah schema, migration, DTO auth, `PASSWORD_POLICY`.
- Working tree berisi perubahan WO lain yang belum di-commit — **TIDAK** ikut commit AUTH-6.
