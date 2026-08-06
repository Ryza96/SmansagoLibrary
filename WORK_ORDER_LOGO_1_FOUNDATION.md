# WORK ORDER — LOGO MANAGEMENT — WO-1 FOUNDATION

REVISION 1 (SMALL REVISION — dua revisi kecil hasil review PO)

Status: **DONE — READY review PO** (tidak lanjut WO berikutnya)

## Sumber Kebenaran
- `RFC_LOGO_MANAGEMENT_ARCHITECTURE.md` (LOCKED REVISION 1) — SSOT
- `LOGO_MANAGEMENT_DISCOVERY.md` (APPROVED)
- Keputusan PO dari revisi REVISION 1 (rincian di laporan audit RFC)
- Revisi WO-1 (SMALL REVISION): helper `isRelativeAssetPath()` + section
  Architecture Verification — tanpa perubahan scope/arsitektur/UI/IPC/upload/remove.

## Ringkasan
Fondasi Modul Logo Management: (1) konfigurasi + validasi file logo (`logo-config.ts`),
(2) **`resolveAssetPath()` — SATU-SATUNYA pembaca `logoPath`** (RFC §12) + pembersih
file lama `cleanupLegacyLogos()` (RFC §4/§10), (3) wiring `PrintService` (produksi)
agar logo di-resolve lewat resolver. **Belum ada** Save/Upload/Delete logo (WO-2),
UI, maupun migrasi aset — seluruhnya WO berikutnya.

## File
**Baru (2 source + 1 smoke):**
- `src/main/infrastructure/asset/logo-config.ts` — `LOGO_BASENAME='school-logo'`;
  whitelist `LOGO_IMAGE_MIME` persis 4 ekstensi (`.png/.jpg/.jpeg/.webp` — GIF/BMP/
  ICO/SVG DIHAPUS); `MAX_LOGO_SIZE_BYTES=512KB` (REVISION 1); `validateLogoFile()`
  non-throwing (urutan: format → EMPTY(>0 byte) → TOO_LARGE(≤512KB)).
- `src/main/infrastructure/asset/asset-resolver.ts` — `isOldAbsoluteLogoPath()`
  (diawali `/`, `\`, mengandung `:` drive, atau `file://`); `isRelativeAssetPath()`
  (**REVISION 1** — satu pintu penentu "nilai logoPath adalah path relatif yang aman
  digabung root": `null/'' → false`, absolut lama → false, traversal `..`/`..\`/`../`
  → false; semantik sejalan `resolveAssetPath`; dipakai Upload/Remove/Backup/Restore/
  Migration WO berikutnya agar logika penentuan relatif tidak diduplikasi);
  `resolveAssetPath(value, root, exists?)` (RFC §12: `''|null→null`; absolut lama →
  pakai apa adanya bila ada, bila tidak → null; relatif → gabung root + guard
  `resolveWithin`, traversal → null; **perilaku TIDAK diubah oleh REVISION 1**);
  `cleanupLegacyLogos(dir)` (hapus seluruh `school-logo.*` file di dalam folder,
  guard `resolveWithin`, skip folder, return jumlah terhapus).
- `wo1_logo_foundation_smoke/smoke.ts` — **57/57 PASS**.

**Dimodifikasi (2 source):**
- `electron/main/services/print.service.ts` — ctor + param ketiga opsional
  `assetRoot: string = ''`; `buildBorrowCardHtml()` me-resolve `settings.logoPath`
  via `resolveAssetPath(logoPath, assetRoot)` → null/absolut dipetakan ke `''`/path
  absolut sebelum `buildBorrowCardData` (logoPath `''` → fallback monogram). Resolver
  di-inject di titik `readFileAsDataUri`; `borrow-card.service.ts` TIDAK berubah.
- `electron/main/bootstrap.ts` — `new PrintService(borrowRepository, settingService,
  paths.root)` (paths = hasil `bootstrapDataInfrastructure()` — ADR-001 struktur userData).

## TIDAK Diubah
`borrow-card.service.ts` (assembler/template), DTO, `BorrowService`/`ReturnService`,
Repository, IPC/preload/env.d.ts, schema/migration (`prisma migrate diff` = "This is
an empty migration."), renderer/UI, `Setting.logoPath` (kolom tetap, makna baru mulai
WO-2), `print.service.ts` jalur PDF/print/label, dan **tidak ada backfill**.

## Validation PASS
1. `npm run lint` (tsc node+web) PASS.
2. `npm run build` PASS — main **2,047.16 kB** (resolver + config ter-wire),
   preload **10.99 kB identik baseline**, renderer **1,188.20 kB** (tidak disentuh;
   delta vs baseline WO-6 = hasil working tree prior).
3. Smoke `wo1_logo_foundation_smoke` **57/57 PASS** (murni, fresh fs temp):
   - Validasi: whitelist 4 ekstensi, tolak gif/bmp/ico/svg, case-insensitive,
     boundary ≤512KB (persis 512KB valid, +1 byte TOO_LARGE), EMPTY pada 0 byte.
   - `isRelativeAssetPath` (**REVISION 1**): `null/undefined/'' → false`;
     relatif `assets/...` & `school-logo/...` → true; absolut `C:\...`/`C:/...`
     → false; `file://...` → false; leading `/` & `\` → false; traversal `../`,
     `..\`, `..` → false.
   - Resolver: `''/null/undefined → null`; absolut lama yang ada → dipakai apa
     adanya; absolut tidak ada → null; `file://` → null; relatif baru yang ada →
     gabung root; relatif tidak ada → null; traversal `../` & `..\` → null.
   - `cleanupLegacyLogos`: hapus 3 file `school-logo.{png,jpg,webp}`, pertahankan
     `keep.txt` + folder `school-logo.old`, idempoten (run ulang → 0).
4. Regression **borrow_card_uat 31/31 PASS** (fresh DB temp, 4 migrations) — jalur
   `BorrowService.create → findById → PrintService.getBorrowCardPreviewHtml` utuh
   (preview, 1 buku→1 sheet, 20 buku→3 sheet, badge, QR, avatar, logo fallback
   monogram dengan `logoPath:''`, 404).
5. `prisma migrate diff --from-migrations` = "This is an empty migration." (schema
   tidak disentuh).
6. Wiring bundle: `out/main/index.js` memuat `school-logo` ×1 dan `resolveAssetPath`
   ×2 (marker ter-render). DB temp & fs temp dibersihkan.

## Architecture Verification (REVISION 1)

Audit grep `logoPath` pada production code (`electron/**` + `src/main/**`):

**Hanya SATU pembacaan langsung `logoPath` sebelum WO-1.** Satu-satunya pembacaan
nilai tersimpan `Setting.logoPath` (dari DB) berada di `electron/main/services/
print.service.ts` — `buildBorrowCardHtml()` meneruskan `settings.logoPath` **mentah**
ke `buildBorrowCardData()` yang membacanya di `src/main/services/borrow-card.service.ts:354`
(`settings.logoPath ? readFileAsDataUri(settings.logoPath) : null`). Tidak ada
pembaca lain pada production code.

**Seluruh pembacaan tersebut kini melalui `resolveAssetPath()`.** `print.service.ts:85`
me-resolve nilai tersimpan via `resolveAssetPath(settings.logoPath, this.assetRoot)`
→ hasil (`''` → fallback monogram, atau path absolut) diteruskan ke assembler.
Pembacaan di `borrow-card.service.ts:354` tetap ada namun hanya menerima **string
hasil resolve** (bukan nilai tersimpan mentah).

**Setelah WO-1, tidak ada lagi pembacaan langsung `logoPath` pada production code.**
Referensi `logoPath` lain yang tersisa adalah non-pembacaan:
- `electron/main/repositories/setting.repository.ts:13` — nilai **default write** `''`.
- `electron/main/services/setting.service.ts:18` — whitelist key passthrough
  (bukan baca nilai).
- `src/renderer/env.d.ts` — deklarasi tipe.
- `src/main/infrastructure/asset/asset-resolver.ts` — komentar + implementasi
  resolver itu sendiri.

**File yang berubah pada WO-1 (REVISION 1):**
- `src/main/infrastructure/asset/logo-config.ts` (baru)
- `src/main/infrastructure/asset/asset-resolver.ts` (baru; REVISION 1 menambah
  `isRelativeAssetPath()` — `resolveAssetPath` TIDAK berubah perilakunya)
- `electron/main/services/print.service.ts` (dimodifikasi — resolve logoPath)
- `electron/main/bootstrap.ts` (dimodifikasi — terusan `paths.root`)
- `wo1_logo_foundation_smoke/smoke.ts` (baru; REVISION 1 menambah section
  `isRelativeAssetPath`)
- `WORK_ORDER_LOGO_1_FOUNDATION.md` (dokumen ini, REVISION 1)

## Keputusan Teknis

- **Resolver di-inject di `PrintService`**, bukan di `borrow-card.service.ts` —
  mempertahankan assembler/template murni & tidak menyentuh DTO; parameter ctor
  ketiga **opsional** (`=''`) sehingga konstruktor 2-arg legacy (smoke lama) tetap
  valid & 3 call-site smoke lama tidak diubah.
- **Absolut lama + `''` dipetakan ke `''`** sebelum `buildBorrowCardData` — template
  memakai `logoPath` truthy untuk memilih logo vs monogram; `''` = fallback monogram
  (RFC §12 default saat tidak dapat di-resolve).
- **Path traversal di-resolve → null (fallback monogram)**, bukan throw — RFC §12
  mengharuskan null; guard `resolveWithin` (throwing) dibungkus try/catch.
- **`file://` diklasifikasikan absolut-lama → selalu null** — bukan path fs yang bisa
  dibaca (RFC §12 rule 2; `includes(':')` mencakup skema `file:`).

## Catatan & Batasan
- **REVISION 1** menambah `isRelativeAssetPath()` sebagai helper publik untuk WO
  berikutnya (Upload/Remove/Backup/Restore/Migration); `resolveAssetPath()` TIDAK
  diubah perilakunya. Karena helper belum dipakai production, bundle main **IDENTIK
  (2,047.16 kB)** — helper di-tree-shake (bukti tidak ter-wire).
- `cleanupLegacyLogos` **belum ter-wire** — dipanggil Save/Delete logo (WO-2).
- `validateLogoFile` dipakai UI Upload (WO-2); MIME sniffing (magic bytes) = Open
  Question §16 #1, default ekstensi-whitelist (v1).
- Dev DB: `Setting.logoPath` dev saat ini `''`/jalur absolut lama → preview tetap
  monogram (backward-compat absolut dipertahankan, tidak ada migrasi data).
- Belum ada perubahan UI/setting; belum commit (menunggu instruksi PO).

## Status
**DONE — menunggu review Product Owner (REVISION 1).** WO berikutnya (WO-2
Upload/Delete/Save, wiring `cleanupLegacyLogos`) tidak dibuka.
