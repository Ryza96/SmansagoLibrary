# WORK ORDER BOOK COVER — IMPLEMENTATION & REGRESSION REPORT (WO §11: Sampul Buku)

- **WO:** Sampul Buku — upload/pratinjau/hapus gambar sampul buku + integrasi Backup/Restore asset
- **Status:** **IMPLEMENTED — READY FOR PRODUCT OWNER TEST**
- **Source of Truth:** `ARCHITECTURE_DISCOVERY_REPORT.md` (WO §11) — silakan cek §11 untuk detail kontrak
- **Date:** 2026-08-10

---

## 1. Ringkasan
Fitur sampul buku diimplementasikan end-to-end: kolom `coverImagePath` pada `Book` (path relatif di dalam `assets/book-covers/`, bukan absolut), konfigurasi + resize gambar (sharp, downscale-only ≤512px), service `BookService.saveCover/removeCover/getCoverDataUri/pickCoverPreview`, tiga channel IPC (`books:pickCover`/`books:getCoverDataUri`/`books:removeCover`), provider asset + restore handler (`AssetBookCoverProvider`/`AssetBookCoverRestoreHandler`) sehingga sampul ikut dibackup/direstor via wadah `.apbackup`, UI pada `BookDetail`/`BookForm` (pilih, preview, hapus), serta migrasi `20260810_wo_book_cover`.

WO ini juga menutup siklus smoke: `wo_book_cover_smoke` (fungsional + backup/restore round-trip) **65/65 PASS** pada fresh DB, plus regression backup/restore/providers **346/346 PASS**.

## 2. Ruang Lingkup
- **Backend:** schema `Book.coverImagePath String?`, `book-cover-config.ts` (whitelist, `MAX_BOOK_COVER_SIZE_BYTES = 2*1024*1024`), `book-cover-resize.ts` (`resizeBookCoverImage(sourcePath, 512)`), `electron/main/services/book.service.ts` (saveCover/removeCover/getCoverDataUri/pickCoverPreview), `src/shared/dto/cover.ts`.
- **Backup/Restore:** `src/main/infrastructure/providers/asset.provider.ts` (collect asset `book-covers.zip` dari `assets/book-covers/`), `src/main/infrastructure/restore/asset-restore.handler.ts` (stage/verify/swap, safe-snapshot NOT capable — requirement optional), wiring di `electron/main/bootstrap.ts`.
- **IPC/Preload/UI:** `book.ipc.ts`, `book.preload.ts`, `env.d.ts`, `BookDetail.tsx`, `BookForm.tsx`, `labels.ts`.
- **Migrasi:** `prisma/migrations/20260810_wo_book_cover/migration.sql` (1 ALTER ADD COLUMN).

## 3. Keputusan Teknis (LOCKED)
| # | Keputusan | Keterangan |
|---|-----------|------------|
| K1 | Channel `books:pickCover` | title `'Pilih Sampul Buku'`, filter `'Gambar Sampul'` `['png','jpg','jpeg','webp']`; canceled → `{ canceled: true }` |
| K2 | Channel `books:getCoverDataUri(id)` & `books:removeCover(id)` | data URI / hapus file + null-kan kolom |
| K3 | Validasi urutan | UNSUPPORTED_FORMAT → EMPTY (`sizeBytes ≤ 0`) → TOO_LARGE (> 2 MB) |
| K4 | Resize downscale-only | ≤512×512 → byte asli; lebih besar → `fit:'inside'` + `withoutEnlargement:true`; output = format input |
| K5 | Path relatif | `coverImagePath` relatif di dalam `assets/book-covers/`; resolver memakai `resolveWithin` (anti-traversal) |
| K6 | Asset provider requirement `optional` | Database `required`; asset gagal → SUCCESS_WITH_WARNING (Failure Strategy K7) |
| K7 | Pesan error LOCKED | `'Format file tidak didukung...'`, `'File sampul kosong.'`, `'Ukuran file sampul melebihi 2 MB.'`, `'File tidak dapat diproses sebagai gambar.'` |

## 4. Bug Fix (saveCover SUCCESS — SATU-SATUNYA perubahan source pada siklus ini)
- `electron/main/services/book.service.ts` `saveCover`: blok SUCCESS kini memakai `previousCoverPath` yang di-capture SEBELUM try-block `updateBook`; `tryUnlink(oldBackup)`; bila `previousCoverPath && path.basename(previousCoverPath) !== targetName` → `tryUnlink(resolveWithin(dir, basename))`. Helper rusak `removePreviousCover` + komentar dihapus.
- Dampak: tidak ada lagi referensi undefined saat SUCCESS (sebelumnya dapat melempar bila file lama sudah dipindahkan ke `.old-`).

## 5. Smoke Maintenance (harness, bukan source app)
- `wo4_backup_smoke`, `wo5_restore_smoke`, `wo6_backup_restore_ui_smoke`: `EXPECTED_SCHEMA_VERSION` diperbarui `20260803_wo2_f2a_...` → `20260810_wo_book_cover` (migrasi terbaru kini 8). `wo5` trim-test kini memakai `EXPECTED_SCHEMA_VERSION` (bukan literal lama).
- `migration_bootstrap_smoke` (untracked harness): `EXPECTED_MIGRATIONS` + `EXPECTED_STATEMENT_COUNTS` + jumlah `7`→`8` (migrasi baru 1 statement).
- `wo_book_cover_smoke/smoke.ts`: staging dir dibuat (`fs.mkdirSync(stagingRoot)` — `DatabaseProvider.collect` VACUUM INTO membutuhkan staging dir ada), key wadah ZIP `assets/book-covers.zip` (bukan `book-covers.zip`), count wadah DB-only `=== 2` (`aplibrary.db` + `manifest.json`).

## 6. Validasi — Hasil
| Gate | Hasil |
|------|-------|
| `npm run lint` (tsc node+web) | PASS |
| `npm run build` | PASS (1964 modules, 8.99s; main/renderer bundle baru) |
| `prisma migrate diff --from-migrations --to-schema-datamodel` | "This is an empty migration." (no drift) |
| `wo_book_cover_smoke` (fresh DB) | **65/65 PASS, 0 FAIL** (EXIT=0) |
| Regression `wo3_provider_smoke` (fresh DB) | **111/111 PASS** |
| Regression `wo4_backup_smoke` (fresh DB) | **73/73 PASS** |
| Regression `wo5_restore_smoke` (fresh DB) | **103/103 PASS** |
| Regression `wo6_backup_restore_ui_smoke` (fresh DB) | **59/59 PASS** |
| Regression `migration_bootstrap_smoke` (harness) | **89/89 PASS** |

Regression backup/restore/providers total: **346/346 PASS**.

## 7. Regression — Cakupan
- Seluruh smoke yang menyentuh engine Backup/Restore/Provider (`wo3`, `wo4`, `wo5`, `wo6`) dijalankan ulang pada **fresh DB per suite** (pola: hapus file DB → `prisma migrate deploy` → run dengan `DATABASE_URL` absolute + `NODE_PATH`). Semua hijau setelah maintenance `EXPECTED_SCHEMA_VERSION` (perilaku benar: `SchemaVersionReader` membaca migrasi terakhir, kini 8 migrasi).
- Satu-satunya perubahan production source pada siklus ini adalah `book.service.ts` `saveCover` SUCCESS; hanya `wo_book_cover_smoke` yang menginstansiasi `BookService` (terverifikasi via grep), sehingga tidak ada smoke lain yang terpengaruh langsung.

## 8. Catatan
- `ARCHITECTURE_DISCOVERY_REPORT.md:150` masih menampilkan pola DI lama (`new BookService(bookRepository)` satu-repo) — dokumentasi basi; TIDAK diedit (di luar scope).
- `Book.deleteBook` tidak menghapus file cover yang ter-orphan bila buku dihapus dengan cover terpasang — diketahui & dicatat (opsional follow-up).
- Smoke `borrow_card_uat_smoke` tercatat di AGENTS.md sebagai stale (17/14 FAIL pre-existing) — di luar scope WO ini, tidak dijalankan ulang.

## 9. Deliverable
- Perubahan production source (tracked): `book.ipc.ts`, `bootstrap.ts`, `book.service.ts`, `book.preload.ts`, `schema.prisma`, `BookDetail.tsx`, `BookForm.tsx`, `env.d.ts`, `dto/book.ts`, `labels.ts`.
- File baru (untracked): `prisma/migrations/20260810_wo_book_cover/`, `src/main/infrastructure/asset/book-cover-config.ts`, `book-cover-resize.ts`, `src/main/infrastructure/providers/asset.provider.ts`, `src/main/infrastructure/restore/asset-restore.handler.ts`, `src/shared/dto/cover.ts`, `wo_book_cover_smoke/`.
- Smoke maintenance (tracked): `wo4_backup_smoke/smoke.ts`, `wo5_restore_smoke/smoke.ts`, `wo6_backup_restore_ui_smoke/smoke.ts`.

## 10. VERDICT
**READY FOR PRODUCT OWNER TEST** — seluruh validasi lulus; belum di-commit (menunggu instruksi).
