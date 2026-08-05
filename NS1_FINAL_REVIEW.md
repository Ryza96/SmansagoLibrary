# NS-1 FINAL REVIEW — Notification Foundation

## Tujuan Review
Memastikan implementasi NS-1 memenuhi 11 revisi PO dan tidak melanggar constraint scope (zero-dep, tanpa sentuh halaman, tanpa ganti alert/confirm, tanpa migration).

## Checklist Revisi PO
- [x] **ZERO dependency** — `package.json`/lockfile tidak berubah (diverifikasi `git diff --stat package*.json` kosong).
- [x] **Portal body** — `ToastViewport`/`ConfirmDialog` render via `createPortal(..., document.body)`.
- [x] **Top right** — `fixed top-14 right-4`; di bawah TopBar `h-12`.
- [x] **Stack** — flex-col, toast baru di bawah; urutan FIFO diuji (smoke 5).
- [x] **Maks 3** — slice evict tertua (smoke 6–8); config `NOTIFICATION_MAX_TOASTS=3`.
- [x] **Animasi** — keyframes slide-kanan+fade di `styles.css`.
- [x] **Durasi** — 3/4/5/6 detik per tipe (smoke 21–24); semua auto-dismiss, tidak ada persistent (smoke 8 coverage + timer provider).
- [x] **ConfirmDialog modern** — ikon+título+deskripsi+Cancel/Confirm+danger variant; Esc batal, Tab trap, fokus awal Cancel.
- [x] **Reducer pure** — tanpa IO; StrictMode double-invoke identik (smoke 19–20); input tak dimutasi (smoke 17–18).
- [x] **Tidak sentuh halaman** — satu-satunya edit renderer = `App.tsx` (mount provider). `git diff --stat` hanya menyentuh file scope.
- [x] **Tidak ganti alert()/confirm()** — belum ada perubahan di halaman.

## Arsitektur Gate
- Konfigurasi terpusat di `src/shared/config/notification.ts` (leaf node, pola config lain).
- Context pattern mengikuti `BookImportContext` (guard `useNotification` di luar provider → throw).
- Modul `src/notification/` masuk ke `tsconfig.web.json` include; main tidak menyentuh modul ini (bundle main identik baseline = bukti).

## Regression
- Smoke ns1: 27/27.
- Lint: PASS.
- Build: PASS (main/preload byte-identik baseline; renderer +11.22 kB hanya modul notification).
- `prisma migrate diff`: "This is an empty migration." — schema/migration tidak tersentuh.

## Keputusan Teknis
1. **Timer di provider, bukan reducer** — reducer murni; waktu tidak termasuk kontrak state.
2. **Id via `crypto.randomUUID()`** — pertama di `src/`; aman (Electron renderer, Chromium modern).
3. **Confirm bertumpuk**: jika `confirm()` kedua dipanggil saat dialog masih terbuka, promise pertama di-resolve `false` (menggantikan pola window.confirm yang mengabaikan panggilan lama).
4. **Fokus awal = tombol Cancel** (pola aman destruktif), Tab trap di dalam dialog.

## Debt / Lanjutan (di luar NS-1)
- Migrasi halaman (53 match) = **NS-2** (belum dibuka sesuai instruksi).
- Animasi keluar (exit) belum ada — hanya enter; di-cover animasi via className `toast-enter`. (Opsional penyempurnaan di WO lanjutan.)
- Belum ada mekanisme push di luar komponen React (mis. dari main process) — di luar scope v1.0.

## Status
**READY — menunggu review Product Owner.** Tidak membuka WO berikutnya.
