# WORK ORDER — LOGO MANAGEMENT — WO-2 BACKEND

Status: **DONE — READY review PO** (tidak lanjut WO berikutnya)

## Sumber Kebenaran
- `RFC_LOGO_MANAGEMENT_ARCHITECTURE.md` (LOCKED REVISION 1) — SSOT: §7 saveLogo/clearLogo,
  §8 validasi, §9 resize ≤512, §10 invariant + rollback, §12 resolver, §15.1 pickLogo.
- `LOGO_MANAGEMENT_DISCOVERY.md` (APPROVED)
- `WORK_ORDER_LOGO_1_FOUNDATION.md` (commit `a541dd1`) — logo-config, resolver,
  `cleanupLegacyLogos`.

## Ringkasan
Backend Modul Logo Management lengkap: save/remove logo via `SettingService` + alur
pilih file (`settings:pickLogo` IPC + `showOpenDialog`). **Seluruh validasi & resize
terjadi di main** — renderer HANYA konsumen (belum ada UI; itu WO-3). Resize memakai
**sharp** (downscale-only `contain`, ≤512×512, format output = format input); save
**atomik** (temp → move → update DB; gagal di tengah → file baru dihapus); remove via
`cleanupLegacyLogos`. `logo-config.ts` / `asset-resolver.ts` (WO-1) DIPAKAI, TIDAK
diduplikasi.

## File
**Baru (2 source + 1 DTO + 1 smoke):**
- `src/shared/dto/logo.ts` — kontrak IPC `PickLogoResult`:
  `{ canceled: true } | { canceled: false; filePath; sizeBytes; previewUri }`.
- `src/main/infrastructure/asset/logo-resize.ts` — `LOGO_RESIZE_MAX_DIMENSION = 512`;
  `resizeLogoImage(sourcePath)` murni: metadata → sudah ≤512×512 → **byte asli**
  dikembalikan (`readFile`, tanpa re-encode); lebih besar → `sharp.resize({width:512,
  height:512, fit:'inside', withoutEnlargement:true})`. Format output = format input.
- `wo2_logo_backend_smoke/smoke.ts` — **41/41 PASS** (fresh DB temp, 4 migrations).

**Dimodifikasi (8 source/config + 2 smoke call-site):**
- `electron/main/services/setting.service.ts` — ctor `(settingRepository,
  assetSchoolLogoDir)`; `pickLogoPreview(filePath)` (validasi → resize → data URI
  WYSIWYG = hasil resize yang sama dengan yang disimpan); `saveLogo(sourcePath)` (RFC
  §7/§8/§9/§10: stat+validasi → resize → mkdir → `cleanupLegacyLogos` → `resolveWithin`
  target → tulis `*.tmp` → `moveFilePreserving` → `update({logoPath:
  'assets/school-logo/school-logo.<ext>'})` → **gagal → unlink temp+target best-effort
  → AppError 500 'Gagal menyimpan logo sekolah.'**); `clearLogo()` (`cleanupLegacyLogos`
  + `update({logoPath:''})`); `update()` memproses **fase logo dulu** (`logoUpload`
  string non-kosong → saveLogo; `logoClear===true` → clearLogo) lalu whitelist 21 field
  teks + `logoPath`; `LOGO_ERROR_MESSAGES` (3 pesan) + `assertValidLogo`/`resizeWithError`
  (decode gagal → AppError 400 'File tidak dapat diproses sebagai gambar.'); import
  `AppError` via `../errorHandler`.
- `electron/main/bootstrap.ts` — `new SettingService(settingRepository,
  paths.assetSchoolLogoDir)` (paths = struktur userData ADR-001).
- `electron/ipc/setting.ipc.ts` — handler `settings:pickLogo` (RFC §15.1):
  `showOpenDialog` (parent window bila ada) filter `['png','jpg','jpeg','webp']` →
  canceled → `{canceled:true}` → `pickLogoPreview(filePath)` → `{canceled:false,...}`.
- `electron/preload/setting.preload.ts` — `settings.pickLogo`.
- `src/renderer/env.d.ts` — `pickLogo: () => Promise<PickLogoResult>`.
- `electron.vite.config.ts` — `main.build.rollupOptions.external` → `['@prisma/client',
  'sharp']` (sharp tidak dibundel; runtime `require('sharp')`).
- `electron-builder.yml` — `asarUnpack` + `node_modules/@img/**` dan
  `node_modules/sharp/**` (native N-API harus diextract saat package).
- `package.json`/`package-lock.json` — `sharp ^0.35.3` (vips 8.18.3, kompatibel
  Electron tanpa rebuild).
- `borrow_card_uat_smoke/smoke.ts` + `wo2_borrow_card_preview_smoke/smoke.ts` — ctor
  `SettingService` memakai `path.join(os.tmpdir(), ...)` (breaking 2-arg lama).

## TIDAK Diubah
RFC, `logo-config.ts`, `asset-resolver.ts` (dipakai apa adanya), `borrow-card.service.ts`
(template/assembler), `PrintService`, renderer/UI/SettingsPage, schema/migration
(`prisma migrate diff` = "This is an empty migration."), `BorrowService`/`ReturnService`,
jalur PDF/print/label. Catatan: `src/main/services/borrow-card.service.ts` masih
memuat modifikasi pre-existing `@media print` (BUKAN bagian WO-2, tidak diikutkan).

## Validation PASS
1. `npm run lint` (tsc node+web) PASS.
2. `npm run build` PASS — main **2,052.36 kB** · preload **11.06 kB** · renderer
   **1,188.20 kB** (assets/index-C23_OADP.js; renderer tidak berubah oleh WO-2).
3. Smoke `wo2_logo_backend_smoke` **41/41 PASS** (fresh DB temp, 4 migrations):
   - STEP 2 resize murni: 100×200 & 512×512 → byte identik (tanpa upscale/re-encode);
     2000×1000→512×256; 1500×500→512×171; webp 800×800→512×512; format output
     png/jpeg/webp sesuai input.
   - STEP 3 `pickLogoPreview`: shape `{filePath,sizeBytes,previewUri}`; preview =
     hasil RESIZE (data URI `data:image/png;base64,...`); 4 penolakan validasi
     (format/empty/512KB/decode).
   - STEP 4 `saveLogo` happy path: `logoPath` relatif forward-slash, file = hasil
     resize 512×256, tepat satu `school-logo.*`.
   - STEP 5 replace via `cleanupLegacyLogos`: png→webp→png, DB logoPath ikut.
   - STEP 6 rollback (RFC §10): update DB gagal (repo stub) → AppError + folder
     bersih (file baru dihapus).
   - STEP 7 `clearLogo`: DB `''` + folder bersih.
   - STEP 8 `update(logoUpload/logoClear)` + field teks (fase logo lalu whitelist).
   - STEP 9 upload invalid → ditolak, field teks TIDAK tertulis.
   - STEP 10 backward-compat `get()` + regresi repo.
4. Regression **wo1_logo_foundation 57/57 PASS** (murni) + **borrow_card_uat 31/31
   PASS** (fresh DB temp) — jalur create→findById→preview utuh setelah perubahan
   ctor SettingService.
5. `prisma migrate diff --from-migrations` = "This is an empty migration." (schema
   tidak disentuh).
6. Wiring bundle (fresh build): `require("sharp")` ×1 (externalized), `settings:pickLogo`
   ×1 di main + ×1 di preload, `Pilih Logo Sekolah` ×1, `LogoValidationError` ×2,
   `resizeLogoImage` ×2, `Gagal menyimpan logo sekolah.` ×1. DB temp & fs temp
   dibersihkan.

## Keputusan Teknis
- **sharp dipilih (0.35.3)** — N-API native, kompatibel Electron tanpa rebuild, encode
  PNG/JPEG/WebP andal; di-*external* di `electron.vite.config.ts` + `asarUnpack`
  (`@img/**` + `sharp/**`) karena mengandung native `.node` yang harus diextract saat
  packaging.
- **Resize ≤512 = downscale-only + contain** (RFC §9 / OQ #6/#7 default): gambar sudah
  ≤512×512 → **byte asli** dikembalikan (tidak re-encode → kualitas & byte persis
  input); format output = format input → ekstensi target konsisten whitelist RFC §4.
- **saveLogo atomik** (RFC §10): tulis `*.tmp` → `moveFilePreserving` → update DB;
  kegagalan update DB → unlink temp+target best-effort → AppError 500 (folder kembali
  ke kondisi sebelum replace). Single point manipulasi file = service (konsisten WO-1).
- **`update()` fase logo dulu, whitelist teks setelah** — `logoUpload`/`logoClear`
  diproses SEBELUM field teks; saat logo gagal, field teks tidak tertulis (RFC §7).
- **Preview WYSIWYG**: `previewUri` dibangun dari **hasil resize yang sama** dengan
  yang akan disimpan — preview renderer (WO-3) = kartu cetak.
- **Tidak ada MIME sniffing** (OQ §16 #1 default v1: ekstensi whitelist + bukti
  decode sharp) — file dengan ekstensi valid tapi isi bukan gambar ditolak saat
  `sharp.metadata()` gagal → AppError 400 'File tidak dapat diproses sebagai gambar.'.
- **`logoPath` tersimpan = relatif `assets/school-logo/school-logo.<ext>`** (RFC §12
  relatif aman; `isRelativeAssetPath` WO-1 → true), dibaca via resolver WO-1.

## Catatan & Batasan
- Renderer **BELUM mengonsumsi** `settings.pickLogo` — preload + env.d.ts tersedia
  untuk WO-3 (UI SettingsPage + dialog picker + preview).
- `sharp` di-external → saat `package:win`, `node_modules/sharp` + `node_modules/@img`
  wajib di-package (asarUnpack sudah diatur); verifikasi artifact rilis menyusul
  (WO rilis/package).
- Dev DB `Setting.logoPath` saat ini `''`/absolut lama → preview tetap monogram
  (WO-1); WO-2 tidak melakukan backfill.
- Smoke: sharp menahan file handle sesaat → `fsp.rm(tmp)` bisa EBUSY; cleanup
  dibungkus try/catch (assertions tidak terpengaruh).
- Belum commit (menunggu instruksi PO). Working tree menyisakan modifikasi
  `borrow-card.service.ts` (`@media print`) yang bukan bagian WO-2.

## Status
**DONE — menunggu review Product Owner.** WO berikutnya (WO-3 UI SettingsPage:
pickLogo → preview → save/clear, konsumsi channel) tidak dibuka.
