# SPRINT8_REPORT.md — Database Matching Provider

Work Order: **Sprint 8 — Database Matching Provider**
Status: **COMPLETE — READY**
Date: 2026-07-31

---

## 1. File Baru

| File | Deskripsi |
|------|-----------|
| `src/shared/match-provider.ts` | **SPI dipindah ke lapisan shared** (ADR-012: providers adalah infrastructure; kontrak dibagi main & renderer). Berisi `MatchCandidate`, `MatchProvider`, `IsbnMatchProvider`, `AuthorMatchProvider`, `PublisherMatchProvider`, `CategoryMatchProvider`, dan **`BookMatchProvider`** (baru, `field: 'isbn'`). `findMatches` kini **async** (`Promise<MatchCandidate[]>`). |
| `src/main/providers/prisma-author-match.provider.ts` | `PrismaAuthorMatchProvider` — query `AuthorRepository.findMany({ search })`. |
| `src/main/providers/prisma-category-match.provider.ts` | `PrismaCategoryMatchProvider` — query `CategoryRepository.findMany({ search })`. |
| `src/main/providers/prisma-publisher-match.provider.ts` | `PrismaPublisherMatchProvider` — query `PublisherRepository.findMany({ search })`. |
| `src/main/providers/prisma-book-match.provider.ts` | `PrismaBookMatchProvider` — query `BookRepository.findByISBN`. |
| `src/main/providers/index.ts` | Factory `createPrismaMatchProviders()` (Book→Author→Publisher→Category) + re-export 4 provider. |

(Buatan smoke test `sprint8-smoke.ts`/`.cjs` + DB uji dihapus setelah bukti.)

## 2. File Diubah

| File | Perubahan |
|------|-----------|
| `src/types/import.ts` | `MatchCandidate` dipindah ke `src/shared/match-provider.ts` (import + re-export). Tipe lain tidak berubah. |
| `src/services/MatchProviders.ts` | Kini **re-export** dari shared (`export * from '../shared/match-provider'`) — path impor engine & dummy tetap sama. |
| `src/services/DummyMatchProviders.ts` | `findMatches` menjadi `async` (sesuai SPI baru). Data in-memory tetap (Andrea Hirata, Fiksi, dummy ISBN, Gramedia). |
| `src/services/MatchingEngineService.ts` | `match()`/`matchRow()` menjadi `async` (provider kini async). **Arsitektur tidak berubah**: DI provider (ADR-011), murni (ADR-010), status SKIPPED/NOT_FOUND/FOUND/AMBIGUOUS, `matches[]` per baris — sama persis. Default tetap `dummyMatchProviders`. |

Tidak ada perubahan repository, template, context, hook, maupun halaman.

## 3. Repository yang Digunakan

| Repository | Method yang dipakai Provider | Query Prisma |
|------------|------------------------------|--------------|
| `AuthorRepository` (`src/main/repositories/author.repository.ts`) | `findMany({ search })` | `author.findMany({ where: { name: { contains } } })` |
| `CategoryRepository` | `findMany({ search })` | `category.findMany({ where: { name: { contains } } })` |
| `PublisherRepository` | `findMany({ search })` | `publisher.findMany({ where: { name: { contains } } })` |
| `BookRepository` | `findByISBN(isbn)` | `book.findUnique({ where: { isbn } })` |

Semua repository mengextend `BaseRepository` yang menyediakan `this.prisma` dari **`getPrisma()` singleton** (`src/main/repositories/base/prisma.ts`). Provider **tidak pernah** menyentuh `PrismaClient` (ADR-014: provider pakai repository).

## 4. Provider Baru

```ts
// Pola — constructor-injected repository (ADR-014), tanpa PrismaClient (grep = 0 match)
export class PrismaAuthorMatchProvider implements AuthorMatchProvider {
  readonly id = 'prisma-author'
  readonly field = 'authors'
  readonly label = 'Prisma Author'
  constructor(private readonly repository: AuthorRepository) {}
  async findMatches(value: string): Promise<MatchCandidate[]> {
    const result = await this.repository.findMany({ search: value })
    return result.data.map((author) => ({ id: author.id, label: author.name }))
  }
}
```

| Provider | id | field | Repo | Semantik query |
|----------|----|-------|------|----------------|
| `PrismaBookMatchProvider` | `prisma-book` | `isbn` | `BookRepository` | exact `findUnique` by ISBN → kandidat = Buku (label = judul) |
| `PrismaAuthorMatchProvider` | `prisma-author` | `authors` | `AuthorRepository` | substring `name contains` → kandidat = Author |
| `PrismaPublisherMatchProvider` | `prisma-publisher` | `publisher` | `PublisherRepository` | substring `name contains` → kandidat = Publisher |
| `PrismaCategoryMatchProvider` | `prisma-category` | `category` | `CategoryRepository` | substring `name contains` → kandidat = Category |

> **Catatan arsitektur (ADR-012/013):** provider hanya infrastruktur query. Strategi matching (`FOUND/NOT_FOUND/AMBIGUOUS`) tetap di engine; `contains` multi-result → `AMBIGUOUS` otomatis. Book provider menggantikan peran ISBN provider sisi DB (`field: 'isbn'`).

## 5. Diagram Arsitektur Akhir

```
┌─ Renderer (src/services — UI pipeline) ─────────────────────────────┐
│  MatchingEngineService (async, PURE — ADR-010)                       │
│    │ DI MatchProvider[] (ADR-011)                                    │
│    ├── src/services/MatchProviders.ts  → re-export shared SPI        │
│    └── DummyMatchProviders (testing, tetap ada)                      │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ kontrak bersama
┌─ src/shared/match-provider.ts ────────────── SPI (MatchProvider, BookMatchProvider, MatchCandidate) ─┐
└──────────────────────────┬───────────────────────────────────────────┘
┌─ Main process (src/main — infra) ───────────────────────────────────┐
│  createPrismaMatchProviders()                                        │
│    ├── PrismaBookMatchProvider ──► BookRepository                    │
│    ├── PrismaAuthorMatchProvider ─► AuthorRepository                 │
│    ├── PrismaPublisherMatchProvider ─► PublisherRepository           │
│    └── PrismaCategoryMatchProvider ─► CategoryRepository             │
│              │ semua extends BaseRepository → getPrisma() singleton  │
│              └──► PrismaClient (SQLite) — HANYA di repository        │
└──────────────────────────────────────────────────────────────────────┘
```

Layering (ADR-005): renderer engine tidak tahu DB; main providers tidak tahu UI; SPI shared jadi satu-satunya jembatan.

## 6. Bukti Query Database

DB uji **fresh** (`prisma migrate deploy` — 3 migration: adr002 baseline → wo13 → wo13_r1), SQL terekam via `new PrismaClient({ log: ['query'] })`:

```
prisma:query DELETE FROM `main`.`Book` WHERE 1=1            ← seed reset
prisma:query INSERT INTO `main`.`Author` (...) RETURNING ... ← seed
prisma:query INSERT INTO `main`.`Category` (...) RETURNING ...
prisma:query INSERT INTO `main`.`Publisher` (...) RETURNING ...
prisma:query INSERT INTO `main`.`Book` (...) RETURNING ...  (Laskar Pelangi, ISBN 9789793062792)
...
seeded: 3 authors, 2 categories, 2 publishers, 2 books

--- direct query evidence (provider repository query shapes) ---
prisma:query SELECT ... FROM `main`.`Author` WHERE `main`.`Author`.`name` LIKE ? LIMIT ? OFFSET ?   ← author contains
prisma:query SELECT ... FROM `main`.`Category` WHERE `main`.`Category`.`name` LIKE ? LIMIT ? OFFSET ? ← category contains
prisma:query SELECT ... FROM `main`.`Publisher` WHERE `main`.`Publisher`.`name` LIKE ? LIMIT ? OFFSET ? ← publisher contains
prisma:query SELECT ... FROM `main`.`Book` WHERE (`main`.`Book`.`isbn` = ? AND 1=1) LIMIT ? OFFSET ?  ← book findUnique by ISBN
author contains "Andrea Hirata" -> Andrea Hirata
author contains "Andrea" -> Andrea Hirata, Andrea Firmansyah     ← 2 kandidat (AMBIGUOUS)
category contains "Fiksi" -> Fiksi
publisher contains "Gramedia Pustaka Utama" -> Gramedia Pustaka Utama
book findUnique isbn -> Laskar Pelangi
```

## 7. Bukti Matching

Driver `sprint8-smoke.ts` (bundle esbuild CJS + `--packages=external`, **dihapus**; DB uji dibersihkan). Engine = `new MatchingEngineService(createPrismaMatchProviders())`, workbook divalidasi dulu via `validationEngineService`:

```
PASS validate: 3 canonical rows
PASS match: 3 matched rows
PASS row2 authors=Andrea Hirata -> FOUND (DB id)        ← candidate.id === UUID seeded
PASS row2 category=Fiksi -> FOUND
PASS row2 isbn=9789793062792 -> Book FOUND (Laskar Pelangi)  ← provider prisma-book
PASS row2 publisher -> SKIPPED (no template column)
PASS row3 authors=Pramoedya Ananta Toer -> FOUND
PASS row4 authors=James Clear -> NOT_FOUND
PASS row4 category=Pengembangan -> NOT_FOUND
PASS row4 isbn=9780735211292 -> NOT_FOUND
PASS crafted authors=Andrea -> AMBIGUOUS (2 authors)
PASS crafted publisher=Gramedia Pustaka Utama -> FOUND
PASS crafted authors=andrea hirata (lowercase) -> FOUND (SQLite LIKE is ASCII case-insensitive)
PASS crafted andrea2 exists (seeded Andrea Firmansyah)
PASS dummy: row2 isbn -> FOUND (dummy-isbn)             ← Dummy provider tetap jalan (async)
PASS dummy: row2 authors -> FOUND (dummy-author)
result: 16 passed, 0 failed
```

Poin yang dibuktikan:
- **Provider query DB beneran**: `FOUND` membawa id entitas yang di-seed dari DB (bukan data dummy) — `candidate.id === andrea.id`, `=== fiksi.id`, `=== laskar.id`.
- **Semua Match Status aktif di DB**: FOUND (Andrea Hirata/Fiksi/Sejarah/ISBN Laskar), NOT_FOUND (James Clear/Pengembangan/ISBN tak ada), AMBIGUOUS (`contains 'Andrea'` → 2 author), SKIPPED (publisher tanpa kolom template; tidak muncul).
- **Case-insensitive**: SQLite `LIKE` = case-insensitive ASCII → `'andrea hirata'` menemukan `Andrea Hirata`.
- **Dummy tetap**: default `matchingEngineService` (dummy) masih FOUND — bukti testing tanpa DB tetap tersedia.
- **Kontrak tidak berubah**: `FieldMatch { field, provider, status, candidates }`, `MatchStatus`, `MatchedRow.matches` — identik Sprint 7.

## 8. Bukti Build

```
> npm run lint   (tsc --noEmit node + web)      → PASS (exit 0)
> npm run build  (electron-vite build)           → PASS
    main 88.19 kB · preload 6.35 kB · renderer 880.99 kB (1913 modules)
```

## 9. Bukti Lint

```
> npx eslint src/shared/match-provider.ts src/types/import.ts \
    src/services/MatchProviders.ts src/services/DummyMatchProviders.ts \
    src/services/MatchingEngineService.ts \
    src/main/providers/index.ts src/main/providers/prisma-*.provider.ts --max-warnings 0  → PASS (exit 0)
```

- **Grep `PrismaClient|new PrismaClient|@prisma/client` pada `src/main/providers/` → 0 match** (DoD: tidak ada PrismaClient di Provider).
- `git diff prisma/schema.prisma` → hanya perubahan **WO13 yang sudah ada**; tidak ada migration baru; **tidak ada perubahan database** dari Sprint 8.
- **Tidak diimplementasikan**: Insert/Update Book, Import Engine, Duplicate Detection, Merge Logic, Transaction Import.

## 10. Risiko Sebelum Sprint 9

1. **`npm run lint:eslint` repo-wide tetap tidak hijau** (17 error + 42 warning pre-existing) — di luar scope.
2. **MatchingEngineService berubah menjadi async** — konsekuensi wajib dari ADR-014 (Prisma async). Arsitektur (DI, purity, layering) tetap; **call site produksi belum ada** (belum di-wire ke UI). Konsumen masa depan wajib `await match(...)`.
3. **`contains` bersifat substring** — `'Andrea'` cocok `Andrea Hirata` & `Andrea Firmansyah` (AMBIGUOUS). Tanpa strategi skor/peringkat, semua kandidat setara; Sprint 9 perlu kebijakan (exact-first, confidence, batas kandidat).
4. **SQLite `LIKE` case-insensitive hanya ASCII** — teks non-ASCII (mis. huruf beraksen) bisa case-sensitive; perlu normalisasi/strategy bila relevan.
5. **`findMany` default limit = 10** (`getPaginationParams`) — data >10 kandidat terpotong; perlu batas eksplisit atau query exact.
6. **Factory membuat repository via `getPrisma()` singleton** — tidak bisa di-inject client test; smoke test DB menggunakan client terpisah (sesama DB) untuk logging SQL. Bila perlu DI penuh, `BaseRepository` sebaiknya terima PrismaClient opsional.
7. **Belum ada komposisi root** yang memilih provider (dummy vs prisma) secara dinamis — kandidat wiring di Import Engine Sprint 9+.
8. **`publisher` tidak ada di template v2** → `PrismaPublisherMatchProvider` selalu SKIPPED pada data template saat ini (kontrak siap, kolom menyusul).
9. **`MatchedRow.matches` belum tampil di UI** — preview hasil matching menyusul bersama Import Engine.

## Status

Empat Database Matching Provider (Book/Author/Publisher/Category) memakai Repository via constructor (ADR-014) tanpa menyentuh PrismaClient; SPI dipindah ke `src/shared` (ADR-012) dan menjadi async; MatchingEngineService memakai provider yang sama dengan arsitektur tetap (ADR-010/011); Dummy provider dipertahankan untuk testing; dibuktikan 16 smoke test + SQL query nyata di DB SQLite fresh. Build + lint PASS, **tidak ada perubahan database**. **READY untuk Sprint 9.**
