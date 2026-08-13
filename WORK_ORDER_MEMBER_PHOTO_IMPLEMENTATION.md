# WORK ORDER MEMBER PHOTO — IMPLEMENTATION & REGRESSION REPORT

- **WO:** Foto Anggota (SISWA/GURU/UMUM) — upload/pratinjau/hapus foto anggota + integrasi Backup/Restore asset (arsitektur kloning dari Book Cover yang sudah LOCKED)
- **Status:** **IMPLEMENTED — READY FOR PRODUCT OWNER TEST**
- **Date:** 2026-08-11

---

## 1. Ringkasan
Satu mekanisme foto bersama untuk ketiga tipe anggota (SISWA/GURU/UMUM) diimplementasikan end-to-end mengikuti arsitektur Book Cover yang sudah LOCKED: kolom `Member.photoPath` (path relatif di dalam `assets/member-photos/`, bukan absolut), konfigurasi + resize gambar (sharp, downscale-only ≤512px, `sharp.cache(false)` sisi smoke), metode service `MemberService.savePhoto/removePhoto/getPhotoDataUri/pickPhotoPreview`, tiga channel IPC (`members:pickPhoto`/`members:getPhotoDataUri`/`members:removePhoto`) + preload + `env.d.ts`, provider asset + restore handler (`MemberPhotosProvider`/`MemberPhotosRestoreHandler`) sehingga foto ikut dibackup/direstor via wadah `.apbackup`, UI pada `MemberForm`/`MemberListPage`/`MemberDetailPage`, serta migrasi `20260811_wo_member_photo`.

WO ini juga menutup siklus smoke: `wo_member_photo_smoke` (fungsional + backup/restore round-trip) **76/76 PASS** pada fresh DB, plus regression member/enrollment/backup/restore/provider **453/453 PASS**.

## 2. Ruang Lingkup
- **Backend:** schema `Member.photoPath String?`; `member-photo-config.ts` (whitelist, `MAX_MEMBER_PHOTO_SIZE_BYTES`), `member-photo-resize.ts` (`resizeMemberPhotoImage(sourcePath, 512)`); `MemberService` ctor kini 5-arg, `create` = transaksi (member + enrollment ACTIVE) lalu `savePhoto` DI LUAR transaksi; `removePhoto`/`getPhotoDataUri`/`pickPhotoPreview`; `src/shared/dto/member-photo.ts`.
- **Backup/Restore:** `src/main/infrastructure/providers/member-photos.provider.ts` (collect asset `member-photos.zip` dari `assets/member-photos/`), `src/main/infrastructure/restore/member-photos-restore.handler.ts` (stage/verify/swap — `swapToLive` MENGGANTI isi liveDir: setelah restore arsip kosong, liveDir KOSONG), `src/main/infrastructure/restore/asset-restore.handler.ts` `matches()` kini routing path PERSIS arsip sendiri (ada >1 aset ASSET), wiring di `electron/main/bootstrap.ts`.
- **IPC/Preload/UI:** `member.ipc.ts` (+3 channel), `member.preload.ts`, `env.d.ts`, `MemberForm.tsx`, `MemberListPage.tsx`, `MemberDetailPage.tsx`, `labels.ts` (`LABELS.MEMBER_COVER.*`).
- **Migrasi:** `prisma/migrations/20260811_wo_member_photo/migration.sql` (1 ALTER ADD COLUMN, data-preserving).

## 3. Keputusan Teknis (LOCKED)
| # | Keputusan | Keterangan |
|---|-----------|------------|
| K1 | Channel `members:pickPhoto` | title `'Pilih Foto Anggota'`, filter `'Gambar Foto'` `['png','jpg','jpeg','webp']`; canceled → `{ canceled: true }` |
| K2 | Channel `members:getPhotoDataUri(id)` & `members:removePhoto(id)` | data URI / hapus file + null-kan kolom |
| K3 | Validasi urutan | UNSUPPORTED_FORMAT → EMPTY (`sizeBytes ≤ 0`) → TOO_LARGE |
| K4 | Resize downscale-only | ≤512×512 → byte asli; lebih besar → `fit:'inside'` + `withoutEnlargement:true`; output = format input |
| K5 | Path relatif | `photoPath` relatif di dalam `assets/member-photos/`; resolver memakai `resolveWithin` (anti-traversal) |
| K6 | Satu mekanisme | SISWA/GURU/UMUM memakai satu alur `savePhoto`; MemberService `create` = tx member+enrollment, `savePhoto` di luar tx (update kedua pada path relatif) |
| K7 | Restore empty-archive | `swapToLive` MENGGANTI liveDir (kosong tetap kosong) — restore DB-only tidak menyentuh liveDir |
| K8 | `sharp.cache(false)` | HANYA di smoke `main()` (Windows EBUSY ~20 FD sharp); produksi tidak diubah |

## 4. Smoke Maintenance (harness, bukan source app)
- `EXPECTED_SCHEMA_VERSION` diperbarui ke `20260811_wo_member_photo` pada `wo4_backup_smoke`, `wo5_restore_smoke`, `wo6_backup_restore_ui_smoke`, `wo_book_cover_smoke` (migrasi terbaru kini 9; `SchemaVersionReader` membaca migrasi terakhir).
- `member_class_display_smoke`, `member_manual_entry_smoke`, `wo14_e2_smoke`, `wo15_e3_smoke`: ctor `MemberService` 5-arg + tsconfig per-folder (module commonjs, baseUrl `..`, paths `@prisma/client` → `src/generated/prisma/index.d.ts`) karena `member.service.ts` mereferensikan `photoPath` yang TIDAK ada di client node_modules (STALE).
- `wo_member_photo_smoke/smoke.ts`: assertion isi ZIP wadah kini **order-independent** (order nama bergantung UUID random), empty-restore mengharapkan **0 file**, dan header komentar mengikuti semantik tersebut.
- Bug smoke yang ditemukan (BUKAN bug source): 1 run flaky gagal karena `innerNames` sorted dipengaruhi UUID (`member-photo-2cd342f4-…webp` < `member-photo-442ec49e-…png`) — isi ZIP benar.

## 5. Validasi — Hasil
| Gate | Hasil |
|------|-------|
| `npm run lint` (tsc node+web) | PASS |
| `npm run build` | PASS (main 2,436.45 kB · preload 13.24 kB · renderer 1,290.87 kB) |
| `prisma migrate diff --from-migrations --to-schema-datamodel` | "This is an empty migration." (no drift) |
| `wo_member_photo_smoke` (fresh DB) | **76/76 PASS, 0 FAIL** |
| Regression `member_class_display_smoke` (fresh DB) | **18/18 PASS** |
| Regression `member_manual_entry_smoke` (fresh DB) | **24/24 PASS** |
| Regression `wo14_e2_smoke` (fresh DB) | **40/40 PASS** |
| Regression `wo15_e3_smoke` (fresh DB) | **71/71 PASS** |
| Regression `wo4_backup_smoke` (fresh DB) | **73/73 PASS** |
| Regression `wo5_restore_smoke` (fresh DB) | **103/103 PASS** |
| Regression `wo6_backup_restore_ui_smoke` (fresh DB) | **59/59 PASS** |
| Regression `wo_book_cover_smoke` (fresh DB) | **65/65 PASS** |

Regression total: **453/453 PASS**.

## 6. Catatan
- `app_info_smoke` (untracked) sudah stale SEBELUM WO ini (`20260809_wo_print_printer_setting`) — di luar scope, TIDAK diperbaiki.
- Seluruh smoke regresi dijalankan pada **fresh DB per suite** (pola: hapus file DB → `prisma migrate deploy` → run dengan `DATABASE_URL` absolute + `NODE_PATH`).
- Tidak ada perubahan schema lain selain `Member.photoPath`; `prisma migrate diff` = empty.

## 7. Deliverable
- Perubahan production source (tracked): `electron/ipc/member.ipc.ts`, `electron/main/bootstrap.ts`, `electron/main/services/member.service.ts`, `electron/preload/member.preload.ts`, `prisma/schema.prisma`, `src/components/members/MemberForm.tsx`, `src/main/infrastructure/restore/asset-restore.handler.ts`, `src/main/repositories/member.repository.ts`, `src/main/services/member.service.ts`, `src/pages/MemberDetailPage.tsx`, `src/pages/MemberListPage.tsx`, `src/renderer/env.d.ts`, `src/shared/dto/member.ts`, `src/utils/labels.ts`.
- File baru (untracked): `prisma/migrations/20260811_wo_member_photo/`, `src/main/infrastructure/asset/member-photo-config.ts`, `src/main/infrastructure/asset/member-photo-resize.ts`, `src/main/infrastructure/providers/member-photos.provider.ts`, `src/main/infrastructure/restore/member-photos-restore.handler.ts`, `src/shared/dto/member-photo.ts`, `wo_member_photo_smoke/` (smoke.ts, tsconfig.json, prisma-alias.cjs).
- Smoke maintenance (tracked): `member_class_display_smoke/smoke.ts`, `member_manual_entry_smoke/smoke.ts`, `wo14_e2_smoke/smoke.ts`, `wo15_e3_smoke/smoke.ts`, `wo4_backup_smoke/smoke.ts`, `wo5_restore_smoke/smoke.ts`, `wo6_backup_restore_ui_smoke/smoke.ts`, `wo_book_cover_smoke/smoke.ts`.
- Smoke maintenance (untracked): tsconfig.json di 4 folder smoke di atas.

## 8. VERDICT
**READY FOR PRODUCT OWNER TEST** — seluruh validasi lulus (smoke 76/76 + regression 453/453); belum di-commit (menunggu instruksi).
