# WO-2 REVISION 1 (ATOMIC SAVE FIX) — Design Revision & Invariant

Sumber: `RFC_LOGO_MANAGEMENT_ARCHITECTURE.md` (LOCKED REVISION 1) §7/§9/§10, audit
`WORK_ORDER_LOGO_2_AUDIT.md` (temuan: `setting.service.ts:69` menghapus logo lama
SEBELUM tulis, `writeFile` di luar try, `clearLogo` tanpa catch).
Status: **DONE — menunggu review PO** (tanpa commit/push).

---

## 1. Algoritma yang disetujui user (eskalasi audit)

Usulan awal: `validate → resize → tulis temp → HAPUS logo lama → rename temp ke
target → update DB → sukses: hapus logo lama lain; gagal: hapus file baru +
pulihkan logo lama`.

**Kelemahan usulan awal** (diidentifikasi, dirancang ulang): mengganti
`school-logo.<ext>` dengan **ekstensi yang sama** membuat `rename` menimpa logo
lama **di tempat**. Setelah itu rollback tidak mungkin lagi — tidak ada cara tahu
apakah `target` berisi file lama atau file baru, dan tidak ada salinan lama untuk
dipulihkan. Menghapus logo lama di depan juga membuka jendela "tanpa logo" bila
operasi gagal setelah penghapusan.

## 2. Desain final (diimplementasikan)

Prasyarat desain: **logo lama TIDAK pernah dihapus sebelum DB commit**; setiap
kegagalan harus meninggalkan disk & DB persis seperti sebelum save.

```
saveLogo(sourcePath):
  ext = extname(sourcePath).lower
  assertValidLogo(ext, size)                 // §8 — fail: tidak menyentuh apa pun
  buffer = resizeWithError(sourcePath)       // §9 — fail: tidak menyentuh apa pun
  dir  = assetSchoolLogoDir; mkdir recursive
  targetName = school-logo<ext>
  target     = resolveWithin(dir, targetName)
  temp       = resolveWithin(dir, .<targetName>.tmp-<uuid>)
  oldBackup  = resolveWithin(dir, .<targetName>.old-<uuid>)
  hadTarget  = exists(target)

  try:
    writeFile(temp, buffer)                  // nama unik → tidak bisa menimpa apa pun
    if hadTarget: rename(target, oldBackup)  // sisihkan logo lama SEBELUM rename final
    moveFilePreserving(temp, target)         // rename → fallback copy+unlink
    settingRepository.update({ logoPath: assets/school-logo/<targetName> })
  catch:
    ROLLBACK:
      hadTarget && exists(oldBackup) → unlink(target)   // hapus file baru
                                       rename(oldBackup, target)  // pulihkan lama
      !hadTarget                       → unlink(target)   // file baru saja
      unlink(temp)                                        // best-effort
      throw AppError(500, 'LogoSaveError', 'Gagal menyimpan logo sekolah.')

  SUCCESS (DB sudah commit, logo baru di target):
    unlink(oldBackup)                    // best-effort
    cleanupLegacyLogos(dir, targetName)  // hapus sisa school-logo.* ext beda,
                                         // KECUALI target baru → tepat satu logo
```

Keputusan desain kunci:

1. **Backup hanya untuk kasus ext sama.** `rename(target, oldBackup)` dilakukan
   hanya bila `hadTarget`. Untuk ext berbeda target tidak ada → tidak perlu backup.
2. **`oldBackup` adalah satu-satunya salinan logo lama saat ext sama.** Rollback
   memulihkan darinya; bila pemulihan gagal, backup dipertahankan (bukan dihapus)
   agar logo lama tidak hilang total.
3. **Urutan guard rollback membaca `exists(oldBackup)`**, bukan asumsi — bila
   `rename(target, oldBackup)` sendiri gagal (target masih lama), rollback TIDAK
   menyentuh target (menghindari menghapus logo lama yang masih baik).
4. **Sukses: `cleanupLegacyLogos(dir, keepName)`.** Diperluas dengan parameter
   opsional `keepName` agar file target baru tidak ikut tersapu saat membersihkan
   logo legacy ext berbeda. Tanpa keepName, perilaku identik dengan lama (clearLogo).
5. **Seluruh fase tulis berada di dalam `try`** (writeFile, backup, move, DB).
   Tidak ada fase tulis disk di luar try.
6. **DB update = titik commit.** Setelah update sukses, logo baru dianggap final;
   pembersihan (backup + legacy) best-effort — kegagalan pembersihan tidak
   menggagalkan save (logo baru sudah valid & DB konsisten).

## 3. Invariant RFC §10 (setelah fix)

Pasca operasi `saveLogo()` yang berhasil ATAU gagal:

| Invariant | Mekanisme |
|-----------|-----------|
| I1. Tepat satu `school-logo.*` di folder | Sukses: `cleanupLegacyLogos(dir, targetName)` menghapus semua ext lain. Gagal: rollback mengembalikan kondisi awal (0 bila tidak ada, 1 bila ada). |
| I2. DB `logoPath` konsisten dengan file | Sukses: DB = target baru (file ada). Gagal sebelum update: DB tidak berubah dan file lama tetap ada. |
| I3. Logo lama tidak pernah hilang sebelum DB commit | Backup (`oldBackup`) dibuat sebelum `moveFilePreserving`; logo lama baru dihapus pada fase sukses. |
| I4. Tidak ada file transisi tersisa (`.tmp-*` / `.old-*`) | Rollback & sukses menghapus `temp` dan `oldBackup` (best-effort). |
| I5. Tidak ada dangling referensi | Logo yang dirujuk DB selalu ada; file yang tidak dirujuk tidak pernah ada. |

## 4. File yang diubah

- `src/main/infrastructure/asset/asset-resolver.ts` — `cleanupLegacyLogos(dir, keepName?)`: param opsional `keepName` (file yang TIDAK dihapus). Backward-compatible (WO-1 smoke 57/57 tetap hijau).
- `electron/main/services/setting.service.ts` — `saveLogo()` ditulis ulang (backup-rename-rollback); helper privat baru `pathExists()` / `tryUnlink()`. `clearLogo()`/`update()`/`pickLogoPreview()` tidak berubah.
- `wo2_logo_backend_smoke/smoke.ts` — STEP 6 di-update: invariant lama `folder bersih (0)` (mengikuti algoritma usulan yang ternyata cacat) → invariant benar `file lama aman (1) + DB tetap .png`.
- `wo2_r1_atomic_save_smoke/smoke.ts` — **baru**, fault-injection A–E + success path.

**TIDAK diubah:** DTO, IPC, preload, env.d.ts, schema/migration, renderer/UI,
`clearLogo`, `pickLogoPreview`, `resizeLogoImage`, `logo-config.ts`, Borrow Card.

## 5. Validation (fault-injection nyata, fresh DB)

`wo2_r1_atomic_save_smoke/smoke.ts` — **56/56 PASS** (fresh DB temp, 4 migrations).

| Kasus | Stimulus | Hasil |
|-------|----------|-------|
| A1 | DB update gagal, ext BEDA (.png→.webp) | logo lama tetap, tanpa .webp, DB tetap .png |
| A2 | DB update gagal, ext SAMA (.png→.png) | logo lama **dipulihkan dari backup** (byte-identik), DB tetap .png |
| A3 | DB update gagal, TANPA logo lama | folder tetap kosong, DB tetap kosong |
| B1 | rename/move final gagal, ext BEDA | logo lama tetap, tanpa file baru, DB tetap |
| B2 | rename/move final gagal, ext SAMA | logo lama dipulihkan, DB tetap |
| C | write temp gagal (writeFile di-dalam-try) | logo lama tetap, DB tetap |
| D | decode gagal (isi bukan gambar) | tidak ada perubahan apa pun |
| E | resize gagal (di-inject) | tidak ada perubahan apa pun |
| S1–S4 | success: diff-ext / same-ext (resize baru 512×256) / tanpa-logo / legacy ganda | tepat satu logo, DB konsisten, legacy & backup dibersihkan |
| regresi | `clearLogo()` | DB kosong, folder kosong, invariant I1–I5 |

Invariant I1–I5 dicek pada **setiap langkah** (`assertInvariant`): tepat satu
logo, DB↔disk konsisten, tanpa file `.tmp-*`/`.old-*`.

## 6. Regression

- `npm run lint` — PASS (tsc node + web)
- `npm run build` — PASS (main **2,053.63 kB** · preload 11.06 kB · renderer 1,188.20 kB `C23_OADP.js` — **renderer byte-identik baseline**, tanpa perubahan renderer)
- `wo2_logo_backend_smoke` — **42/42 PASS** (fresh DB; STEP 6 invariant baru)
- `wo1_logo_foundation_smoke` — **57/57 PASS** (pure; backward-compat `keepName` opsional)
- `borrow_card_uat_smoke` — **31/31 PASS** (fresh DB; jalur Borrow Card tidak terpengaruh)
- `prisma migrate diff --from-migrations` — "This is an empty migration." (schema tidak disentuh)

**Total: 56 + 42 + 57 + 31 = 186 PASS, 0 FAIL.**

## 7. Pelajaran (retain)

- **Rollback "ganti logo ext sama" mustahil bila logo lama dihapus/ditimpa di depan.** `rename(temp, target)` menimpa target di tempat; satu-satunya cara memulihkan adalah menyimpan salinan lama (backup) SEBELUM move final. Ini kelemahan fundamental algoritma "hapus lama → tulis baru" yang tidak terlihat pada WO-2 asli (di sana rollback hanya menghapus file baru, menganggap kondisi awal "tanpa logo").
- **Guard rollback wajib membaca state (`exists(oldBackup)`)**, bukan asumsi fase mana yang gagal — bila sisih-backup sendiri gagal, `target` masih logo lama dan rollback tidak boleh menyentuhnya.
- **Fase tulis disk semuanya di dalam `try`**; `writeFile` temp sebelumnya di luar try sehingga kegagalan menulis temp tidak pernah di-rollback (temuan audit).
- **`cleanupLegacyLogos(dir, keepName)`** — parameter opsional menjaga backward-compat; tanpa argumen perilaku identik (clearLogo). Setelah commit DB, sisa legacy dihapus KECUALI target baru → tepat satu logo (I1).
- **Best-effort hanya pada fase pasca-commit** (hapus backup/legacy). Gagal sebelum commit = AppError 500 dengan disk/DB utuh. Gagal setelah commit = logo baru tetap valid (sisa legacy hanya artefak, dihapus pada save berikutnya).
- Smoke fault-injection: patch `fs.renameSync`/`fs.copyFileSync` (sinkron, dipakai `moveFilePreserving`) untuk kasus move; patch `fs.promises.writeFile` untuk kasus write temp; override repository `update` untuk kasus DB; patch prototype `resizeWithError` untuk kasus resize. Restore di `finally` tiap kali.
