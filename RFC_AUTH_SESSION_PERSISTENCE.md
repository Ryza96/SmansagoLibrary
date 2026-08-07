# RFC_AUTH_SESSION_PERSISTENCE.md

**RFC:** AUTH-7 — Session Persistence.
**Status:** **DRAFT — menunggu persetujuan Product Owner.** Belum ada implementasi.
**Source of Truth:** `AUTH_7_SESSION_DISCOVERY.md` (DISCOVERY, READ ONLY), `RFC_AUTH_ARCHITECTURE.md` (v1, K4 yang direvisi).

---

## 1. Objective

Agar session admin **bertahan setelah aplikasi di-restart** (revisi keputusan K4 v1: "in-memory, tanpa persist"). Tujuan teknis:

1. Login sekali → restart aplikasi → tetap terautentikasi (tanpa input ulang).
2. Keamanan tidak menurun: token tidak pernah keluar dari Main, ada batas waktu (TTL), re-validasi di setiap `auth:status`.
3. Tidak mengubah UX/behavior AUTH-1..AUTH-6 yang sudah rilis (kecuali efek samping yang diinginkan: tidak perlu login ulang setelah restart).
4. Perubahan **aditif & minimal** terhadap stack: Prisma/SQLite, Repository pattern, IPC contract, renderer contract.

## 2. Scope

### Termasuk
- Tabel session persist + repository + config TTL + re-validasi + lifecycle (restore, logout, ubah password).
- Perubahan `SessionManager`, `AuthService`, `bootstrap`.
- Smoke + regression.

### Bukan termasuk (backlog, tetap di luar scope)
- Auto Lock / idle-timeout (RFC_AUTH_ARCHITECTURE §11.5, backlog AUTH-5).
- Multi-user / role / permission.
- Forgot/Reset password, rate-limit/lockout.
- `requestSingleInstanceLock` (diluar scope, dicatat).
- Remember Me checkbox (opsional — keputusan PO di AUTH-7C).
- Relokasi DB ke `userData/database` (ADR-001 §8.2 Q2–Q5, WO terpisah).

## 3. Current Architecture

Ringkasan (detail di `AUTH_7_SESSION_DISCOVERY.md` §3):

- `SessionManager` (`src/main/services/session-manager.ts`) — **in-memory murni**: `open/get/currentAdmin/close/isAuthenticated`; `sessionId = randomUUID()`; replace saat login ulang. **Tidak persist** (K4).
- `AuthService` (`src/main/services/auth.service.ts`) — `status()` mengembalikan `authenticated` dari kehadiran session; `setup`/`login` → `open()`; `logout` → `close()`; `changePassword` → session tetap aktif.
- `Admin` (`prisma/schema.prisma:298-308`) + migration `20260807_auth1_admin`; `AdminRepository` (count/create/findById/findByUsernameCaseInsensitive/updatePassword/updateLastLogin).
- Wiring: `electron/main/bootstrap.ts:241` — `new AuthService(new AdminRepository(), new PasswordHasher(), new SessionManager())`, dibuat fresh tiap proses; startup `electron/main/index.ts:43-77`.
- IPC/preload: 5 channel `auth:*`, pass-through; renderer tidak memegang token (RFC §1.4/§3.2).
- Renderer: `AuthGate` navigasi berdasar `auth:status`; Login/Setup/ChangePassword = UX murni, tanpa `localStorage`.

## 4. Discovery

### 4.1 Masalah
- Session hilang setiap restart → admin wajib login ulang tiap membuka aplikasi (RFC v1 K4, disadari & disengaja). PO meminta revisit.

### 4.2 Prinsip yang harus dijaga (dari RFC v1)
- Main Process = satu-satunya penegak keamanan; renderer tidak pernah memegang kredensial (token).
- Single admin; maksimal satu session aktif per admin.
- Tanpa secret baru yang perlu dikelola pengguna; tanpa JWT/secret-file.

### 4.3 Kesimpulan discovery
- Token = **opaque random** (bukan JWT). Media persist terbaik = **tabel SQLite** (konsisten stack) atau **file terenkripsi safeStorage** (tanpa migration). Lihat `AUTH_7_SESSION_DISCOVERY.md` §4.3 untuk perbandingan 9 opsi.

## 5. Alternative Design

### Opsi A (REKOMENDASI) — Tabel `AdminSession` di SQLite (Prisma)

**Schema (aditif):**
```prisma
model AdminSession {
  id            String    @id @default(uuid())
  sessionId     String    @unique   // opaque token 32-byte base64url, atau UUID v4
  adminId       String
  admin         Admin     @relation(fields: [adminId], references: [id], onDelete: Cascade)
  createdAt     DateTime  @default(now())
  expiresAt     DateTime  // = createdAt + TTL (config)
  revokedAt     DateTime? // null = aktif
  revalidatedAt DateTime  @default(now()) // di-bump saat ubah password / renewal
  @@index([adminId])
  @@index([expiresAt])
}
```
- Migration: satu `CREATE TABLE` + index (pola persis AUTH-1). **Tanpa ALTER tabel lain; tanpa kolom baru di `Admin`** (reuse `passwordChangedAt` bila multi-session nanti).
- `Admin` mendapat back-relation `adminSessions` (opsional).

**Config (`src/shared/config/session.ts`, leaf node):**
```ts
export const SESSION_CONFIG = {
  tokenBytes: 32,          // randomBytes → base64url
  ttlHours: 24,            // absolute TTL
} as const
```

**Repository (`AdminSessionRepository extends BaseRepository`):**
- `create(adminId, token, expiresAt)` → row.
- `findValidById(sessionId)` → row aktif (join `admin`, filter `revokedAt IS NULL` + `expiresAt > now`).
- `deleteBySessionId(sessionId)` (logout).
- `deleteExpired()` (prune saat login).
- `touch(sessionId, now)` (bump `revalidatedAt` — opsional sliding renew).

**SessionManager (refactor, kontrak lama dipertahankan):**
- Di-construct dengan `AdminSessionRepository`.
- `open(admin)` → simpan mirror in-memory (seperti sekarang) + **`await repo.create`** (persist). API berubah asinkron (guard: caller yang memanggil).
- `load()` baru — baca+re-validasi row, isi mirror bila valid; dipanggil bootstrap atau lazy di `AuthService.status`.
- `close()` → `await repo.deleteBySessionId` + kosongkan mirror.
- `currentAdmin()/get()/isAuthenticated()` → tetap sinkron, baca mirror (speed; sumber kebenaran = mirror + DB selaras).

**AuthService:**
- `status()` → `session = sessionManager.get() ?? await sessionManager.load()`; hasil re-validasi menentukan `authenticated`. (`load` memanggil `findValidById`.)
- `login()` → `deleteExpired()` lalu `open(admin)` (persist).
- `setup()` → `open(admin)` (persist).
- `logout()` → `close()` (hapus row) → `{ ok: true }`.
- `changePassword()` → update hash + `touch(currentSessionId)` — **session aktif tetap valid** (AUTH-6).

**IPC/Preload/env.d.ts:** **tanpa channel baru.** Restore terjadi via `auth:status` yang sudah ada. DTO `AuthStatusDTO` tidak berubah (opsional +`expiresAt` di AUTH-7C).

**Bootstrap:** `electron/main/bootstrap.ts` — instantiasi `AdminSessionRepository`, injeksi ke `SessionManager`; panggil `sessionManager.load()` di startup (dapat juga lazy di `auth:status` pertama).

### Opsi B — Encrypted session file (Electron `safeStorage`)
- File JSON terenkripsi di `paths.settingsDir/session.bin` (folder `settings` sudah ada di infra WO-1).
- `SessionStore` di `src/main/infrastructure/` (pola paths/directory-manager) + `SessionManager` membaca/ menulis.
- `safeStorage.encryptString/decryptString` (DPAPI di Windows — target win32).
- **Tanpa migration/schema**; **tidak ikut backup DB** (restore tidak menghidupkan session).
- Trade-off: sub-sistem file baru (tulis atomik + lock), platform caveat (Linux keyring), re-validasi tetap via lookup `Admin`.

### Opsi lain (dibahas discovery, ditolak/deprioritas)
- electron-store (dependency + plaintext), OS Credential Manager (keytar deprecated), JWT/HMAC (over-engineer + secret management), localStorage renderer (DILARANG), cookie persist partition (salah alat), file plaintext (tanpa enkripsi).

## 6. Recommendation

**Terapkan Opsi A (tabel `AdminSession` SQLite).** Alasan:

1. **Konsistensi.** Seluruh persistensi aplikasi memakai Prisma/SQLite; tidak menambah sub-sistem atau dependency.
2. **Aditif & murah.** Satu `CREATE TABLE`; tanpa menyentuh `Admin`; migration mengikuti pola baku AUTH-1 (sort lexicographic, fresh-deploy verify).
3. **Re-validasi kuat.** `findValidById` = join `Admin` + filter `revokedAt`/`expiresAt` → token dicuri pun terbatas TTL.
4. **Backup risk ter-mitigasi.** Token ikut `.apbackup` → dibatasi TTL 24 jam; follow-up "invalidate sessions on restore" (WO-5) dicatat, bukan blokir.
5. **Testable.** Pola repo/service/smoke yang sudah ada (AUTH-2..AUTH-6) reusable; smoke DB fresh-file.

**Keputusan terbuka utk PO:**
- TTL: 24 jam absolute (default) vs 7 hari vs "sampai logout tanpa expiry".
- Opsi B lebih disukai jika PO menolak token berada di dalam snapshot backup — keputusan ada di Bagian 8.

## 7. Validation Plan

| Gate | Bukti |
|------|-------|
| `prisma migrate diff` | "This is an empty migration." pada state target? Tidak — migration ADITIF `2026xxxx_auth7_session`; fresh DB `migrate deploy` PASS (urutan ...→auth1→auth7); dev `migrate status` hijau; `prisma generate`. |
| Smoke `auth7_session_smoke` (fresh DB temp) | setup→persist row ada; restart-simulasi (SessionManager baru + `load()`) → authenticated true; login replace + prune expired; logout hapus row → load null; expired row ditolak; revoked ditolak; changePassword → session tetap valid; token unik 32-byte; DTO tidak bocor token. |
| Regression AUTH | auth2 (69) · auth4 (23) · auth5 (42) · auth6 (49) — semua hijau pada fresh DB (kontrak `auth:*` tidak berubah). |
| `npm run lint` | PASS (tsc node + web). |
| `npm run build` | PASS; verifikasi bundle marker. |
| UAT manual (Electron) | login → tutup app → buka lagi → tetap di halaman utama (bukan /login); logout → tutup → buka → /login. |

## 8. Decision

**STATUS: APPROVED (2026-08-07).** Keputusan Product Owner — semua rekomendasi diterima:

1. **Mekanisme: Opsi A** — tabel `AdminSession` di SQLite (Prisma).
2. **TTL: 24 jam absolute** — `expiresAt = createdAt + 24h`; row yang melewati batas ditolak (`expiresAt > now`).
3. **Remember Me: selalu persist** — setiap login menyimpan token; tanpa checkbox.
4. **Pecahan WO: satu WO AUTH-7** — schema+repo+SessionManager+AuthService+bootstrap+smoke+regression dalam satu Work Order.

Refinement implementasi (deviasi kecil dari draft schema, didokumentasikan di WORK_ORDER AUTH-7):
- Kolom `revokedAt` **tidak dipakai** — single admin, logout menghapus row (`deleteBySessionId`); tidak ada jalur revoke terpisah.
- Kolom `revalidatedAt` **tidak dipakai** — TTL absolute; ganti password tidak memperpanjang/mereset TTL (session tetap valid sesuai `expiresAt` semula).
- `load()` dipanggil **lazy** di `AuthService.status()`/`changePassword()` (bukan eager di bootstrap) — menghindari urutan inisialisasi DB.

---

*RFC APPROVED — menjadi dasar implementasi AUTH-7.*
