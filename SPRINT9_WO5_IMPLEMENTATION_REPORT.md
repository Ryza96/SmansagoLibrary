# SPRINT9 — WO-5 Implementation Report
**Auto Create** — membuat entity hasil matching untuk field yang belum ditemukan.

## 1. Ringkasan
`AutoCreateService` (main process) menerima `MatchedWorkbook` dari `MatchingEngine`, memproses setiap
`FieldMatch`, dan menempelkan entitas hasil resolve ke `FieldMatch.resolvedEntity` sehingga tahap Book Import
berikutnya (WO-6) tidak perlu lookup ulang. Entity yang boleh dibuat hanya **Author, Publisher, Category**
(sesuai scope). Book **tidak** dibuat. Semua persistensi lewat **Repository yang sudah ada** (SSOT) — tanpa
query Prisma langsung di service.

## 2. Perubahan Kode

### File baru
| File | Isi |
|------|-----|
| `src/main/services/auto-create.service.ts` | `AutoCreateService` — pemetaan status→tindakan, create/reuse entity, pencatatan issue AMBIGUOUS, dedupe intra-run. |

### File dimodifikasi
| File | Perubahan |
|------|-----------|
| `src/types/import.ts` | `FieldMatch.resolvedEntity?: MatchCandidate \| null` — slot hasil resolve (existing FOUND / created NOT_FOUND / null). |
| `electron/ipc/book-import.ipc.ts` | Handler `imports:match` kini `engine.match(...)` → `autoCreateService.apply(...)` → `MatchedWorkbook` akhir. |
| `electron/ipc/index.ts` | `autoCreateService: AutoCreateService` ditambahkan ke signature `registerAllHandlers`. |
| `electron/main/bootstrap.ts` | `autoCreateService = new AutoCreateService(NewAuthorRepository, NewPublisherRepository, NewCategoryRepository)` ditambahkan ke `Container`. |

Tidak ada perubahan tsconfig (service baru di `src/main/**/*` sudah tercakup), preload, maupun `env.d.ts`
(hasil tetap bertipe `MatchedWorkbook`).

## 3. Detail Teknis

### 3.1 Peta keputusan per FieldMatch
| Status | Tindakan | `resolvedEntity` |
|--------|----------|------------------|
| `FOUND` | pakai entity existing | `candidates[0]` (id + label) |
| `NOT_FOUND` | buat entity baru (hanya `authors`/`publisher`/`category`) | `{ id, label }` entity baru |
| `NOT_FOUND` (field `isbn`) | tidak buat apa-apa (Book di luar scope WO-5) | `null` |
| `AMBIGUOUS` | tidak membuat; catat issue `autoCreate.ambiguous` | `null` |
| `SKIPPED` | abaikan | `null` |
| `NOT_FOUND` + gagal create (P2002 tanpa recovery) | catat issue `autoCreate.createFailed` | `null` |

Issue direkam di `matchedRow.issues` **dan** `matchingResult.warnings` (aggregat workbook).

### 3.2 Persistensi hanya lewat Repository (SSOT)
- `AuthorRepository.create({ name })`
- `PublisherRepository.create({ name })`
- `CategoryRepository.create({ name, code })` — `code` digenerate `toCategoryCode(name)`
  (uppercase, non-alphanumerik → `_`, fallback `CATEGORY`) karena kolom `Category.code` `@unique`.
- Recovery P2002: `findExact(name)` untuk author/publisher/category; hanya rethrow error lain.

### 3.3 Dedupe intra-run
`created: Map<"field::name", MatchCandidate>` mencegah create ganda saat baris yang sama muncul lagi
(dua baris berisi author/publisher/category yang sama → reuse id yang sama, bukan insert duplikat).
Baris diproses sekuensial sehingga dedupe deterministik.

### 3.4 Tidak mengubah Matching Engine / Strategy / Validation / WorkbookReader
Engine, strategy, provider, repository, dan workbook reader **tidak tersentuh**. Auto Create hanya membaca
output engine (`MatchedWorkbook`) dan melengkapi struktur output.

## 4. Verifikasi
| Gate | Hasil |
|------|-------|
| `npm run lint` (node + web `tsc --noEmit`) | PASS |
| `npm run build` (electron-vite build) | PASS (main 109.92 kB) |
| Smoke Auto Create (fresh DB, 24 kasus) | PASS 24/24 |

Kasus smoke (skrip sementara `scripts/smoke-wo5-auto-create.ts`, dihapus setelah selesai):
- FOUND isbn/author/category → `resolvedEntity` menunjuk id existing.
- NOT_FOUND publisher/author/category → dibuat di DB; `resolvedEntity` berisi id+label baru.
- NOT_FOUND isbn → tidak membuat Book; `resolvedEntity` null.
- SKIPPED (blank publisher) → null, tanpa create.
- AMBIGUOUS author → tidak create; issue `autoCreate.ambiguous` di row + warnings workbook.
- Dedupe: publisher & category duplikat antar baris → id yang sama (single insert).
- DB: 1 author baru, 1 publisher baru, 1 category baru (code `SEJARAH`), 0 Book baru.

DB uji = fresh SQLite temp (`prisma migrate deploy`), dibersihkan; DB dev tidak disentuh.

## 5. Status
**DONE — READY untuk review PO.**
