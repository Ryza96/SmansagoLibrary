# WORK ORDER LOGO-2 AUDIT — Save/Clear Logo Production Readiness

**Mode:** AUDIT (READ ONLY) — no source code, schema, migration, dependency, or artifact changes.
**Source of Truth:** RFC Logo (WO-1 approved) §7/§8/§9/§10/§15.1, `RFC_001_LOGO_*` design docs, laporan WO-1.
**Target file:** `electron/main/services/setting.service.ts` (`saveLogo` 61–89, `clearLogo` 92–97, `pickLogoPreview` 45–57).
**Date:** 2026-08-06. **Status:** DONE — READY review PO (audit report only; **TIDAK ada commit**).

---

## Ringkasan

6 titik audit diperiksa. **5 hijau, 1 temuan utama (invariant deviasi)** + 2 temuan sekunder + 2 catatan info.

| # | Audit | Hasil |
|---|-------|-------|
| 1 | Race condition / unawaited promise | **Hijau** — `moveFilePreserving` sinkron; `await` no-op, tidak ada race dari situ. Catatan: tanpa mutex untuk saveLogo/clearLogo konkuren (INFO). |
| 2 | Urutan atomik save + invariant "file lama aman" | **TEMUAN** — `cleanupLegacyLogos` (baris 69) menghapus file lama SEBELUM tulis; rollback (76–88) hanya menghapus file BARU → kegagalan setelah baris 69 membuat disk kosong + `logoPath` DB menggantung (dangling). |
| 3 | Rollback semua titik kegagalan (validasi/decode/resize/write/rename/DB) | **Hijau untuk** validasi/decode/resize (tidak ada tulisan), **TEMUAN untuk** write (baris 72 di luar try → error mentah, tanpa rollback) dan rename/DB (file lama sudah hilang). |
| 4 | `npm run package:win` (sharp native, NSIS installer) | **Hijau** — sharp unpacked, `.node` terekstrak, resize berfungsi, installer NSIS 95.9 MB dibuat. |
| 5 | lint + build + smoke WO-2 + regression | **Hijau** — lint PASS, build PASS (main 2,048.10 kB), smoke WO-2 41/41, WO-1 57/57, UAT 31/31. |
| 6 | Code review (duplikasi, dead code, unreachable, leaks, unused import) | **Hijau** — tidak ada duplikasi/dead code/unreachable/unused import; buffer sharp dibebaskan; tidak ada resource leak. |

**Kesimpulan audit:** alur save logo berfungsi benar pada happy path (terbukti smoke WO-2/UAT). Namun **invariant yang dinyatakan PO pada brief audit — "DB update gagal → file baru dibersihkan + file lama aman" — TIDAK terpenuhi.** Root cause: urutan RFC §10 (cleanup-lama-dahulu) bertentangan dengan invariant RFC §10 yang sama ("kondisi tetap seperti sebelum replace"). Implementasi setia mengikuti alur RFC, sehingga invariant literal tidak bisa dipenuhi. Disarankan keputusan PO antara: (A) terima perilaku ini (gagal tengah = logo lama hilang, DB menggantung, recover via re-upload) atau (B) koreksi urutan (tulis baru → DB sukses → hapus lama; gagal → restore lama).

---

## 1. Audit #1 — Race Condition & Unawaited Promise (HIJAU)

`moveFilePreserving` (electron/main/infrastructure/fs-utils.ts) adalah **sinkron** (`renameSync` + fallback `copyFileSync`). Pemanggil `moveFilePreserving(temp, target)` tanpa `await` (baris 74) tidak menciptakan unhandled-rejection atau out-of-order: operasi selesai sepenuhnya sebelum statement berikutnya (`await this.settingRepository.update(...)`).

Seluruh operasi I/O lain (`fsp.stat`, `fsp.writeFile`, `fsp.mkdir`, `fsp.unlink`, `resizeWithError`) sudah `await`. Tidak ada promise tanpa await selain `moveFilePreserving` (no-op).

**Catatan (INFO):** `saveLogo`/`clearLogo` tidak punya mutex. Dua `settings:update` konkuren dapat berinterleaving di main process: A.cleanup → A.write → A.rename → B.cleanup (hapus file A) → B.write → B.rename → B.update DB=B → A.update DB=A → **disk=B, DB=A** (inkonsisten). Praktis kecil (UI single-user, tombol save tunggal), namun tidak ada guard. Ditandai, tidak diperbaiki (audit only).

## 2. Audit #2 — Urutan Atomik & Invariant "File Lama Aman" (TEMUAN UTAMA)

Urutan `saveLogo` (baris 61–89):

```
62-64  validasi ekstensi + ukuran            (tidak ada tulisan)
65     resize → buffer (sharp)               (tidak ada tulisan)
67-68  mkdir dir recursive
69     cleanupLegacyLogos(dir)               ← hapus SEMUA school-logo.* (file lama!)
70-71  target = resolveWithin(dir, school-logo.<ext>); temp = target + ".tmp"
72     writeFile(temp, buffer)               ← DI LUAR try
73-88  try { move(temp→target); update DB logoPath } catch { unlink temp; unlink target; throw }
```

**Invariant PO (brief audit):** DB update gagal → file baru dibersihkan + **file lama aman** + tidak ada dua logo + tidak ada orphan.

**Fakta:** pada kegagalan DB update (baris 75 throw), catch (76–88) menghapus `temp` + `target` (file baru). File **lama** sudah dihapus `cleanupLegacyLogos` di baris 69 — TIDAK pernah di-restore. Kondisi akhir: **disk kosong (0 file logo), `Setting.logoPath` masih menunjuk path file yang sudah tidak ada** (dangling). `"file lama aman"` TIDAK terpenuhi.

**Kontradiksi RFC:** RFC §10 step 4 (baris 284) memerintahkan cleanup-lama SEBELUM copy; RFC §10 line 290 (invariant) menyatakan "Gagal di tengah (copy sukses, DB gagal) → file baru dihapus → kondisi tetap seperti sebelum replace". Dua klausa RFC ini bertentangan: Anda tidak bisa menghapus file lama dulu DAN tetap memiliki file lama bila langkah berikutnya gagal. Implementasi setia pada alur (bukan invariant) → yang dinyatakan PO sebagai penerimaan justru yang dilanggar.

**Severity: LOW–MEDIUM.** Jalur gagal jarang (UPDATE satu baris di SQLite lokal; hanya disk-full/DB korup). Dampak: logo menghilang dari tampilan (resolver fallback ke monogram — tidak crash), DB menyimpan path menggantung. Recovery: re-upload. Tidak ada korupsi data.

**Rekomendasi (jika PO memilih koreksi):** (a) tulis `target` baru → `update DB` sukses → baru `cleanupLegacyLogos`; gagal → hapus target baru (file lama masih utuh), ATAU (b) rename file lama → `*.bak` sebelum cleanup, restore `.bak` pada gagal. Perubahan ini = WO implementasi terpisah (bukan bagian audit).

## 3. Audit #3 — Rollback Semua Titik Kegagalan (TEMUAN)

Simulasi fault-injection nyata `wo2_logo_audit_sim/` (fresh DB, `saveLogo`/`clearLogo` produksi via tsc) — **12/12 assertion, 6 meaningful**:

| Skenario | Hasil | Kondisi akhir disk / DB |
|----------|-------|------------------------|
| A: DB update gagal (replace .png→.webp) | **file lama TIDAK aman** | disk `[]` (kosong), DB tetap `.png` → **dangling** |
| B: writeFile gagal (temp dir jadi file-path EISDIR) | **error mentah (tanpa AppError), file lama hilang** | disk `[.webp.tmp dir-fixture]`, `.png` hilang, DB tetap `.png` → **dangling** |
| C: rename gagal (target dir conflict) | rollback jalan (temp dihapus) | file baru tidak ada, `.png` sudah hilang → **dangling** |
| D: clearLogo + DB gagal | **file sudah terhapus, DB tetap** | file logo hilang, DB tetap path → **dangling** |
| validasi ekstensi gagal | PASS | tidak ada tulisan apa pun |
| decode/resize gagal | PASS | tidak ada tulisan apa pun |

Temuan sekunder:
1. **`fsp.writeFile(temp)` baris 72 DI LUAR try/catch** — bila tulis gagal: exception mentah (bukan AppError 500 `LogoSaveError`), dan catch (76–88) tidak pernah berjalan → tidak ada pembersihan `temp`, file lama sudah hilang. Temuan ini independen dari #2.
2. **`clearLogo` (92–97) tanpa try/catch** — file dihapus lalu `update({logoPath:''})`; bila DB gagal, file hilang + DB menggantung + error mentah. (Untuk clear, menghapus file memang maksud, tapi DB harus atomic dengan penghapusan.)

Tidak ada orphan `.tmp` pada kegagalan rename/DB (temp berhasil di-unlink). Tidak pernah ada "dua logo" (cleanup menyapu semua varian sebelum tulis).

## 4. Audit #4 — package:win (HIJAU)

- sharp native (`node_modules/sharp/build/Release/sharp-*.node`) TIDAK di-asaring — `out/` memakai jalur eksternal; asarUnpack regex memastikan `.node` + folder sharp terekstrak.
- Verifikasi: `resources/app.asar.unpacked/node_modules/sharp/build/Release/sharp-*.node` ter-extract; main bundle me-`require("sharp")`; smoke **resize nyata Electron → PASS** (PNG 1600×1600 → 512×512 buffer, mime correct).
- Installer NSIS `dist/APLibrary Setup 1.0.0.exe` **95.9 MB** dibuat, EXIT 0 (pakai `win.signAndEditExecutable: false` — pola R-4).
- Catatan: check path `sharp/lib/index.js` saya adalah false-positive (entry sharp = `dist/index.js`); verifikasi sebenarnya = native `.node` + require + resize PASS.

## 5. Audit #5 — lint/build/smoke/regression (HIJAU)

- `npm run lint` PASS.
- `npm run build` PASS — main **2,048.10 kB** (+1.77 dari 2,046.33 baseline R-6/LOGO-1, identik dengan baseline LOGO-2) · preload **10.99 kB** · renderer **1,181.23 kB** — semua identik baseline, TIDAK ada perubahan source.
- Smoke **WO-2 41/41** PASS (fresh DB) — create/save/validate/resize/save-db/clear-db round-trip.
- Regression **WO-1 57/57** + **Borrow Card UAT 31/31** (fresh DB) PASS.
- `prisma migrate diff` = "This is an empty migration." (schema tidak disentuh).
- `prisma migrate status` up to date (4 migrations).

## 6. Audit #6 — Code Review (HIJAU)

- **Duplikasi:** `cleanupLegacyLogos`/`LOGO_BASENAME`/`LOGO_IMAGE_MIME`/`resolveWithin` didefinisikan satu kali; `clearLogo`/`saveLogo` berbagi helper, tidak menduplikasi logika.
- **Dead code / unreachable:** tidak ada branch yang tidak dapat dicapai; catch nested best-effort benar.
- **Resource leak:** `resizeWithError` mengembalikan `Buffer` (sharp sinkron, auto-release); tidak ada handle/stream yang bocor; `fsp` tidak memegang descriptor.
- **Unused imports:** tidak ditemukan (tsc strict pass).
- **Catatan (INFO):** `update()` (99–114) melakukan 2 tulis DB terpisah (fase logo via `saveLogo`/`clearLogo` baris 103–104, lalu whitelist field baris ~106) tanpa transaksi — bukan defect untuk single-row SQLite, namun atomicity lintas fase tidak ada.

---

## Artifak Audit

- `wo2_logo_audit_sim/` — smoke fault-injection (`smoke.ts` + `sim.cjs`, tsc ke `out/`). **Untracked, tidak di-commit** (dapat dihapus bila tidak diperlukan).
- Laporan ini. **TIDAK ada commit; working tree hanya berisi file untracked dari WO lain.**

## Status

**DONE — READY review PO.** Menunggu keputusan PO atas Temuan #2/#3 (terima perilaku atau koreksi urutan save). Tidak membuka WO berikutnya.
