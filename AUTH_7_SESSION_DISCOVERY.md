# AUTH_7_SESSION_DISCOVERY.md

**WO:** AUTH-7 — Session Persistence (DISCOVERY).
**Status:** DISCOVERY — READ ONLY. **Tidak ada perubahan source / schema / migration / commit / push / branch.**
**Output:** dokumen ini + `RFC_AUTH_SESSION_PERSISTENCE.md` (DRAFT — menunggu persetujuan Product Owner).

---

## 1. Objective

Audit menyeluruh atas arsitektur session aplikasi saat ini dan menyiapkan desain **session persistence** (session bertahan setelah aplikasi di-restart). Tahap ini **belum** melakukan implementasi.

## 2. Scope

- Audited: `SessionManager`, `AuthService`, `AdminRepository`, `bootstrap`, Electron lifecycle, IPC auth, preload auth, `AuthGate`, `LoginPage`, `SetupPage`, `ChangePasswordPage`, SQLite/Prisma, `appData`/`userData`, mekanisme startup.
- **Bukan bagian discovery ini:** desain Multi-User / Role / Permission, Auto Lock / idle-timeout, Forgot Password, rate-limit/lockout (semua backlog RFC_AUTH_ARCHITECTURE §11.5).

## 3. Current Architecture (fakta — hasil inspeksi source)

### 3.1 Session = objek runtime in-memory di Main Process

`src/main/services/session-manager.ts` (51 baris, kelas murni):

| Method | Perilaku |
|--------|----------|
| `open(admin)` | membuat `Session { sessionId: randomUUID(), adminId, username, createdAt }`, simpan di field privat `this.session`. Login baru saat session ada → **replace** (RFC §3.1). |
| `get()` | mengembalikan `Session \| null`. |
| `currentAdmin()` | proyeksi `{ adminId, username }` untuk `AuthService.changePassword`. |
| `close()` | `this.session = null`. |
| `isAuthenticated()` | `this.session !== null`. |

- **Tidak ada** penulisan ke disk/DB, tidak ada expiry, tidak ada idle-timeout, tidak ada Remember Me. Ini **by design** — RFC_AUTH_ARCHITECTURE.md K4 (`:17`), §3.1 (`:113-115`), §3.3 (`:130`): *"Hilang saat aplikasi ditutup — tanpa persist"*.

### 3.2 AuthService — satu-satunya pengguna SessionManager

`src/main/services/auth.service.ts`:

| Method | Alur session |
|--------|--------------|
| `status()` (`:26-34`) | `count()` Admin + `sessionManager.get() != null` → `{ needsSetup, authenticated, username }`. |
| `setup()` (`:37-56`) | guard `count() === 0` → create Admin → `sessionManager.open(admin)` (auto-login) → `updateLastLogin`. |
| `login()` (`:59-72`) | verify → `sessionManager.open(admin)` (replace) → `updateLastLogin`. |
| `logout()` (`:75-78`) | `sessionManager.close()` → `{ ok: true }` (idempoten). |
| `changePassword()` (`:81-103`) | guard session aktif → verify lama → update hash → **session tetap aktif**. |

- Renderer TIDAK pernah menerima `sessionId`/`passwordHash` (RFC §1.4/§11.3; DTO `src/shared/dto/auth.ts` hanya status/boolean).

### 3.3 Persistensi kredensial — model `Admin` (SQLite/Prisma)

`prisma/schema.prisma:298-308` — `model Admin { id uuid, username @unique, passwordHash, passwordChangedAt?, lastLoginAt?, createdAt, updatedAt }`. Migration aditif `prisma/migrations/20260807_auth1_admin` (ke-5, urutan lexicographic benar). Tabel `Admin` ikut snapshot Backup/Restore (WO-4/5/6).

### 3.4 Wiring & lifecycle Electron

- `electron/main/bootstrap.ts:241` — `new AuthService(new AdminRepository(), new PasswordHasher(), new SessionManager())`. **SessionManager dibuat fresh setiap proses.**
- `electron/main/index.ts` (`:43-77`) — `app.whenReady()` → `bootstrapDataInfrastructure()` (buat folder di `userData`) → `initDatabase()` → `databaseReconciliationService.run()` → `createContainer` → `registerAllHandlers` → `settingService.get()` → `createWindow()`.
- `:79-84` `window-all-closed` → `closeDatabase()` + `app.quit()`; `:86-88` `before-quit` → `closeDatabase()`. **Tidak ada** `requestSingleInstanceLock()` (multi-instance dimungkinkan).

### 3.5 IPC & preload auth

- `electron/ipc/auth.ipc.ts` — 5 channel pass-through tipis: `auth:status|setup|login|logout|changePassword`.
- `electron/preload/auth.preload.ts` — `window.electronAPI.auth.*` (invoke). Tidak ada channel domain lain yang di-guard session.

### 3.6 Renderer

- `src/auth/AuthGate.tsx` — saat mount panggil `auth.status()`; navigasi: `needsSetup → /setup`, `!authenticated → /login`, `authenticated → /`. Menyediakan `refreshStatus()` via context.
- `LoginPage`/`SetupPage`/`ChangePasswordPage` — UX murni; submit → `auth.*` → `refreshStatus()`. Tidak menyimpan apa pun di renderer (tidak ada `localStorage`/`sessionStorage`).

### 3.7 Data & appData

- DB aktif: `prisma/aplibrary.db` (dari `.env` `DATABASE_URL`). Infra data-protection (WO-1) sudah menyiapkan `userData/{database,backup,logs,temp,settings,assets}` (`src/main/infrastructure/paths.ts`), **tapi DB belum direlokasi** ke `userData/database` (keputusan ADR-001 §8.2 Q2–Q5 masih open).

---

## 4. Discovery

### 4.1 Bagaimana session saat ini bekerja?

Jawab ringkas: **session adalah variabel di memori Main Process.** Alur: `login` → `sessionManager.open(admin)` (buat `{sessionId: UUID, adminId, username, createdAt}`, simpan di field privat) → `status()` mengembalikan `authenticated: true` selama field itu terisi → `logout`/`close()` mengosongkannya. Session id dihasilkan `randomUUID()` (128-bit acak), hanya hidup di Main, renderer tidak menerimanya (cukup boolean). Seluruh guard keamanan (`changePassword`) membaca `currentAdmin()` dari objek ini.

### 4.2 Mengapa session hilang setelah restart aplikasi?

Karena **session tidak pernah dipersist ke media apa pun**. Ketika proses Electron berhenti (`app.quit()`, `window-all-closed`, crash, power failure), seluruh memori dibebaskan. Pada peluncuran berikutnya `createContainer` (`bootstrap.ts:241`) membuat `SessionManager` **baru** dengan `this.session = null` → `auth:status` mengembalikan `authenticated: false` → `AuthGate` mengarahkan ke `/login`. Ini bukan bug — merupakan keputusan K4 RFC v1 yang eksplisit ("tanpa persist, tanpa Remember Me").

### 4.3 Perbandingan alternatif implementasi

Token shape di semua opsi: **opaque random token** (bukan JWT) — `crypto.randomBytes(32).toString('base64url')` atau UUID v4. Perbandingan teknis:

| Opsi | Kelebihan | Kekurangan | Kompleksitas | Risiko | Kompatibilitas Electron Desktop |
|------|-----------|------------|--------------|--------|--------------------------------|
| **A. SQLite session table (Prisma `AdminSession`)** | Konsisten dgn stack data (Prisma/SQLite sudah dipakai); transaksional dgn `Admin`; migration aditif murah; re-validasi = 1 lookup indexed; cleanup TTL `DELETE WHERE expiresAt<now`; bisa di-smoke dgn pola repo yang ada | Butuh migration; session ikut snapshot Backup/Restore (bila backup disalin, token ikut); 1 file DB bisa di-copy | **Rendah–Sedang** | Token ikut backup/copy DB → replay; mitigasi: TTL + re-validasi + (opsional) invalidate session saat restore | **Sempurna** (Prisma sudah runtime native) |
| **B. Encrypted session file (Electron `safeStorage` + file di `userData/settings`)** | Tanpa migration/schema; TIDAK ikut backup DB (folder `settings` tidak di-snapshot) → restore tidak menghidupkan session; enkripsi terikat akun OS (DPAPI/Keychain); menghormati prinsip "session bukan entitas DB" | Sub-sistem baru (file IO + tulis atomik + lock); `safeStorage` butuh keyring (Linux libsecret; Windows DPAPI OK — target win32); korup file → re-login | **Sedang** | Replay bila penyerang punya akses akun OS yang sama (sama dgn akses DB); file korup = session hilang (recoverable) | **Baik** (built-in Electron, tanpa dependency) |
| **C. electron-store** | Sederhana, matang, populer | Dependency baru (budaya repo zero-dep); isi JSON plaintext (token bearer jelas terlihat) kecuali dikombinasi `safeStorage`; pada dasarnya tetap "file JSON" | **Rendah** | Token plaintext; supply-chain dep | **Baik** (wrapper file userData) |
| **D. OS Credential Manager (Windows Credential Manager / keytar)** | Vault OS; ikatan akun kuat | `keytar` **deprecated/tidak terawat**; API vault tidak seragam lintas OS; overkill — vault untuk secret permanen (password/API key), bukan session | **Sedang–Tinggi** | Dep usang; vault gagal di sebagian env → login selalu diminta | **Rendah** (keytar rusak di Electron modern) |
| **E. Signed token (JWT/HMAC)** | Self-contained, verifikasi stateless, tanpa lookup | Butuh signing secret (chicken-and-egg — secret ditaruh di mana? kembali ke vault); clock skew; revoke sulit; over-engineer utk single-user lokal | **Tinggi** | Secret management; replay sampai expiry | **Kurang cocok** (solusi server-side) |
| **F. Random session id (opaque) saja, tanpa mekanisme persist** | Ini adalah *shape token* yang dipakai opsi A/B/D | Bukan mekanisme — butuh media persist (A/B) atau vault (D) | — | — | — |
| **G. (Anti-pola) `localStorage`/`sessionStorage` renderer** | — | Token ada di renderer (melanggar RFC §1.4/§3.2); kebocoran via XSS/serialisasi; `contextIsolation` tak membantu | — | Tinggi | **DILARANG** |
| **H. (Alternatif lain) cookie Electron `persist:` partition** | Persist web-session | Mekanisme cookie web utk session auth desktop = salah alat; opaque & sulit di-revalidasi | Sedang | Replay; kompleksitas sesar | Kurang cocok |
| **I. (Alternatif lain) file plaintext di `userData`** | Paling sederhana, tanpa dep | Token bearer plaintext | **Sangat rendah** | Replay bila file terbaca; namun siapa pun yg bisa baca userData juga bisa ubah DB → trust boundary sama | Baik |

### 4.4 Mana yang PALING sesuai dengan arsitektur project ini?

**Rekomendasi: Opsi A — tabel `AdminSession` di SQLite (Prisma), sebagai opsi utama.** Alasan teknis:

1. **Konsistensi lapisan data.** Seluruh persistensi aplikasi melalui Prisma + `BaseRepository` + `src/shared/config` + smoke pattern (AUTH-1). Menambah tabel session = mengulang pola yang sudah terbukti, tanpa sub-sistem penyimpanan baru.
2. **Migration aditif murah & aman.** `CREATE TABLE` (pola persis AUTH-1 `20260807_auth1_admin`), tanpa ALTER, tanpa perubahan kolom `Admin` (reuse `passwordChangedAt`).
3. **Re-validasi gratis & kuat.** 1 query join ke `Admin`: admin ada + `revokedAt IS NULL` + `expiresAt > now`. Karena session adalah bearer token, re-validasi di Main (bukan sekadar kehadiran file) adalah pertahanan utama.
4. **Cleanup & multi-instance.** `DELETE WHERE expiresAt < now` saat login; karena token di DB, dua instance app yang membuka DB yang sama berbagi state session (meski belum ada `requestSingleInstanceLock`).
5. **Risiko backup ter-mitigasi:** token ikut `.apbackup` → dibatasi TTL (default 24 jam) + re-validasi; opsi lanjutan "invalidate sessions on restore" dicatat sebagai follow-up (bukan blokir).

**Opsi B (safeStorage file) adalah kandidat kuat alternatif** bila PO menghendaki *zero migration* dan *session tidak pernah berada di snapshot backup*. Trade-off: sub-sistem file baru vs 1 tabel. Keputusan akhir ada di PO (lihat RFC, Bagian Decision).

### 4.5 Apakah membutuhkan migration / schema / tabel / kolom?

- **Opsi A (rekomendasi):** YA — **satu tabel baru `AdminSession`** (migration aditif, tanpa kolom baru di model lain, tanpa ALTER). TIDAK menambah kolom ke `Admin` (reuse `passwordChangedAt`, `id`).
- **Opsi B:** TIDAK — file terenkripsi di `userData/settings`, tidak menyentuh schema/migration sama sekali.
- Opsi lain (C/D/E) tidak menambah tabel DB.

### 4.6 Perubahan per layer (bila Opsi A dipilih)

| Layer | Perubahan | Besaran |
|-------|-----------|---------|
| `AdminRepository` | tambah (opsional) method dukungan re-validasi; sebagian besar logika ada di repo baru | Kecil |
| **`AdminSessionRepository` (baru)** | `create`, `findValidById`, `deleteBySessionId`, `deleteExpired`, `deleteByAdminId` | Baru |
| **`SessionManager`** | refactor: `open` → tulis DB; `load()` saat bootstrap/status → baca+re-validasi; `close` → hapus row. Pertahankan mirror in-memory utk speed & kontrak lama | Sedang |
| **`AuthService`** | `status()` → re-validasi (bukan sekadar kehadiran); `login` → prune expired; `changePassword` → perbarui `revalidatedAt` session aktif (tetap login, AUTH-6) | Sedang |
| **`AuthGate`** | **minimal** — kontrak `auth:status` sama; opsional tampilkan `expiresAt` | Kecil / tanpa |
| `LoginPage` | **tanpa** perubahan (opsional checkbox "Tetap masuk"/Remember Me — keputusan PO) | Tanpa / kecil |
| `SetupPage` | tanpa perubahan (auto-login ikut ter-persist) | Tanpa |
| `ChangePasswordPage` | tanpa perubahan | Tanpa |
| **Preload** | tanpa channel baru (reuse `auth:status`); opsional perluasan DTO status | Tanpa / kecil |
| **IPC** | tanpa channel baru (restore via `auth:status`); opsional `auth:clearSessions` | Tanpa / kecil |
| **Bootstrap** | instantiasi repo session + `sessionManager.load()` (atau lazy di `auth:status`) | Kecil |

### 4.7 Audit keamanan

| Risiko | Saat ini | Setelah Opsi A | Mitigasi |
|--------|----------|----------------|----------|
| **Session replay** (token dipakai ulang) | Token in-memory, mustahil replay lintas restart | Token dipersist → replaysable bila DB/backup bocor | TTL `expiresAt` (default 24 jam) + re-validasi; token acak 32-byte; optional invalidate-on-restore |
| **Session theft** (token dicuri) | Hanya bisa dicuri dari memori proses | Bisa dicuri dari file DB | Token hanya di Main & tidak pernah ke renderer; enkripsi optional via safeStorage; akses OS sama dgn DB |
| **Password changed** | Session tetap aktif (AUTH-6) | Session tetap aktif (AUTH-6) | Perbarui `revalidatedAt` session aktif; jika multi-session nanti → revoke yang lain (`passwordChangedAt` reuse) |
| **Logout** | `close()` in-memory | `DELETE row` + `close()` | Logout selalu menghapus token persist → restart tetap /login |
| **Crash recovery** | Session hilang (harus login ulang) | Session bertahan (row utuh) | Tidak ada aksi khusus; TTL memberi batas |
| **Power failure** | Session hilang | Row mungkin tertulis sebagian → SQLite WAL menjamin konsistensi transaksi; session korup → re-login | Tulis via Prisma transaksi; recovery natural |
| **Database corruption** | Session ikut hilang (in-memory terpisah) | Session ikut DB; restore backup menghidupkan token lama | TTL + invalidate-on-restore (follow-up) |
| **Multiple windows / instances** | Dua instance = dua SessionManager terpisah | Dua instance = satu DB → session shared; login satu instance tidak me-logout instance lain | Opsional `requestSingleInstanceLock` (diluar scope, dicatat) |
| **Race condition** | Rendah (single-process) | Perlu `create`-vs-`load` urut; Prisma serialize SQLite | Satu session row per admin; operasi via repository transaksional |

### 4.8 Lifecycle lengkap (target setelah implementasi)

```
Application Start
   │
   ▼
app.whenReady()
   │
   ▼
Bootstrap DataInfra (userData dirs)
   │
   ▼
initDatabase() → reconciliation
   │
   ▼
createContainer (AdminRepository, PasswordHasher,
                 AdminSessionRepository, SessionManager)
   │
   ▼
SessionManager.load()  ── baca row AdminSession + re-validasi
   │                        (admin ada? revokedAt null? expiresAt > now?)
   ▼
registerAllHandlers → createWindow
   │
   ▼
AuthGate mount → auth:status → { needsSetup, authenticated, username }
   │
   ├─ needsSetup=true ──────────► /setup
   │                                 │
   │                                 ▼  setup() → open() → PERSIST row
   ├─ authenticated=false ──────────► /login
   │                                     │
   │                                     ▼  login() → open() → PERSIST row
   │                                          (replace + prune expired)
   ├─ authenticated=true ───────────► /  (session RESTORED dari disk)
   │
   ▼
Pengguna bekerja (session valid)
   │
   ├─ changePassword() → update hash + revalidatedAt (tetap login)
   ├─ Restart App ─────────────────► mulai dari atas; load() menemukan row
   │                                    yang valid → langsung authenticated
   └─ logout() → DELETE row + close() → restart berikutnya /login
```

### 4.9 Pecahan Work Order (bila AUTH-7 terlalu besar)

| WO | Isi | Ketergantungan |
|----|-----|----------------|
| **AUTH-7A** | Fondasi session store: migration `AdminSession` + `AdminSessionRepository` + config `src/shared/config/session.ts` (TTL) + smoke. **Tanpa perubahan perilaku.** | — |
| **AUTH-7B** | Persistence aktif: `SessionManager.load/persist`, re-validasi di `AuthService.status`, prune expired, bootstrap restore, logout hapus row. | AUTH-7A |
| **AUTH-7C** | (Opsional, keputusan PO) Remember Me UX / `expiresAt` di `AuthStatusDTO`. | AUTH-7B |
| **AUTH-7D** | Hardening + regression penuh + release: smoke `auth7_session_smoke` (fresh DB), regression auth2/4/5/6, lint, build. | AUTH-7B/C |

---

## 5. Rekomendasi

1. Terapkan **Opsi A (tabel `AdminSession` di SQLite)** sebagai jalur utama — konsisten, aditif, testable, re-validasi kuat.
2. Konfigurasi TTL terpusat (`src/shared/config/session.ts`, default **24 jam absolute**), dapat diubah tanpa migration.
3. **Session tetap aktif setelah ubah password** (AUTH-6 dipertahankan) — perbarui `revalidatedAt`.
4. **Logout selalu menghapus token persist.**
5. Catat follow-up (bukan blokir): invalidate sessions saat Restore (WO-5), `requestSingleInstanceLock`, Auto Lock/idle-timeout (backlog).
6. Opsi B (safeStorage file) didokumentasikan sebagai alternatif jika PO menolak migration/token-dalam-backup.

## 6. Decision

**BELUM ADA** — menunggu persetujuan Product Owner atas `RFC_AUTH_SESSION_PERSISTENCE.md`. Implementasi dilarang sampai ada keputusan.

---

*Dokumen ini READ ONLY — tidak ada perubahan kode/schema/migration/commit.*
