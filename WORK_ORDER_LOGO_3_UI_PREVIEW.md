# WORK ORDER — LOGO 3: UI PREVIEW (REVISION — DISEDERHANAKAN)

Status: **DONE — READY review PO**
Source of Truth: `RFC_LOGO_MANAGEMENT_ARCHITECTURE.md` (LOCKED REVISION 1) §6/§15.1, `WORK_ORDER_LOGO_2_BACKEND.md`, `WORK_ORDER_LOGO_2_REVISION1_ATOMIC_SAVE.md`

---

## Objective

Mengaktifkan tombol **"PILIH LOGO"** di `Pengaturan → Identitas Perpustakaan` sebagai **pratinjau logo** (UI Preview) dengan implementasi seminimal mungkin. Backend WO-2 (`settings:pickLogo`) sudah siap dan menghasilkan `previewUri` (data URI hasil resize ≤512×512). Persisten (Simpan/Hapus) bukan bagian scope — WO-4 terpisah.

## Scope

### In (renderer-only)
- `src/pages/SettingsPage.tsx` — tombol "PILIH LOGO" memanggil `window.electronAPI.settings.pickLogo()`; pratinjau memakai **state lokal** `logoPreview`; Cancel mempertahankan pratinjau sebelumnya; tanpa reload.

### Out (dilarang / belum)
- Backend WO-2 (`setting.service.ts`, `setting.ipc.ts`, `setting.preload.ts`, `bootstrap.ts`, `env.d.ts`, `src/shared/dto/logo.ts`, resolver, Atomic Save, logo-config) **TIDAK disentuh**.
- **Tidak ada modul/helper/abstraksi baru** (revisi: `src/utils/logo-preview.ts` dihapus).
- Renderer **TIDAK** memanggil `saveLogo`, TIDAK mengubah DB, TIDAK menulis file.
- **Tanpa** badge "Belum disimpan".
- `LOGO_COMING_SOON` di `labels.ts` **tetap ada** (tidak dihapus).
- **Belum ada** tombol "Hapus Logo" (WO-4).

## Implementation

1. **`SettingsPage.tsx`**:
   - `interface LogoPreview { filePath; sizeBytes; previewUri }` (lokal) + state `logoPreview: LogoPreview | null`, `logoPicking: boolean`.
   - `handlePickLogo()` → `api.settings.pickLogo()`; bila `!result.canceled` simpan `{filePath, sizeBytes, previewUri}` ke state; bila `canceled` **tidak mengubah state** sehingga pratinjau sebelumnya tetap tampil; error → `notify.error`; spinner selama IPC.
   - Blok logo: kotak 96×96 menampilkan `<img src={previewUri}>` (object-contain) saat ada pick, atau placeholder ikon saat tidak ada; sampingnya nama file (parsing inline `split(/[/\\]+/).pop()`) + ukuran (B/KB, format inline); tombol "PILIH LOGO". Pratinjau murni state lokal — tanpa reload, tanpa persisten, tanpa badge.
   - `handleSave` tetap hanya mengirim 3 field teks (`settings.update`) — logo tidak ikut disimpan.
   - `handleComingSoon` tetap dipakai untuk Data Reset / Login / Password.

2. **`labels.ts`** — **tidak berubah** dari baseline (blok `SETTINGS` tetap `LOGO_PICK` + `LOGO_COMING_SOON`; label baru apa pun dibatalkan).

## Validation

| Gate | Hasil |
|---|---|
| `npm run lint` (tsc node + web) | PASS |
| `npm run build` | PASS — main **2,053.63 kB** · preload **11.06 kB** (identik baseline WO-2 = backend tidak berubah) · renderer **1,190.34 kB** (`index-CL9ZTq5f.js`) |
| Regression WO-1 `wo1_logo_foundation_smoke` (pure) | 57/57 PASS |
| Regression WO-2 `wo2_logo_backend_smoke` | 42/42 PASS (fresh DB temp, 4 migrations) |
| Regression WO-2 R1 `wo2_r1_atomic_save_smoke` | 56/56 PASS (fresh DB temp) |
| Grep bundle renderer | `pickLogo` = 1 (pemanggilan `api.settings.pickLogo`); **`logoUpload`/`logoClear`/`saveLogo` = 0**; **`Belum disimpan` = 0** (tanpa badge) |
| Grep source | tidak ada sisa `logo-preview` / label baru; state logo murni `logoPreview` di `SettingsPage.tsx` |

Total smoke: **WO-1 57 + WO-2 42 + WO-2 R1 56 = 155 PASS, 0 FAIL.**

## Decision

- **Revisi penyederhanaan diterapkan**: modul `src/utils/logo-preview.ts` dan smoke-nya dihapus; tidak ada helper/abstraksi baru; pratinjau murni state lokal di `SettingsPage.tsx`; badge "Belum disimpan" tidak ditampilkan; `LOGO_COMING_SOON` dipertahankan.
- **Cancel = pertahankan pratinjau sebelumnya**: `handlePickLogo` tidak menyentuh state saat `canceled`.
- **Tidak ada tombol "Hapus Logo"** — WO-4 (Simpan/Hapus) menambah aksi persisten; WO-3 murni pratinjau.
- **Belum commit / belum push** — menunggu review Product Owner.
