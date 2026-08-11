# FULL AUDIT REPORT — APLibrary

Audit menyeluruh read-only (8 area). Tidak ada perubahan file.
Date: 2026-08-10 · Platform: Windows · Branch `main` (ahead 4, working tree bersih)

---

## Ringkasan Eksekutif

| Area | Status | Temuan utama |
|------|--------|--------------|
| Build & type safety | OK | lint PASS, build PASS, nol ts-ignore |
| Wiring IPC | Sebagian | 3 API ter-wire tapi mati (dead) |
| Data & migrasi | OK | nol drift; 9 setting dormant; AssetEvent parsial |
| Smoke coverage | 49/52 PASS | 3 FAIL = pre-existing/stale (bukan regresi) |
| Security | Sebagian | nol secret; sandbox:false; error non-AppError bocor |
| Labels/strings | OK | 1 dead key minor (FIELD.PRICE) |
| Dependencies | Berisiko | 19 vuln (1 critical, 16 high) — fix = semver-major |
| Git hygiene | Sebagian | PNG/artefak debug ter-track |

**Tidak ada temuan Critical fungsional.** Temuan utama bersifat housekeeping/keamanan-dalam (dependencies), bukan bug jalur produksi.

---

## Critical

Tidak ada temuan Critical pada jalur fungsional produksi.

---

## Medium

### M1. Dependencies — 19 vulnerability (1 critical `tar`, 16 high)
- `npm audit`: **1 critical** (`tar` transitif via `electron-builder`, node-tar DoS/path-traversal), **16 high**, **2 moderate**.
- Direct yang terdampak: `electron` ^33.4.11 (banyak CVE ≤39.8.9), `electron-builder` ^25.1.8 (membawa `tar`), `electron-vite` ^2.3.0 (membawa `vite` ≤6.4.2, termasuk path-traversal & NTLMv2).
- **Fix semuanya semver-major**: electron 43.3.0, electron-builder 26.15.3, electron-vite 5.0.0 — memerlukan WO upgrade terencana (uji smoke regression penuh pasca upgrade).
- Konteks pengurangan risiko: aplikasi desktop lokal, `contextIsolation:true`, `nodeIntegration:false`, CSP ketat — sebagian besar CVE Electron butuh akses konten remote/menangani input untrusted yang tidak dimiliki app.

### M2. `sandbox: false` pada BrowserWindow
- `electron/main/index.ts` webPreferences: `contextIsolation:true`, `nodeIntegration:false`, tetapi **`sandbox:false`**.
- Preload punya akses Node penuh. Dengan contextIsolation aktif risikonya rendah, tetapi `sandbox:true` disarankan (preload saat ini hanya memakai `contextBridge`/`ipcRenderer` — kompatibel).
- Perlu verifikasi smoke/compile bila diubah (beberapa preload memakai modul Node).

### M3. Error non-AppError bocor mentah ke renderer
- Handler IPC pass-through tidak membungkus error; `AppError` (pesan terkontrol) lolos via wrapper Electron, tetapi error non-AppError (mis. Prisma/`fs`) melempar `Error.message` mentah ke renderer — dapat membocorkan path/struktur internal.
- Lokasi: `electron/ipc/*.ts` (pola pass-through tanpa normalize), mis. `member.ipc.ts:41-44` merangkum template download (ok), tapi channel data langsung `service.method()` tanpa catch.
- Rekomendasi: wrapper global `ipcMain.handle` yang menormalkan error (AppError → message; lain → pesan generik + log main), tanpa mengubah kontrak renderer.

### M4. Audit trail aset (AssetEvent) parsial
- `AssetEventRepository.record()` hanya dipanggil oleh legacy `electron/main/services/book-copy.service.ts:133` (event `COPY_CREATED` via `bookCopies:addCopies`).
- Stack baru `decommissionCopy`, borrow, return **tidak merekam event**; UI `InventoryDetailPage.tsx:69` tetap menampilkan events → riwayat aset tidak lengkap (tanpa keputusan PO untuk menghapus UI).

### M5. Audit trail auth runtime tidak tersedia (env dev)
- Test `auth6_*`/`auth7_*` smoke memakai `TEST_AUTH_BYPASS`; audit trail login/logout/password-change hanya tercatat bila dijalankan dengan harness khusus — bukan fitur aplikasi berjalan. Konsumsi data via channel `reports:*` dll tidak tercatat. (Konfirmasi: ini desain, bukan bug.)

---

## Low

### L1. Dead API ter-wire (3)
- `window.electronAPI.window.minimize/maximize` — tombol TopBar dihapus (REVISI 4 FILE MENU), handler tetap terdaftar di `app.ipc.ts:29,32-33` + preload.
- `enrollments.enroll/close/repoint` — channel + preload + env.d.ts ada, namun tidak ada UI konsumen (enrollment dibuat via Import/MI & service; guard masih dipakai service).
- `printing:borrowReceipt` — `print.ipc.ts:9-10` + `print.service.ts:259` (jalur legacy, renderer sudah memakai `borrowCard*`).

### L2. 9 setting dormant (whitelist `setting.service.ts:141-145`, tak dikonsumsi mana pun)
`lateFee`, `reportPaperSize`, `reportDateFormat`, `reportSigner`, `allowRenewal`, `maxBorrowBooks`, `defaultBorrowDays`, `website`, `principalName`. Disimpan di DB namun tidak dibaca fitur mana pun — backlog keputusan (hapus vs aktifkan).

### L3. Hardcode bisnis
- `MAX_BOOKS=20` di `src/main/services/borrow.service.ts` (keputusan WO-006, tech debt terdokumentasi) — tidak sinkron dengan setting `maxBorrowBooks` (dormant).
- `FIELD.PRICE: 'Harga Beli'` di `labels.ts:202` — dead key (WO13-R1 memakai `FIELD.ACQUISITION_*`), tidak dipakai.

### L4. Git hygiene — binary/artefak debug ter-track
- Ter-track: `label_visual_smoke/preview-final.png` (486 KB), `LABEL_PAGINATION_REFACTOR/*.png`, `LABEL_PREVIEW_REFINEMENT/*.png`, `templates/*.png`, `.xlsx` template (legit, dipakai runtime).
- PNG artefak visual smoke tidak diperlukan di repo — kandidat hapus + tambah `.gitignore`.

### L5. Smoke stale vs template kartu A6
- `wo4_logo_save` (19/1), `wo2_borrow_card_preview` (15/6), `borrow_card_uat` (17/14) gagal karena meng-assert markup/layout kartu lama 110×60; template kini A6 105×148 dengan fallback logo ikon buku 24×24 (`borrow-card.service.ts:82-87`) bukan monogram 64×64. Semua FAIL = assertion stale, bukan regresi aplikasi.
- `borrow_card_wo1`, `wo7_cl1`, `wo8_cl2a`, `wo9_cl2b` gagal kompil (API/kontraktor lama).
- `print_engine_fix_phase1_smoke/` folder kosong.

### L6. TODO jinak (2)
- `src/main/services/borrow-card.service.ts:18` (escapeHtml — masih dipakai, aman).
- `electron/main/index.ts:45` (Logging Framework menggantikan console.log startup — rencana WO Logging).

---

## Lampiran: Ringkasan smoke

- **52 suite dijalankan**: 49 PASS (1,594+ assertion), 3 FAIL pre-existing/stale.
- Pure (6): barcode_format 23 · ns1 27 · p1_decide 30 · wo1_config 46 · wo2_manifest 178 · wo1_data_infra 88.
- Core/Report/Provider/Auth/Master/Logo: seluruh hijau (rincian di sesi).
- Gagal kompil (stale API): borrow_card_wo1, wo7/wo8/wo9_cl*.
- Tidak dijalankan (13): layout v11/v12, pdf/print fix, label_visual, atomic_save, backup/restore/ui (butuh Electron runtime atau belum dicoba).

## Lampiran: Security snapshot
- **Secrets**: nol secret/credential di source (grep apiKey/secret/password/token/BEGIN KEY = hanya dokumentasi & test fixtures). `.env` di-ignore; `.env.example` ter-track.
- **Session**: token 32-byte random base64url, TTL absolute 24 jam, persist DB `AdminSession`, single-admin (login = replace). Password: Argon2id hash, policy 8–128 tanpa kompleksitas (RFC A§11.6).
- **CSP** (`src/renderer/index.html`): `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'` — ketat, tanpa unsafe-eval.
- **Renderer surface**: hanya `window.electronAPI` (exposeInMainWorld tunggal), contextIsolation on, nodeIntegration off.
- **Auth guard**: `AuthGate` UI (`routes/index.tsx:54`) redirect /setup | /login; handler auth guard di `AuthService` (main = penegak keamanan). Channel data non-auth (books, members, borrows, settings, backup/restore, report, promotion, dll) **tidak punya guard sesi per-channel** — dapat dipanggil renderer tanpa autentikasi (design: guard UI + IPC terbatas; tanpa sesi di handler data). Ini layak dicatat: bila window renderer di-akses bebas (mis. via devtools), seluruh data API terbuka.

## Rekomendasi prioritas
1. **WO Upgrade dependencies** (electron 43 + electron-builder 26 + electron-vite 5) — terencana, dengan regression smoke penuh. (M1)
2. **Wrapper error IPC global** — normalkan error non-AppError agar tidak bocor ke renderer. (M3)
3. **Audit trail aset lengkap** — putuskan: rekam event stack baru atau hapus UI AssetEvent. (M4)
4. **Sandbox** — evaluasi `sandbox:true` (verifikasi preload). (M2)
5. **Housekeeping**: hapus dead API (L1), putuskan 9 setting dormant (L2), hapus PNG artefak (L4), update 6+ smoke stale (L5).
