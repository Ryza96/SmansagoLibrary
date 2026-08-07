# RFC — LOGO MANAGEMENT ARCHITECTURE

- **Mode:** ARCHITECTURE DESIGN — NO IMPLEMENTATION. Belum ada coding, commit, branch, atau prototype.
- **Status:** DRAFT **REVISION 1** — menunggu persetujuan Product Owner.
- **Dasar:** `LOGO_MANAGEMENT_DISCOVERY.md` (READ ONLY, APPROVED) + fakta terverifikasi dari source & artefak + Review Product Owner (REVISION 1, 2026-08-06).
- **Keputusan terkunci yang dijadikan acuan (RFC-001 DATA PROTECTION, FINAL APPROVED):**
  - §6.2: Logo sekolah → `userData\assets\school-logo\`; `Setting.logoPath` menyimpan **path relatif**; konsumen memuat via **resolver** + fallback monogram (pola existing).
  - §4.4: Backup = "segala sesuatu di bawah `userData` yang merupakan hasil kerja/upload user" — logo masuk boundary backup (future).
- **Keputusan terkunci lain (WO-1..WO-6):** provider framework sudah ada (`BackupProvider`/`RestoreHandler`, kind `asset` sudah didukung); UI dilarang memakai `alert()`/`confirm()` browser (wajib `useNotification` NS-1).

**Revision Log**

| Rev | Perubahan (keputusan Product Owner) |
|---|---|
| 1 | Storage, Database (`Setting.logoPath`), Resolver, Backup/Restore (WO terpisah), Save Flow = **APPROVED** (dipertahankan). Naming → **`school-logo.<ext>`** (bukan `logo.<ext>`). Supported Format → **PNG / JPG / JPEG / WEBP** (GIF/BMP/ICO/SVG dihapus; SVG versi berikutnya). Maximum file size → **512 KB** (bukan 2 MB). **Section baru §9 Image Resize** (maks **512×512 px** sebelum simpan; library belum ditentukan). **Remove Flow → deferred**: preview kosong + status "akan dihapus", file lama tetap di disk sampai "Simpan Perubahan". Open Questions dipangkas ke yang belum diputuskan saja. |

---

## 1. Architecture Overview

Logo Management adalah fitur yang **melengkapi** alur yang sudah ada, bukan modul baru yang terpisah:

```
┌─ RENDERER (React) ──────────────────────────────────────────────┐
│  SettingsPage (tab Identitas)                                   │
│   • area logo: preview + tombol Pilih/Ganti/Hapus               │
│   • state: logoPending (none|replace|remove) +                  │
│             logoPreview (data URI | null)                       │
└──────────────┬──────────────────────────────────────────────────┘
               │  invoke
┌──────────────▼──────────────────────────────────────────────────┐
│  PRELOAD (setting.preload.ts)  →  ipcRenderer.invoke            │
└──────────────┬──────────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────────┐
│  MAIN PROCESS                                                    │
│  IPC setting.ipc.ts  →  SettingService                           │
│     • pickLogo  : dialog.showOpenDialog + validasi               │
│     • saveLogo  : resize ≤512×512 → salin ke assets/school-logo/ │
│                   → update Setting.logoPath (relatif)            │
│     • clearLogo : hapus file + logoPath=''  [DEFERRED — via Save]│
└──────┬───────────────────────────────┬──────────────────────────┘
       │                               │
       │ resolveAssetPath()            │ backup/restore (future)
       ▼                               ▼
┌──────────────────────┐   ┌──────────────────────────────────────┐
│  KONSUMEN LOGO        │   │  AssetProvider / AssetRestoreHandler │
│  PrintService →       │   │  (WO terpisah — framework siap)      │
│  buildBorrowCardData  │   └──────────────────────────────────────┘
└──────────────────────┘
```

**Prinsip arsitektur:**
1. **Satu sumber tulis** — hanya `SettingService` yang boleh menulis `logoPath` dan memanipulasi file logo (melalui method khusus). Renderer tidak pernah menyentuh filesystem.
2. **Satu resolver — WAJIB** — `resolveAssetPath()` menjadi **satu-satunya** tempat membaca/mengubah `logoPath` (relatif ↔ absolut). **Seluruh pembacaan logo wajib melalui resolver; tidak boleh ada service lain membaca `logoPath` secara langsung** (keputusan PO, REVISION 1). Ini termasuk konsumen kartu pinjam, preview, maupun utility backup/restore.
3. **Kontrak DTO aditif** — tidak ada perubahan schema (migration = 0); tidak ada perubahan kontrak IPC lama (`settings:get`/`settings:update` tetap).
4. **Backup/restore aset = desain di RFC ini, implementasi WO terpisah** (APPROVED, REVISION 1).

---

## 2. Storage Strategy

### Lokasi file
**File logo disimpan di `userData\assets\school-logo\`** (APPROVED, REVISION 1) — folder ini SUDAH ada, dibuat idempoten saat startup (`bootstrapDataInfrastructure()` → `createAppPaths().assetSchoolLogoDir`), dan telah diverifikasi ada di disk.

Alasan:
- **Boundary ADR-001** (data milik user wajib di bawah `userData`, bukan repo/`prisma/`).
- **RFC-001 §6.2 (locked)** menetapkan lokasi ini untuk logo sekolah.
- **Portable lintas mesin** — `userData` di-relokasi sesuai OS; path tidak bergantung lokasi instalasi.
- **Masuk cakupan backup** secara alami (subtree `assets/`), tidak perlu mekanisme khusus.

### Lifecycle file
| Tahap | Aksi | Pemilik |
|---|---|---|
| **Upload** | Validasi (format/ukuran, §8) → **resize ≤ 512×512 px (§9)** → salin ke `assets/school-logo/school-logo.<ext>` → hapus file logo lama lain bila ada → set `logoPath` | `SettingService.saveLogo` |
| **Baca** | Resolve relatif→absolut **via resolver `resolveAssetPath()` (wajib)** → `readFileAsDataUri` → data URI | Konsumen (PrintService) / preview (renderer via IPC) |
| **Replace** | Validasi → resize → salin file baru (timpa `school-logo.<ext>`) → hapus sisa file lama → set `logoPath` baru | `SettingService.saveLogo` |
| **Hapus** | **Deferred (REVISION 1):** pada "Simpan Perubahan" → hapus file dari disk → `logoPath=''`; file lama **TETAP di disk** sampai Save | `SettingService.clearLogo` |
| **Backup** | Copy subtree `assets/school-logo/` ke staging wadah | `AssetProvider` (future) |
| **Restore** | Extract staging → swap ke `assets/school-logo/` | `AssetRestoreHandler` (future) |
| **Rollback restore** | Pulihkan dari snapshot folder aset | `AssetRestoreHandler.rollbackFrom` |

**Invarian:** paling banyak **satu** file logo aktif per saat (`school-logo.*`, aturan penamaan deterministik §4). Tidak ada akumulasi file basi di luar skenario crash menengah (dibersihkan pada upload berikutnya).

---

## 3. Folder Structure

```
userData/                                  ← app.getPath('userData') (sudah ada)
├── assets/                                ← SUDAH ADA (paths.ts)
│   ├── school-logo/                       ← SUDAH ADA — LOKASI LOGO
│   │   └── school-logo.png                ← file logo aktif (contoh; nama §4)
│   ├── member-photos/                     ← future (tidak disentuh)
│   └── templates/                         ← future (tidak disentuh)
├── database/                              ← future (relokasi DB, Q2–Q5 ADR-001)
├── backup/                                ← SUDAH ADA (manual/scheduled)
├── logs/  ·  settings/  ·  temp/          ← SUDAH ADA
```

Tidak ada folder baru yang perlu dibuat — `createAppPaths`/`appDirectoryList` (paths.ts) dan `DirectoryManager.ensureAll` sudah mencakup seluruhnya. Implementasi cukup memakai `paths.assetSchoolLogoDir`.

---

## 4. Naming Strategy

Bandingkan 4 opsi untuk nama file di `assets/school-logo/`:

| Opsi | Contoh | Kelebihan | Kekurangan / Risiko |
|---|---|---|---|
| **A. `school-logo.png`** (basename tetap self-documenting + ekstensi dari upload) | `school-logo.png` / `school-logo.webp` | Deterministik; self-documenting; mudah dikenali; konsisten dengan nama folder `school-logo`; menghindari konflik bila di masa depan ada logo lain; replace = overwrite alami; backup/restore path stabil | Ekstensi dapat berubah antar upload (png→jpg) → perlu hapus sisa `school-logo.*` lain; tidak menyimpan riwayat versi |
| **B. `logo.<ext>`** (basename generik) | `logo.png` / `logo.jpg` | Sama seperti A secara teknis | **DITOLAK PO (REVISION 1)** — tidak self-documenting; berpotensi konflik dengan logo domain lain di masa depan |
| **C. `school-logo-uuid.png`** (acak per upload) | `school-logo-7f3a...png` | Bebas tabrakan; mendukung riwayat multi-versi | `logoPath` harus diubah tiap upload; **akumulasi file basi** (tidak ada garbage collector); nama tidak terbaca manusia |
| **D. `school-logo-timestamp.png`** (stempel waktu) | `school-logo-20260806-120758.png` | Terurut; readable; riwayat versi | **Akumulasi file basi**; bergantung jam sistem; `logoPath` berubah tiap upload |

**KEPUTUSAN PO (REVISION 1): A — nama tetap `school-logo.<ext>`** dengan aturan:

1. **Basename TETAP `school-logo`**; ekstensi ditentukan dari format file terpilih yang lolos validasi (§8) — hanya `png | jpg | jpeg | webp`, normalisasi huruf kecil.
2. Sebelum menulis file baru, **hapus seluruh `school-logo.*`** di `assets/school-logo/` (guard hanya di dalam folder itu — pakai `resolveWithin`).
3. `logoPath` yang disimpan: `assets/school-logo/school-logo.<ext>` (relatif, §5).

Alasan (PO): self-documenting, mudah dikenali, menghindari konflik bila di masa depan terdapat logo lain, dan konsisten dengan nama folder `school-logo`. Opsi C/D membawa biaya pemeliharaan (stale cleanup) tanpa manfaat bagi domain ini (konsumen tunggal = kartu peminjaman).

---

## 5. Data Strategy

Bandingkan representasi `Setting.logoPath`:

| Aspek | Absolut (`D:/Users/.../logo.png`) | **Relatif (`assets/school-logo/school-logo.png`)** | Filename saja (`school-logo.png`) |
|---|---|---|---|
| Baca langsung saat ini | ✓ (borrow-card membaca apa adanya) | ✗ butuh resolver | ✗ butuh resolver |
| Portable lintas mesin | ✗ — path pengguna lama | ✓ | ✓ |
| Backup/restore lintas mesin | ✗ — path tidak valid di mesin lain | ✓ — cocok `ManifestEntry.path` | ✓ (tapi kehilangan konteks folder) |
| Multi-device / pindah userData | ✗ | ✓ | ✓ |
| Anti-ambiguity (folder mana) | ✓ | ✓ | ✗ — bergantung konvensi folder tunggal |
| Konsisten RFC-001 §6.2 (locked) | ✗ | ✓ | sebagian |
| Migrasi nilai lama | harus | toleransi absolut lama (lihat §12) | — |

**REKOMENDASI (APPROVED, REVISION 1): path RELATIF terhadap `userData`** → `assets/school-logo/school-logo.png`.

- Format relatif memakai **forward slash** (`assets/...`) — identik dengan aturan `ManifestEntry`/`isRelativeManifestPath` (RFC-002) sehingga satu set aturan path dipakai bersama.
- Resolusi absolut hanya terjadi di **resolver** (`resolveAssetPath`), bukan di konsumen.
- `logoPath` tetap di-whitelist `SettingService.allowedFields` (tidak berubah). **Tidak ada migration** (APPROVED, REVISION 1).

---

## 6. Renderer Flow

Alur yang direkomendasikan (menghormati pola Save-button halaman Settings; **APPROVED — Save Flow TETAP**):

```
User
  │
  ▼  (1) klik "Pilih Logo" / "Ganti Logo"
SettingsPage → api.settings.pickLogo()
  │  (2) main: dialog openFile → validasi → [tidak menyalin, tidak menulis DB]
  │      return { canceled, filePath?, fileName?, sizeBytes?, previewDataUri? }
  ▼
(3) Preview ditampilkan dari previewDataUri (data URI) + info file (nama, ukuran)
  │     • state logoPending = 'none' | 'replace' | 'remove'
  │     • tombol "Hapus Logo" tersedia; current logo tetap tampil bila batal
  ▼
(4) klik "Hapus Logo"  →  preview KOSONG + status "akan dihapus"
  │     • file lama TETAP di disk; logoPath DB TIDAK berubah (REVISION 1)
  │     • dapat dibatalkan (logo lama kembali tampil) sebelum Save
  ▼
(5) klik "Simpan Perubahan"
  │  api.settings.update({ ...form, logoUpload? , logoClear? })
  │     • logoUpload = { sourcePath }  → main resize + salin + set logoPath
  │     • logoClear = true             → main hapus file + logoPath=''
  │     • (keduanya opsional; text fields tetap dikirim biasa)
  ▼
(6) Refresh UI dari return `settings.update` (logoPath + logoPreview baru)
```

**Catatan desain:**
- Logo **belum ditulis / belum dihapus** saat dialog ditutup — baru dikomit pada Save, bersama field teks, dalam SATU panggilan IPC (atomik logis). Ini berlaku simetris untuk upload **dan** remove (REVISION 1).
- Preview diperoleh dari **main** (renderer tidak punya akses filesystem) lewat channel `pickLogo` yang mengembalikan data URI langsung.
- `logoUpload`/`logoClear` adalah **key direktif** yang diproses `SettingService` (bukan dipersist sebagai field), sehingga kontrak `settings.update` tetap aditif.

---

## 7. Main Process Flow

```
Renderer (invoke)
   │  settings:pickLogo   settings:readLogoPreview  settings:update {logoUpload|logoClear}
   ▼
electron/ipc/setting.ipc.ts  (handler — validasi argumen DTO)
   ▼
SettingService
   │
   ├── pickLogo():
   │     dialog.showOpenDialog({ filters: LOGO_IMAGE_MIME, properties:['openFile'] })
   │        → canceled?  return { canceled:true }
   │        → validate format & ukuran (§8)  → gagal: AppError 400
   │        → readFileAsDataUri(filePath)  → previewDataUri
   │        → return { canceled:false, filePath, fileName, sizeBytes, previewDataUri }
   │
   ├── saveLogo(sourcePath):                       [dipanggil dari update() bila logoUpload]
   │     re-validate format & ukuran (§8)
   │     resizeImage(sourcePath) → versi ≤ 512×512 px (§9)
   │     targetAbs = resolveAssetPath('assets/school-logo')   [via paths.assetSchoolLogoDir]
   │     cleanupLegacyLogos(dir)  → hapus semua school-logo.*  [resolveWithin guard]
   │     copyFile(resized → dir/school-logo.<ext>)             [fs-utils.moveFilePreserving]
   │     update DB logoPath = 'assets/school-logo/school-logo.<ext>'
   │        → gagal update → best-effort hapus file baru → throw AppError
   │
   ├── clearLogo():                                  [dipanggil dari update() bila logoClear — DEFERRED]
   │     hapus school-logo.* di dir (resolveWithin guard)
   │     update DB logoPath = ''
   │
   └── update(data):
         proses logoUpload/logoClear terlebih dahulu
         → whitelist field teks (allowedFields, logoPath tetap ikut)
         → SettingRepository.update
         → get() → return
```

**Satu-satunya titik tulis DB = `SettingRepository.update`; satu-satunya titik manipulasi file = method logo pada `SettingService`.** Tidak ada jalur lain.

---

## 8. Validation Rules

| Aturan | Nilai | Sumber |
|---|---|---|
| **Ekstensi** | whitelist **`LOGO_IMAGE_MIME`: `.png .jpg .jpeg .webp`** — **GIF/BMP/ICO/SVG DIHAPUS** (REVISION 1; SVG dipertimbangkan versi berikutnya) | baru (util bersama; `IMAGE_MIME` existing memuat 8 format — dipakai DI-FILTER, jangan dibiarkan mentah) |
| **MIME sniffing** | minimal cek magic bytes opsional (PNG `89 50 4E 47`, JPEG `FF D8`) — tingkat ketat Open Question §16 | baru |
| **Ukuran maksimum** | **≤ 512 KB** (REVISION 1 — bukan 2 MB) | baru |
| **Ukuran minimum** | file > 0 byte | baru |
| **Resize** | maksimum **512 × 512 pixel** sebelum disimpan (§9) | REVISION 1 |
| **Nama file target** | selalu `school-logo.<ext>` (basename tetap `school-logo`) + ekstensi huruf kecil | §4 / REVISION 1 |
| **Overwrite** | hapus seluruh `school-logo.*` lama di folder sebelum tulis baru (guard `resolveWithin`) | §4/§10 |
| **Rename** | tidak ada rename user; nama deterministik oleh sistem | §4 |
| **Path traversal** | `resolveWithin` pada semua operasi file (copy/hapus/backup) | pola `fs-utils.ts` |
| **Upload ganda** | Save menimpa; tidak ada konfirmasi ganda (toast info) | UX |

Semua validasi terjadi di **main** (server-side); renderer hanya menampilkan error dari IPC (`err.message` via `useNotification`).

---

## 9. Image Resize (BARU — REVISION 1)

Sebelum file disimpan ke `userData`, gambar **di-resize** agar dimensinya tidak melebihi batas maksimum:

```
Image (lolos validasi §8)
   │
   ▼
Resize → maksimum 512 × 512 pixel
   │
   ▼
Simpan ke assets/school-logo/school-logo.<ext>
   │
   ▼
logoPath = 'assets/school-logo/school-logo.<ext>'
```

**Tujuan (keputusan PO):**
- ukuran file kecil;
- loading cepat;
- konsisten untuk preview;
- konsisten untuk proses cetak;
- menghindari gambar beresolusi sangat besar.

**Aturan desain:**
1. Resize terjadi **di main process**, di dalam `SettingService.saveLogo`, **setelah** validasi format/ukuran (§8) dan **sebelum** copy ke `assets/school-logo/`.
2. Yang disimpan di disk & dirujuk `logoPath` adalah **versi hasil resize** — bukan file asli upload. File asli tidak pernah disimpan.
3. Dimensi target default: **maksimum 512 × 512 pixel**. Kebijakan detail (downscale-only vs upscale, aspek ratio) = Open Question §16 (default: **downscale-only, pertahankan rasio aspek / contain**).
4. **DESAIN SAJA — library implementasi BELUM ditentukan** (keputusan PO: "Belum perlu menentukan library implementasi"). Keputusan library dilakukan saat fase implementasi WO; RFC hanya mengunci hasil perilaku (output ≤ 512×512 px).

---

## 10. Replace Logo Flow

1. User klik "Ganti Logo" (tombol yang sama dengan Pilih saat logo sudah ada).
2. `pickLogo()` → dialog → validasi → preview baru ditampilkan (logo lama masih di disk).
3. User klik "Simpan Perubahan".
4. `saveLogo(sourcePath)`:
   - re-validasi format/ukuran;
   - `resizeImage(sourcePath)` → versi ≤ 512×512 px (§9);
   - `cleanupLegacyLogos()` — hapus semua `school-logo.*` di `assets/school-logo/` (membuang file versi lama);
   - salin file hasil resize → `school-logo.<ext>` (ext bisa berubah);
   - `update` DB `logoPath = assets/school-logo/school-logo.<ext>`;
   - gagal update → hapus file baru (rollback best-effort) → throw.
5. UI refresh: preview baru + `logoPath` baru.

**Invarian:** setelah replace, tepat satu file `school-logo.*` ada dan `logoPath` menunjuk ke sana. Gagal di tengah (copy sukses, DB gagal) → file baru dihapus → kondisi tetap seperti sebelum replace.

---

## 11. Remove Logo Flow (DIUBAH — REVISION 1, DEFERRED)

Alur lama: klik "Hapus" langsung menghapus file + DB. **Alur baru: penghapusan ditunda sampai "Simpan Perubahan".**

```
1. User klik "Hapus Logo" (muncul saat logoPath terisi atau logo ter-preview).
2. Preview logo menjadi KOSONG; status area logo = "akan dihapus" (pending removal).
3. (opsional) konfirmasi via useNotification().confirm — Open Question §16.
4. User klik "Simpan Perubahan" → update({ logoClear: true }) → clearLogo():
   - hapus school-logo.* di assets/school-logo/ (guard resolveWithin);
   - update DB logoPath = ''.
5. UI refresh: area logo kembali ke state kosong ("Pilih Logo"), preview dihapus.
```

**Kritis (REVISION 1):** selama user **belum menekan "Simpan Perubahan"**, **file logo lama tetap berada di disk** dan `logoPath` DB tidak berubah. Bila user membatalkan (tanpa Save), logo lama tetap utuh. Ini simetris dengan alur upload (Save Flow, REVISION 1).

**Catatan:** `logoPath` kosong + file hilang = fallback monogram/ikon buku pada kartu pinjam (D13, sudah ada). Perilaku tidak berubah.

---

## 12. Backward Compatibility

Kondisi saat ini: `logoPath` disimpan sebagai nilai yang **dibaca langsung sebagai path absolut** oleh `borrow-card.service.ts:354` (`readFileAsDataUri(settings.logoPath)`). Nilai lama yang mungkin ada di DB dev adalah path absolut (mis. `D:/logo.png`) atau `''`.

**Mandat REVISION 1:** **seluruh pembacaan `logoPath` WAJIB melalui resolver `resolveAssetPath()`. Tidak boleh ada service lain membaca `logoPath` secara langsung.** Pada fase implementasi, titik baca langsung di `borrow-card`/`PrintService` diarahkan ke resolver.

Aturan kompatibilitas pada **resolver** `resolveAssetPath(value)`:

```
1. '' | null → null (tidak ada logo → fallback monogram)
2. value berawalan '/', '\', mengandung ':' (drive), atau 'file://'
      → dianggap ABSOLUT LAMA → gunakan apa adanya bila file ada
      → bila tidak ada → null (fallback)
3. selainnya → RELATIF → gabung dengan paths.root (resolveWithin guard)
      → assets/school-logo/school-logo.png → userData/assets/school-logo/school-logo.png
      → file tidak ada → null (fallback)
```

- Konsumen `buildBorrowCardData` TIDAK berubah perilakunya — resolver di-inject di titik `readFileAsDataUri` (PrintService) sehingga data URI diterima assembler seperti sekarang.
- Nilai absolut lama TIDAK perlu di-migrasi/di-backfill (dibiarkan terbaca via resolver); upload berikutnya menimpanya dengan nilai relatif.
- Tidak ada perubahan schema → `prisma migrate diff` = "This is an empty migration." (diverifikasi tiap WO).

---

## 13. Backup Integration (DESIGN — bukan implementasi; WO terpisah, APPROVED REVISION 1)

Aset logo **belum** ikut backup saat ini (manifest nyata hanya memuat `aplibrary.db`). Desain pemanfaatan framework yang SUDAH ADA (WO-3/4/5):

### AssetProvider (implementasi `BackupProvider`, kind `asset`)
- `id = ProviderId.of({ name: 'school-logo', version: '1.0.0' })`, `requirement = 'optional'` (logo tidak wajib — hilang hanya fallback monogram).
- `collect()`:
  - jika `assets/school-logo/` kosong → **skip tanpa error** (provider opsional di-skip → `SUCCESS_WITH_WARNING` atau bersih — keputusan: skip bersih bila folder kosong);
  - salin setiap file `school-logo.*` ke staging provider (`providerStagingDirs` mapping di bootstrap) dengan `relativePath = 'assets/school-logo/<nama>'` (subfolder — format sudah didukung `ManifestEntry.path`/packager).
  - return `collectResultOf({ kind: 'asset', relativePath, sizeBytes })`.
- `verify(entry)` — ukuran + SHA-256 staging vs manifest.
- `cleanup()` — hapus staging.
- Tidak ada perubahan kontrak provider; hanya registrasi baru di bootstrap: `providerRegistry.register(schoolLogoProvider)` + `providerStagingDirs.set(id.fullName, stagingDir)`.

### Interaksi engine (tidak berubah)
- `BackupService.run` memanggil provider via registry — provider aset otomatis masuk pipeline collect→manifest→package→verify (kode existing, tidak diubah).
- Manifest akan memuat 2 entri: `aplibrary.db` (database, required) + `assets/school-logo/school-logo.png` (asset, optional).

---

## 14. Restore Integration (DESIGN — bukan implementasi; WO terpisah, APPROVED REVISION 1)

### AssetRestoreHandler (implementasi `RestoreHandler`, kind `asset`)
- `matches(entry)` → `entry.kind === 'asset'`.
- `stage(entry)` → salin hasil extract (`extractDir/assets/school-logo/...`) ke staging handler.
- `verifyStaged(entry)` → ukuran + SHA-256 staging.
- **`captureSafeSnapshot()`** (implementasi `SafeSnapshotCapable`) → salin seluruh isi `assets/school-logo/` live ke `snapshotDir/assets/school-logo/` sebelum swap (jaringan pengaman; konsisten ADR-001 prinsip 5).
- `swapToLive(entry)` → **satu-satunya titik tulis live** (invarian ADR-001 §3.3): `resolveWithin(liveDir, entry.path)` guard → hapus `school-logo.*` live → salin staging → live. (Tanpa disconnect DB — operasi murni file, tidak mengganggu DB.)
- `rollbackFrom(entry)` → restore isi `assets/school-logo/` dari snapshot.
- `cleanup()` → buang staging.
- Registrasi: `restoreHandlerRegistry.register(schoolLogoHandler)` di bootstrap.

### Interaksi engine (tidak berubah)
- `RestoreService.run` iterasi `manifest.files` → matcher handler → stage/verify → snapshot → swap → rollback — semuanya kode existing. Aset menjadi entri ke-2 tanpa ubah engine.
- **Gate database tetap wajib** (`dbEntries.length === 1`) — aset tidak mengubah aturan itu.
- Bila backup TANPA aset (backup lama) → tidak ada entri asset → handler tidak dipanggil → folder aset live dibiarkan (atau dibersihkan? → Open Question §16).

> Batas WO: Backup/Restore aset adalah **WO terpisah** setelah RFC ini disetujui — RFC ini hanya mengunci kontrak/desain (APPROVED REVISION 1).

---

## 15. Sequence Diagrams

### 15.1 Upload Logo (termasuk resize)

```
User      SettingsPage        preload         IPC handler        SettingService          FS/userData       DB (Setting)
 │            │                 │                │                     │                      │                 │
 │ klik       │                 │                │                     │                      │                 │
 ├──────────►│ pickLogo()       │                │                     │                      │                 │
 │            ├────────────────►│ invoke         │                     │                      │                 │
 │            │                 ├───────────────►│                     │                      │                 │
 │            │                 │                │ showOpenDialog()   │                      │                 │
 │            │                 │                ├────────────────────►│                      │                 │
 │ (pilih file│                 │                │   filePath          │                      │                 │
 │  di dialog)│                 │                │◄────────────────────┤                      │                 │
 │            │                 │                │                     │ validasi format/size  │                 │
 │            │                 │                │                     ├──────────────► (baca)  │                 │
 │            │                 │                │                     │ previewDataUri        │                 │
 │            │                 │◄───────────────┤  {filePath,size,uri} │                      │                 │
 │            │◄────────────────┤                 │                     │                      │                 │
 │ preview    │                 │                 │                     │                      │                 │
 ├──────────►│ (Simpan) update({...form, logoUpload})                 │                      │                 │
 │            ├────────────────►│ invoke          │                     │                      │                 │
 │            │                 ├────────────────►│                     │                      │                 │
 │            │                 │                 │ saveLogo(sourcePath)│                      │                 │
 │            │                 │                 ├────────────────────►│ validasi + resize ≤   │                 │
 │            │                 │                 │                     │ 512×512               │                 │
 │            │                 │                 │                     │ cleanup school-logo.* │                 │
 │            │                 │                 │                     ├─────────────────────►│ (hapus)          │
 │            │                 │                 │                     │ copy (resized)       │                 │
 │            │                 │                 │                     ├─────────────────────►│ (tulis)          │
 │            │                 │                 │                     │ update logoPath      ├─────────────────►│
 │            │                 │                 │                     │                      │                 │
 │            │                 │◄────────────────┤  settings (baru)    │◄─────────────────────┤◄────────────────┤
 │            │◄────────────────┤                 │                     │                      │                 │
 │ refresh UI │                 │                 │                     │                      │                 │
◄┘            │                 │                 │                     │                      │                 │
```

### 15.2 Remove Logo (DEFERRED — REVISION 1)

```
User      SettingsPage        preload         IPC handler        SettingService          FS/userData       DB (Setting)
 │            │                 │                │                     │                      │                 │
 │ Hapus      │                 │                │                     │                      │                 │
 ├──────────►│ preview KOSONG + │                │                     │                      │                 │
 │            │ status "akan     │                │                     │                      │                 │
 │            │ dihapus"         │                │                     │                      │                 │
 │            │ (file & DB       │                │                     │                      │                 │
 │            │  TIDAK berubah)  │                │                     │                      │                 │
 │            │                 │                │                     │                      │                 │
 │ (Simpan)   │ update({logoClear:true})         │                     │                      │                 │
 ├──────────►│                 ├────────────────►│                     │                      │                 │
 │            │                 │                │ clearLogo()         │                      │                 │
 │            │                 │                ├────────────────────►│ hapus school-logo.*    │                 │
 │            │                 │                │                     ├─────────────────────►│ (hapus)          │
 │            │                 │                │                     │ logoPath=''          ├─────────────────►│
 │            │                 │                │◄────────────────────┤◄─────────────────────┤◄────────────────┤
 │            │◄────────────────┤ settings       │                     │                      │                 │
 │ kosong     │                 │                │                     │                      │                 │
◄┘            │                 │                │                     │                      │                 │
```

### 15.3 Load Logo (konsumen — kartu pinjam; resolver WAJIB)

```
Renderer(preview)  PrintService      buildBorrowCardData   resolver (WAJIB)      FS/userData     DB (Setting)
     │                  │                   │                  │                  │                │
     │ getBorrowCardPreviewHtml(id)         │                  │                  │                │
     ├─────────────────►│ findById + settings.get()            │                  │                │
     │                  ├───────────────────►│                  │                  ├───────────────►│
     │                  │                   │                  │◄─────────────────┤ (logoPath)     │
     │                  │   readFileAsDataUri → WAJIB via      │                  │                │
     │                  │   resolveAssetPath()                 │                  │                │
     │                  ├───────────────────►│ resolveAssetPath│                  │                │
     │                  │                   ├─────────────────►│                  │                │
     │                  │                   │  abs path         ├─────────────────►│ (baca)          │
     │                  │                   │◄──────────────────┤◄─────────────────┤                 │
     │                  │  data URI │ logo ''│ (fallback monogram bila gagal)      │                │
     │◄─────────────────┤  HTML siap render   │                  │                  │                │
◄┘   │                  │                   │                  │                  │                │
```

---

## 16. Open Questions (untuk persetujuan Product Owner — REVISION 1)

Keputusan REVISION 1 yang sudah disetujui **tidak lagi tercantum**: storage lokasi (`userData/assets/school-logo/`), DB (`Setting.logoPath`, tanpa migration), resolver (`resolveAssetPath()` sebagai satu-satunya pembaca), backup/restore (WO terpisah), naming (`school-logo.<ext>`), format (PNG/JPG/JPEG/WEBP), ukuran maks (512 KB), resize (≤512×512 px), save flow (komit saat "Simpan Perubahan"), remove flow (deferred).

Hanya keputusan yang **benar-benar belum disetujui**:

| # | Pertanyaan | Default (bila PO tidak menetapkan) |
|---|---|---|
| 1 | Tingkat validasi isi: hanya ekstensi, atau + magic-byte/MIME sniffing (PNG `89 50 4E 47`, JPEG `FF D8`)? | Ekstensi whitelist saja (v1); sniffing opsional |
| 2 | Saat restore backup TANPA entri aset: bersihkan folder logo live atau biarkan? | **Biarkan** (non-destruktif) |
| 3 | Apakah logo juga perlu tampil di Header/Sidebar/Dashboard (bukan hanya kartu pinjam)? | **Tidak** (kartu pinjam saja — sesuai discovery) |
| 4 | Hapus Logo: perlu dialog konfirmasi (`confirm` danger) atau status "akan dihapus" sudah cukup? | Status "akan dihapus" saja (reversibel sampai Save) |
| 5 | `logoPath` absolut lama di DB dev — perlu dibersihkan saat fitur rilis, atau dibiarkan terbaca via resolver? | **Dibiarkan** (resolver toleran) |
| 6 | Resize: gambar lebih kecil dari 512×512 — di-upscale ke 512×512 atau dibiarkan ukuran asli? | **Dibiarkan** (downscale-only; jangan upscale) |
| 7 | Resize: pertahankan rasio aspek (contain) atau potong persegi (cover 512×512)? | **Pertahankan rasio aspek (contain)** |

---

*End of RFC (REVISION 1) — ARCHITECTURE DESIGN only. Belum ada implementasi, coding, atau commit. Menunggu persetujuan Product Owner sebelum fase implementasi.*
