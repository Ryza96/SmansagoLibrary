# LOGO MANAGEMENT — DISCOVERY REPORT (READ ONLY)

- **Mode:** READ ONLY — tidak ada perubahan source, commit, branch, refactor, atau workaround.
- **Status:** DONE — menunggu review Product Owner.
- **Fakta diverifikasi:** pembacaan langsung terhadap source, DB live (`prisma/aplibrary.db`), dan file backup nyata di `userData`.

---

## 1. Ringkasan Eksekutif

- Kolom **`Setting.logoPath` SUDAH ADA** di schema (`String @default("")`), sudah di-whitelist di `SettingService.allowedFields`, dan sudah DIKONSUMSI oleh Kartu Peminjaman (`borrow-card.service.ts` + `print.service.ts`).
- **GAP utama bukan backend — adalah UI.** Tidak ada jalur upload: `SettingsPage` hanya menampilkan tombol dashed "PILIH LOGO" yang memanggil `handleComingSoon()` (toast "Fitur akan tersedia pada tahap berikutnya."). `logoPath` di DB praktis selalu `''`.
- **Tidak diperlukan migrasi/schema baru** — `logoPath` sudah ada sejak baseline ADR-002.
- **Belum ada `dialog.showOpenDialog`** di seluruh project (hanya `showSaveDialog` untuk Save PDF).
- **Backup & Restore SAAT INI hanya menangani database** — aset `userData/assets/` (termasuk `school-logo/`) TIDAK ikut dibackup/direstore. Bukti: manifest backup nyata berisi 1 entri (`kind: database`). Provider framework sudah siap (WO-3/4/5) untuk menambah AssetProvider di masa depan.
- **RFC-001 sudah mengunci arah desain** (§6.2): logo ditaruh di `userData\assets\school-logo\` dan `Setting.logoPath` menyimpan **path RELATIF** terhadap `userData`; pembaca logo memakai resolver + fallback monogram (pola existing).

---

## 2. Current Architecture

### 2.1 Model `Setting` (prisma/schema.prisma, L303–336)

Model singleton (satu row). Field relevan:

| Field | Tipe | Default | Catatan |
|---|---|---|---|
| `libraryName` | String | — | Wajib (validasi UI) |
| `schoolName` | String | `''` | |
| `logoPath` | **String** | **`''`** | **L314** — SUDAH ADA, belum ada penulis |
| `librarianName` | String | `''` | |

DB live: `prisma/aplibrary.db` (716,800 B). **DB belum direlokasi** ke `userData/database/` (folder itu kosong; relokasi = keputusan terbuka ADR-001 §8.2 Q2–Q5).

### 2.2 Lapisan backend settings

| Lapisan | File | Peran |
|---|---|---|
| Repository | `electron/main/repositories/setting.repository.ts` | `get()` / `update()` / `createDefaultIfNotExists()`; `DEFAULT_SETTINGS.logoPath = ''` (L13) |
| Service | `electron/main/services/setting.service.ts` | `get()` (auto-create default); `update()` whitelist field — **`logoPath` sudah masuk** (L18) |
| IPC | `electron/ipc/setting.ipc.ts` | `settings:get`, `settings:update` |
| Preload | `electron/preload/setting.preload.ts` | `settings.get()` / `settings.update(data)` |

`createDefaultIfNotExists` dipanggil otomatis saat startup (`electron/main/index.ts:68` → `container.settingService.get()`).

### 2.3 UI — SettingsPage (src/pages/SettingsPage.tsx)

- Tab `identity` (L171–226) = "Identitas Perpustakaan" dengan grid 2 kolom: Nama Perpustakaan, Nama Sekolah, **area Logo**, Nama Pustakawan.
- Area logo (L191–203): `<Field label="Logo Perpustakaan">` berisi **tombol dashed** dengan ikon `ImagePlus`, teks `PILIH LOGO` + `· Fitur akan tersedia pada tahap berikutnya.`. `onClick={handleComingSoon}` → `notify.info(COMING_SOON_HINT)`.
- **Tidak ada** preview logo, tombol hapus, maupun display `logoPath` saat ini.
- Form state `IdentityForm` hanya `{libraryName, schoolName, librarianName}` — `logoPath` tidak pernah di-load/display.
- `handleSave()` mengirim `form` (tanpa logo) ke `settings.update`.

### 2.4 Konsumen logo saat ini

- **SATU-SATUNYA konsumen:** Kartu Peminjaman (header logo 10×10mm).
  - `electron/main/services/print.service.ts:59-69` — `readFileAsDataUri(filePath)` (PRIVATE) + `IMAGE_MIME` (png/jpg/jpeg/gif/svg/webp/bmp/ico).
  - `src/main/services/borrow-card.service.ts:354` — `const logo = settings.logoPath ? await deps.readFileAsDataUri(settings.logoPath) : null` → `header.logo`; fallback `generateLogoMonogramSvg` / `generateBookIconSvg` (D13).
- **TIDAK dipakai** di Dashboard, Sidebar, Header, label buku (`label.service.ts`), maupun bukti pinjam/kembali (receipt legacy memakai `libraryName` teks saja).

---

## 3. Data Flow (Saat Ini)

```
SettingsPage (renderer)
   │  settings.get() / settings.update({...})
   ▼
window.electronAPI (env.d.ts) ──invoke──▶ electron/preload/setting.preload.ts
   │  ipcRenderer.invoke('settings:get' | 'settings:update', data)
   ▼
electron/ipc/setting.ipc.ts (handler)
   ▼
SettingService.get() / update(data)
   │  whitelist allowedFields (termasuk 'logoPath')
   ▼
SettingRepository.get() / update() / createDefaultIfNotExists()
   ▼
Prisma → SQLite aplibrary.db  (model Setting, singleton)

KONSUMSI LOGO (Kartu Peminjaman):
PrintService.buildBorrowCardHtml(borrowingId)
   → Promise.all(BorrowRepository.findById, SettingService.get)
   → buildBorrowCardData(borrowing, settings, { readFileAsDataUri })
        → logoPath ? readFileAsDataUri(logoPath) : null   [path ABSOLUT saat ini]
   → generateBorrowCardHtml(data)  [data.header.logo = data URI | fallback monogram]
```

**Gap jalur upload:** renderer → main tidak ada IPC untuk memilih/menyalin file gambar. Alur di atas hanya **membaca** `logoPath`; tidak ada yang **menulis** nilainya selain edit DB manual.

---

## 4. Storage Analysis

### 4.1 Lokasi file logo

- **Folder target sudah ada dan dibuat idempoten:** `userData\assets\school-logo\` (didefinisikan `src/main/infrastructure/paths.ts` `assetSchoolLogoDir`, dibangun saat startup `bootstrapDataInfrastructure()`). Terverifikasi ada di disk: `C:\Users\hp\AppData\Roaming\APLibrary\assets\school-logo\` (KOSONG).
- Tidak ada folder `assets/` di repo (glob `assets/**` = 0). Logo bawaan (`resources/templates`) belum ada.

### 4.2 Representasi `logoPath`

- **Saat ini:** nilai dibaca **langsung sebagai path absolut** oleh `borrow-card.service.ts:354` → `readFileAsDataUri(logoPath)`. Semua smoke (`borrow_card_*`) mengisi nilai dummy absolut (`D:/logo.png`).
- **Arah RFC-001 §6.2 (locked):** `logoPath` harus menyimpan **path RELATIF** (`assets/school-logo/<file>.<ext>`); pembaca wajib melalui **resolver** (gabung `userData` + relatif) + fallback monogram.
- **Konsekuensi:** implementasi harus menambahkan resolver dan menangani kompatibilitas nilai absolut lama (bila ada data lama yang terisi).

### 4.3 Alternatif representasi yang ditolak / dihindari

- Menyimpan data URI/base64 di DB → membengkakkan row Setting; tidak sesuai RFC-001 §6.2.
- Menyimpan file di folder repo/prisma → melanggar boundary ADR-001 (data user harus di `userData`).
- **Tidak ada perubahan schema** → tidak ada migration baru.

---

## 5. Backup / Restore Compatibility

### 5.1 Kondisi saat ini (diverifikasi dari kode + artefak nyata)

- **Provider terdaftar (bootstrap.ts:192-194):** HANYA `DatabaseProvider` (`vacuum-into`). Komentar source: aset/configuration/log didaftarkan "saat data-nya tersedia — future".
- **RestoreHandler terdaftar (bootstrap.ts:219):** HANYA `DatabaseRestoreHandler`.
- **Manifest nyata** (backup hari ini `APLibrary-backup-20260806-120758-940b78b1.apbackup`):
  ```json
  "files":[{"path":"aplibrary.db","sizeBytes":712704,"sha256":"723f7c68…","kind":"database"}],
  "summary":{"files":1,"totalBytes":712704}
  ```
  → **aset TIDAK ada dalam backup.** Logo sekolah tidak akan selamat dari restore.

### 5.2 Kesiapan framework untuk aset

- Kontrak `BackupProvider` + `RestoreHandler` + kedua registry **sudah ada** (WO-3, `src/main/domain/provider/`).
- `PROVIDER_KINDS` memuat `database/asset/configuration/log` — kind **`asset`** sudah didukung di level tipe/validator (`ManifestEntry.kind`).
- RFC-001 §5.1 IN SCOPE menyatakan aset personal user (foto anggota, logo sekolah, template) **harus** masuk cakupan backup (future). §6.3: RFC tidak mengunci implementasi engine (sudah dikerjakan WO-4/5).
- **Kesimpulan:** untuk logo ikut backup/restore, perlu WO baru yang mendaftarkan `AssetProvider` (collect folder `assets/school-logo/`) + `AssetRestoreHandler` + wiring ke manifest/packager. Framework siap; tidak perlu ubah kontrak inti.

---

## 6. Reusable Utilities

| Utility | Lokasi | Reusability untuk Logo Management |
|---|---|---|
| `createAppPaths(root)` → `assetSchoolLogoDir` | `src/main/infrastructure/paths.ts` | **Reuse langsung** — lokasi file logo sudah disediakan |
| `DirectoryManager.ensureAll(dirs)` | `src/main/infrastructure/directory-manager.ts` | Reuse bila perlu buat subfolder baru (tidak wajib — folder sudah ada) |
| `readFileAsDataUri` + `IMAGE_MIME` | `electron/main/services/print.service.ts:59-69` (**private**) | **Refactor kecil**: perlu di-expose/move ke util bersama (mis. `src/main/infrastructure/file-utils.ts`) agar dipakai upload-preview + kartu tanpa duplikasi |
| `buildBorrowCardData` (logo + fallback monogram/book icon) | `src/main/services/borrow-card.service.ts:354` | Reuse jalur konsumsi — tinggal pastikan resolver relatif→absolut di-inject |
| `moveFilePreserving` / `removeSideFiles` / `resolveWithin` | `src/main/infrastructure/restore/fs-utils.ts` | Reuse untuk operasi copy/hapus file logo (guard path traversal) |
| `dialog` pola showSaveDialog | `print.service.ts:115` | Pola dialog main-process; **belum ada showOpenDialog** — perlu dibuat baru (pilih file gambar) |
| Toast `useNotification` | `src/notification/` (NS-1/NS-2) | Wajib dipakai; DILARANG `alert()`/`confirm()` browser di halaman baru |

---

## 7. Affected Modules

| Modul | Pengaruh | Catatan |
|---|---|---|
| `src/pages/SettingsPage.tsx` | **Utama** — ubah area logo placeholder → preview + tombol Pilih/Hapus; tambah field ke form state | Jangan pakai `alert()`; gunakan `useNotification` |
| `electron/ipc/setting.ipc.ts` | **+1 channel** (mis. `settings:uploadLogo` / `settings:removeLogo`) | Pilih file → salin ke `userData/assets/school-logo/` → set `logoPath` relatif |
| `electron/preload/setting.preload.ts` + `src/renderer/env.d.ts` | +1 method + tipe | |
| `electron/main/services/setting.service.ts` | +logika upload logo (validasi format/ukuran, copy file, update relatif) | `allowedFields.logoPath` sudah ada |
| `src/main/services/borrow-card.service.ts` | Resolver path relatif → absolut (ganti baca langsung) | Fallback monogram dipertahankan |
| `electron/main/services/print.service.ts` | Expose `readFileAsDataUri`/`IMAGE_MIME` ke util bersama | |
| `electron/main/bootstrap.ts` | HANYA bila upload memakai service baru di Container | |
| `src/utils/labels.ts` | Hapus `LOGO_COMING_SOON`; tambah label Pilih/Ganti/Hapus/format | |
| **Schema/Migration** | **TIDAK DIUBAH** | `logoPath` sudah ada |
| **Backup/Restore** | WO terpisah (future) bila logo harus ikut backup | Provider framework siap |

---

## 8. Risks & Open Questions

### Risks
- **R1 (Backup):** Logo tidak ikut backup/restore saat ini → hilang jika restore DB. Mitigasi: AssetProvider terpisah (WO future) atau dokumentasikan ke PO.
- **R2 (Path relatif vs absolut):** Konsumen saat ini baca `logoPath` sebagai absolut. Bila nilai lama sudah terisi (data lama), perlu resolver yang menerima keduanya (kompatibilitas) sebelum beralih ke relatif penuh.
- **R3 (Validasi file):** Tanpa batas format/ukuran, user bisa upload file raksasa/non-gambar → perlu `IMAGE_MIME` whitelist + ukuran maksimum + penamaan file aman (jangan ikut nama asli user mentah; hindari traversal).
- **R4 (Overwrite):** Upload ulang logo harus menimpa/ganti file lama secara aman (hapus file lama bila berubah nama, atau nama deterministik `logo.<ext>`).
- **R5 (Alur Preview konsumen):** Kartu peminjaman render di proses main (Electron) — preview logo di Settings (renderer) butuh jalur data URI terpisah; jangan sampai ada dua mekanisme berbeda.

### Open Questions (untuk PO)
1. **Format & ukuran maksimum logo** yang diizinkan (mis. PNG/JPG/SVG, ≤2 MB)?
2. **Penamaan file**: tetap `logo.<ext>` (deterministik, mudah ganti) atau nama ber-timestamp (preserve riwayat)?
3. **Saat logo dihapus**: hapus file dari disk, atau hanya kosongkan `logoPath`?
4. **Kebutuhan "Restore logo ikut backup"** masuk scope WO ini atau WO Backup terpisah?
5. **Ukuran tampilan**: perlu preview di tab Identitas + di Header/Sidebar aplikasi, atau cukup Kartu Peminjaman saja (seperti sekarang)?

---

## 9. Recommendation (untuk review PO — BELUM dieksekusi)

1. **Penyimpanan:** salin file ke `userData\assets\school-logo\<nama>`; simpan **path relatif** (`assets/school-logo/<nama>`) di `Setting.logoPath` (sesuai RFC-001 §6.2 locked). Tanpa migrasi schema.
2. **Resolver:** buat resolver terpusat (gabung `userData` + relatif, dengan toleransi absolut lama) yang di-inject ke `buildBorrowCardData`; pertahankan fallback monogram/book icon (D13).
3. **Upload:** IPC baru `settings:uploadLogo` (pola `dialog.showOpenDialog` + filter gambar `IMAGE_MIME` + copy via `moveFilePreserving`/fs-utils + validasi ukuran) dan `settings:removeLogo`.
4. **UI:** tab Identitas menampilkan preview logo (data URI dari file), tombol "Pilih Logo"/"Ganti Logo"/"Hapus Logo"; hapus label `LOGO_COMING_SOON`; gunakan `useNotification`.
5. **Refactor kecil:** pindahkan `readFileAsDataUri`/`IMAGE_MIME` ke util bersama agar tidak duplikasi antara upload-preview dan kartu.
6. **Backup/Restore (WO terpisah bila PO setuju):** daftarkan `AssetProvider` untuk `assets/school-logo/` + `AssetRestoreHandler` — framework WO-3/4/5 siap, kind `asset` sudah didukung.
7. **Validasi:** smoke (upload→baca→fallback→hapus), `npm run lint`, `npm run build`, `prisma migrate diff` = empty (tanpa migration), regression borrow-card suite.

---

*End of document. Audit READ ONLY — belum ada implementasi.*
