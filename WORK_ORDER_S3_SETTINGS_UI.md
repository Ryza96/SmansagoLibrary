# WORK ORDER S-3 — Settings UI Redesign (Implementation)

## Objective
Merombak halaman Pengaturan menjadi UI berbasis tab yang bersih dan informatif, menggantikan tata letak lama. Revision minor visual tambahan diajukan pada Final Visual Review dan disetujui Product Owner.

## Scope
- **Renderer only.** UI halaman `SettingsPage` + label blok `LABELS.SETTINGS`.
- **TIDAK diubah:** backend, IPC, database/schema/migration, service, DTO, routing, navigation (routes/sidebar), business logic, warna utama, typography, icon, struktur menu.

## Implementation

### Tab layout (5 tab)
- Identitas Perpustakaan — field `libraryName`, `schoolName`, `librarianName` (input aktif) + area "PILIH LOGO" (UI-only, pesan Segera Hadir, logo tidak dipersist).
- Manajemen Data — kartu menuju `ROUTES.BACKUP` dan `ROUTES.RESTORE` (navigate, backend existing WO-4/5/6) + Reset (Segera Hadir).
- Keamanan — Login & Password (Segera Hadir).
- Informasi Aplikasi — membaca `api.app.info()` (name/version) + `api.backupUI.getTargetInfo()` (path folder backup).
- Tentang — daftar statis nama/versi/copyright/developer.

### File diubah (2)
- `src/pages/SettingsPage.tsx` — tabbed Settings UI + komponen lokal `Card`, `ActionCard`, `Field`.
- `src/utils/labels.ts` — blok `LABELS.SETTINGS` (label tab/field/aksi/badge).

### Revisi minor visual (Final Visual Review, 6/6)
1. Panel tab kiri dipersempit `md:w-60 → md:w-48` (~20%).
2. `items-start` pada flex container — card konten mengikuti tinggi isi, tidak meregang penuh.
3. Padding tab `px-4 py-3 → px-3 py-2` (lebih ringkas, tetap nyaman diklik).
4. Area "PILIH LOGO" `py-8 → py-5` (lebih pendek, tetap terlihat area upload).
5. Badge "Segera Hadir" `text-[10px] → text-[11px]` + padding sedikit (warna amber dipertahankan).
6. Value Informasi Aplikasi `text-slate-800 → text-slate-900` (lebih gelap/kontras).

## Validation
- `npm run lint` PASS.
- `npm run build` PASS — main 2,046.33 kB · preload 10.99 kB (identik baseline, perubahan murni renderer) · renderer 1,188.20 kB.
- `prisma migrate diff` — tidak menyentuh schema/migration (perubahan renderer only).
- UI redesign selesai dan diterapkan pada aplikasi yang berjalan.
- **Product Owner APPROVED.**

## Decision
- Scope S-3 dibatasi ke renderer; tidak ada kontrak baru (IPC/preload/env tidak disentuh) sehingga backend tetap stabil.
- Area logo & fitur Keamanan/Reset menampilkan status "Segera Hadir" (UI-only) sesuai keputusan PO; tidak ada pembuatan jalur backend baru.
- Status: **DONE — APPROVED & RELEASED** oleh Product Owner.
