# WORK_ORDER_LOGIN_PASSWORD_ONLY.md

**WO:** Login password-only — single-admin resolve (Opsi B).
**Status:** DONE - READY review PO. **Commit lokal, BELUM push** (menunggu instruksi).

---

## 1. Ringkasan

- **Login kini password-only**: field Username dihapus dari form Login; `AuthService.login()` tidak lagi memakai username untuk lookup.
- **Single-admin resolve (RFC §1.2)**: admin di-resolve langsung via `AdminRepository.findSingle()` — tabel admin invariant "maksimal satu baris" sehingga lookup username (case-insensitive) tidak lagi diperlukan.
- **Field `username` pada input `LoginAdminDTO` diabaikan oleh Service** — dipertahankan **opsional** (`username?: string`) agar kontrak IPC/preload/auth3 tetap kompatibel tanpa breaking change.
- **Deterministik**: `findSingle()` memakai `orderBy: { createdAt: 'asc' }` → bila invariant "satu admin" dilanggar (2+ baris), yang dikembalikan adalah admin pertama dibuat (bukan hasil tak terdefinisi).

## 2. Alasan (RFC §1.2)

`RFC_AUTH_SESSION_PERSISTENCE.md` menyatakan *"Single admin; maksimal satu session aktif per admin"* (RFC §1.2). Dengan hanya satu admin, **username bukanlah pembeda** — satu-satunya kredensial adalah password. Opsi B menghilangkan input username dari UX dan menghilangkan lookup username dari Service, menghapus dua permukaan (input form + query case-insensitive) yang tidak punya nilai karena invariant single-admin.

## 3. File

### Dimodifikasi (10)

| File | Perubahan |
|------|-----------|
| `src/shared/dto/auth.ts` | `LoginAdminDTO.username: string` → `username?: string` (opsional, kompatibilitas IPC). |
| `src/auth/login-validation.ts` | `validateLoginForm(password)` — hapus parameter & error `username`; hanya password divalidasi. |
| `src/main/repositories/admin.repository.ts` | +`findSingle()` — `findFirst({ orderBy: { createdAt: 'asc' } })`. |
| `src/main/services/auth.service.ts` | `login()`: `findByUsernameCaseInsensitive(input.username)` → `findSingle()`; username input diabaikan. |
| `src/pages/auth/LoginPage.tsx` | Hapus state/input/error username; kirim `auth.login({ password })`; `autoFocus` pindah ke password. |
| `auth2_auth_smoke/smoke.ts` | Login password-only + "username diabaikan tetap sukses" + assertion `findSingle` deterministik. |
| `auth3_ipc_smoke/smoke.ts` | IPC `auth:login` password-only + username-diabaikan. |
| `auth5_login_smoke/smoke.ts` | Validasi password-only; LoginPage tanpa field username; kirim `{ password }`. |
| `auth6_change_password_smoke/smoke.ts` | Login password-only; badge COMING_SOON sisa 1 (Reset Data). |
| `auth7_session_smoke/smoke.ts` | Seluruh login password-only. |

### Baru (1)

| File | Peran |
|------|-------|
| `WORK_ORDER_LOGIN_PASSWORD_ONLY.md` | Dokumen ini. |

### TIDAK diubah

- Schema, migration (`prisma migrate diff` = "This is an empty migration.").
- IPC handler, preload, `env.d.ts`, bootstrap — kontrak `auth:login` dipakai apa adanya (payload hanya menambah field opsional yang diabaikan).
- `SetupAdminDTO`, ChangePassword, Session, AuthGate, routing.
- `AdminRepository.findByUsernameCaseInsensitive` — **dipertahankan** (tidak dihapus; tidak lagi dipanggil dari `login()`).

## 4. Keputusan teknis

1. **DTO opsional, bukan breaking change** — `username?: string` tetap diterima IPC (`auth3` lama kompatibel), tapi Service mengabaikannya. Renderer tidak mengirimnya.
2. **`findSingle()` deterministik** — `createdAt asc` menjamin hasil stabil; komentar di repository mendokumentasikan invariant RFC §1.2.
3. **Pesan 401 seragam dipertahankan** — "Username atau password salah" tanpa perubahan (anti user-enumeration & timing, §11.2).
4. **Referensi RFC** — komentar source menyebut "RFC_AUTH_ARCHITECTURE.md §1.2"; file RFC yang benar adalah `RFC_AUTH_SESSION_PERSISTENCE.md` (nama `RFC_AUTH_ARCHITECTURE.md` tidak ada di repo). Referensi kode dipertahankan apa adanya (bukan bagian WO ini); dicatat sebagai debt dokumentasi kecil.

## 5. Validasi

| Gate | Hasil |
|------|-------|
| `npm run lint` | PASS (tsc node + web) |
| Smoke auth2 | **73/73 PASS** |
| Smoke auth3 | **40/40 PASS** |
| Smoke auth4 | **23/23 PASS** (regression, tidak berubah) |
| Smoke auth5 | **41/41 PASS** |
| Smoke auth6 | **49/49 PASS** |
| Smoke auth7 | **50/50 PASS** |
| Total smoke | **276 PASS, 0 FAIL** (fresh DB per suite, `prisma migrate deploy` 4 migration) |
| `prisma migrate diff` | "This is an empty migration." (schema tidak disentuh) |
| Working tree | 10 file termodifikasi + 1 dokumen baru; tanpa untracked lain |

## 6. Scope Discipline

- **TIDAK** menghapus `findByUsernameCaseInsensitive` (di luar scope, meski tak terpakai login).
- **TIDAK** mengubah setup admin, change password, session persistence, AuthGate, IPC/preload.
- **TIDAK** menambah multi-user/forgot password/remember me.
- Temp files debugging (`authsmoke`, `authdb`, `authgate-head.txt`, `wt_*`, `tsc-errors.txt`) dibersihkan; tidak ada yang ter-commit.
