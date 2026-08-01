# SPRINT9 — WO-5 Architecture Checklist
**Auto Create**

## Acceptance Criteria WO-5
| # | Kriteria | Status | Bukti |
|---|----------|--------|-------|
| 1 | FOUND → gunakan entity yang ada | ✅ | `auto-create.service.ts` `applyRow`: `resolvedEntity = candidates[0]` |
| 2 | NOT_FOUND → buat entity baru | ✅ | Hanya `authors`/`publisher`/`category` via `createEntity` → `Repository.create` |
| 3 | AMBIGUOUS → jangan buat, catat issue | ✅ | `resolvedEntity=null` + issue `autoCreate.ambiguous` di `matchedRow.issues` & `matchingResult.warnings` |
| 4 | SKIPPED → abaikan | ✅ | `resolvedEntity=null`, tanpa create, tanpa issue |
| 5 | Entity yang boleh dibuat hanya Author/Publisher/Category | ✅ | `CREATABLE_FIELDS = {authors, publisher, category}`; `isbn` NOT_FOUND → tidak create |
| 6 | Book/BooCopy/Barcode TIDAK dibuat | ✅ | Tidak ada pemanggilan `BookRepository.create`/`BookCopyRepository` di service; smoke verifikasi count book tetap 1 |
| 7 | Gunakan Repository yang ada (SSOT), tanpa query Prisma langsung | ✅ | Hanya `AuthorRepository`/`PublisherRepository`/`CategoryRepository` (`create`, `findExact`); `@prisma/client` tidak di-import service |
| 8 | Berjalan di Main Process; renderer hanya terima hasil akhir | ✅ | `autoCreateService.apply` dipanggil di handler `imports:match` (`book-import.ipc.ts`), sebelum hasil dikirim ke renderer |
| 9 | Hasil create ditambahkan ke struktur output (tanpa lookup ulang) | ✅ | `FieldMatch.resolvedEntity` berisi `{id,label}` untuk FOUND & created; konsumen WO-6 tinggal baca |
| 10 | Tidak mengubah Matching Engine/Strategy/Validation/WorkbookReader/algoritma | ✅ | File-file tersebut tak tersentuh (verifikasi `git status` + diff hanya file daftar di report) |

## Architecture Checklist (SPRINT8_EXECUTION_PROTOCOL §2)
| # | Pertanyaan | Wajib | Jawaban |
|---|------------|-------|---------|
| 1 | Repository tetap SSOT (single source of truth data)? | Ya | **Ya** — semua persistensi lewat repository; service tidak import `@prisma/client` |
| 2 | Provider bebas business logic (tidak ada keputusan pencarian/ranking di provider)? | Ya | **Ya** — Auto Create tidak menyentuh provider; keputusan create ada di service, pencarian tetap di strategy/provider/repository |
| 3 | Engine tetap tidak mengenal Repository maupun Prisma? | Ya | **Ya** — `MatchingEngineService` tidak diubah |
| 4 | Tidak ada `mode`? | Ya | **Ya** |
| 5 | Tidak ada `searchMode`? | Ya | **Ya** |
| 6 | Tidak ada `switch(mode)` / enum mode? | Ya | **Ya** — hanya `switch(field)` pada 3 field entity |
| 7 | Build PASS? | Ya | **Ya** — `npm run build` PASS |
| 8 | Lint PASS? | Ya | **Ya** — `npm run lint` PASS |
| 9 | Rollback tervalidasi (metode revert per WO sudah ditentukan & diuji)? | Ya | **Ya** — rollback = revert commit WO-5 (1 WO = 1 commit); service baru + 4 modif kecil, revert tidak menyentuh file WO lain |
| 10 | Semua dependency (WO prasyarat) terpenuhi? | Ya | **Ya** — WO-4.1 wiring sudah disetujui & live (`imports:match`) |

## Batasan — tidak tersentuh
MatchingEngineService, DummyMatchStrategies, semua Strategy, Provider, Repository, WorkbookReaderService,
ValidationEngineService, template import, preload, env.d.ts. (Verifikasi `git status` pasca-implementasi —
hanya file milik WO-5 + laporan.)

## Verifikasi
- `npm run lint` ✅ · `npm run build` ✅ · Smoke Auto Create 24/24 ✅ (DB temp, dibersihkan).
