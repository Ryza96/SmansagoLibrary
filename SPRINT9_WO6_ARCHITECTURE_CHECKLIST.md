# SPRINT9 — WO-6 Architecture Checklist
**Book Import**

## Acceptance Criteria WO-6
| # | Kriteria | Status | Bukti |
|---|----------|--------|-------|
| 1 | Untuk setiap baris: isbn, judul, authorId, publisherId, categoryId → entity Book | ✅ | `book-import.service.ts` `importRow`: `bookRepository.create({ title, isbn, authorId, publisherId, categoryId })` |
| 2 | Book dibuat hanya jika ISBN belum ada | ✅ | Guard `bookRepository.existsByISBN(isbn)` → issue `bookImport.isbnDuplicate`, skip |
| 3 | Book dibuat hanya jika tidak ada field AMBIGUOUS | ✅ | Guard `row.matches.some(status === 'AMBIGUOUS')` → issue `bookImport.ambiguous`, skip |
| 4 | Book dibuat hanya jika seluruh entity tersedia via `resolvedEntity` | ✅ | `resolvedId(row,'authors'|'publisher'|'category')`; salah satu null → issue `bookImport.entityMissing`, skip |
| 5 | BookCopy BELUM dibuat | ✅ | Tidak ada pemanggilan repository BookCopy; smoke verifikasi count 0 |
| 6 | Barcode BELUM dibuat | ✅ | Tidak ada kode barcode di service |
| 7 | Gunakan `BookRepository` (tanpa Prisma langsung) | ✅ | Hanya `BookRepository.create` / `existsByISBN`; service tidak import `@prisma/client` |
| 8 | Book yang gagal dicatat sebagai issue per baris | ✅ | `row.issues.push({ rowNumber, messageKey })` untuk semua jalur gagal |
| 9 | Seluruh proses di Main Process; renderer terima hasil akhir | ✅ | `importBooks` dipanggil di handler `imports:match` sebelum hasil dikirim |
| 10 | Tidak mengubah Matching Engine/Strategy/Validation/WorkbookReader/AutoCreate | ✅ | File-file tersebut tak tersentuh (verifikasi `git status`) |

## Architecture Checklist (SPRINT8_EXECUTION_PROTOCOL §2)
| # | Pertanyaan | Wajib | Jawaban |
|---|------------|-------|---------|
| 1 | Repository tetap SSOT (single source of truth data)? | Ya | **Ya** — semua persistensi lewat `BookRepository`; tanpa `@prisma/client` di service |
| 2 | Provider bebas business logic? | Ya | **Ya** — service tidak menyentuh provider |
| 3 | Engine tetap tidak mengenal Repository maupun Prisma? | Ya | **Ya** — `MatchingEngineService` tidak diubah |
| 4 | Tidak ada `mode`? | Ya | **Ya** |
| 5 | Tidak ada `searchMode`? | Ya | **Ya** |
| 6 | Tidak ada `switch(mode)` / enum mode? | Ya | **Ya** |
| 7 | Build PASS? | Ya | **Ya** — `npm run build` PASS |
| 8 | Lint PASS? | Ya | **Ya** — `npm run lint` PASS |
| 9 | Rollback tervalidasi? | Ya | **Ya** — revert commit WO-6 (1 WO = 1 commit); service baru + 3 file wiring, tidak menyentuh file WO lain |
| 10 | Semua dependency (WO prasyarat) terpenuhi? | Ya | **Ya** — WO-4.1 wiring + WO-5 Auto Create (disetujui) jadi input (`resolvedEntity` sudah terisi) |

## Batasan — tidak tersentuh
MatchingEngineService, Strategy, Provider, Repository (semua kecuali konsumsi `BookRepository`), WorkbookReader,
ValidationEngineService, AutoCreateService, template import, preload, env.d.ts, `src/types/import.ts`.
(Verifikasi `git status` pasca-implementasi — hanya file milik WO-6 + laporan.)

## Verifikasi
- `npm run lint` ✅ · `npm run build` ✅ · Smoke Book Import 15/15 ✅ (DB temp, dibersihkan).
