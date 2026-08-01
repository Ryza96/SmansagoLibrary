# SPRINT8_IMPLEMENTATION_PLAN — Baseline RFC Revision 2

**Status:** DRAFT — menunggu persetujuan Product Owner. **BELUM ada implementasi, commit, atau test.**
**Baseline:** `SPRINT8_REVISION2_RFC.md` — **DISETUJUI**. `SPRINT8_REVISION3_RFC.md` dipelajari, **TIDAK diadopsi** (keputusan PO).
**Prinsip tiap Work Order:** independen, dapat direview, dapat di-rollback, **tidak merusak build**, tidak mengubah behavior di luar scope.

---

## 0. Keputusan & Resolusi yang Dipakai Plan Ini

| # | Isu | Resolusi |
|---|---|---|
| D1 | RFC Rev 2 vs Rev 3 | Implementasi memakai **Rev 2**: Strategy = class per field×perilaku (`ExactAuthorStrategy`, `ContainsAuthorStrategy`, …). **Tidak ada** `mode`/`searchMode`/`MatchCriterion`/`MatchBinding`. |
| D2 | Default strategi produksi | Registry `createProductionStrategies()` = **isbn→ExactBook**, **authors→ContainsAuthor**, **publisher→ContainsPublisher**, **category→ContainsCategory** — **perilaku identik Sprint 8** (author/publisher/category memakai `contains`, ISBN memakai `findByISBN`/exact). *Catatan: RFC Rev 2 §Q8 sempat menulis `ExactAuthorStrategy`; itu bertentangan dengan rekomendasinya sendiri dan perilaku Sprint 8. Plan ini memilih **ContainsAuthor** demi "tidak mengubah behavior di luar scope".* |
| D3 | Transisi interface provider | Base `MatchProvider` **mengawetkan sementara** method lama `findMatches(value)` (ditandai deprecated, mendelegasikan ke operasi eksplisit) agar Engine tetap kompilasi selama WO-3–WO-4. Method ini **dihapus di WO-5** bersamaan dengan refactor Engine. |
| D4 | `FieldMatch.strategy?` | **Opsional (keputusan PO).** Default plan: **SKIP** (menghindari scope creep). Bila PO setuju, ditambahkan additive di WO-5 (`FieldMatch.strategy?: string`). |
| D5 | Working tree belum bersih | Ada 194 perubahan staged WO-BR-99 + WO13 di working tree. Tiap WO **hanya menyentuh file di daftarnya**; jalankan `git status` sebelum mulai; jangan stage/commit file di luar WO. |

---

## 1. Ringkasan Urutan & Alasan

Urutan dipilih dengan aturan: **tambahan (additive) dulu → seam (interface) → lapisan baru → swap Engine → wiring → test → regression**. Setiap langkah meninggalkan build hijau; perubahan behavior hanya terjadi di titik yang disengaja (WO-5 untuk dunia Dummy, WO-6 untuk produksi — keduanya mempertahankan perilaku Sprint 8).

| WO | Nama | Jenis | Dependency | Build hijau? |
|---|---|---|---|---|
| WO-1 | Shared Strategy Contract | additive (file baru) | — | ✓ |
| WO-2 | Repository Explicit Operations | additive (method baru) | — | ✓ |
| WO-3 | Provider SPI Restructure + Migrasi Implementer | seam (interface + 8 implementer) | WO-2 | ✓ |
| WO-4 | Strategy Layer | additive (file baru) | WO-1, WO-3 | ✓ |
| WO-5 | Matching Engine Refactor | swap (Engine + hapus transisi) | WO-4 | ✓ |
| WO-6 | Production Factory / Registry | additive (+ deprecate lama) | WO-3, WO-4 | ✓ |
| WO-7 | Smoke Tests (layer baru) | additive (file test) | WO-5, WO-6 | ✓ |
| WO-8 | Regression & Laporan | validasi | WO-7 | ✓ |

Graf ketergantungan:

```
WO-1 ──────────────┐
                    ├─▶ WO-4 ──▶ WO-5 ──▶ WO-7 ──▶ WO-8
WO-2 ──▶ WO-3 ─────┘        │
                              └──────────▶ WO-6 ──┘
```

Alasan urutan (per WO dijelaskan detail di §2–§9):

1. **WO-1 & WO-2 dulu & paralel** — keduanya murni menambah (kontrak baru + operasi baru) tanpa menyentuh apa pun yang sudah jalan. Paling aman, mudah di-review, mudah di-rollback (hapus file/method).
2. **WO-3 sebelum WO-4** — strategy (WO-4) butuh provider yang sudah punya operasi eksplisit. WO-3 adalah satu-satunya "seam" yang menyentuh interface + semua implementernya sekaligus; dibungkus method transisi (D3) supaya Engine lama tetap kompilasi.
3. **WO-4 sebelum WO-5** — Engine (WO-5) butuh `dummyMatchStrategies` sebagai default barunya.
4. **WO-5 setelah WO-4** — titik di mana Engine beralih dari provider ke strategy. Satu-satunya perubahan behavior dunia Dummy (exact→contains untuk nama, disengaja = paritas dengan produksi).
5. **WO-6 setelah WO-3/WO-4** — factory produksi hanya komposisi; perilaku produksi identik Sprint 8.
6. **WO-7 & WO-8 di akhir** — kontrak matching baru final di WO-5/WO-6, baru aman menulis test yang mengikat kontrak itu, lalu menjalankan regression penuh.

---

## 2. WO-1 — Shared Strategy Contract

**1. Objective**
Menetapkan SPI `MatchStrategy` (perilaku) + sub-interface per field sebagai dasar Strategy Layer (ADR-018). Murni additive — tidak ada file yang berubah perilakunya.

**2. Scope**
Tambah file baru `src/shared/match-strategy.ts` berisi:
```ts
import type { MatchCandidate } from './match-provider'

export interface MatchStrategy {
  readonly id: string
  readonly field: string
  readonly label: string
  readonly providerId: string        // id provider terikat → dipakai FieldMatch.provider
  findMatches(value: string): Promise<MatchCandidate[]>
}

export interface AuthorMatchStrategy extends MatchStrategy { readonly field: 'authors' }
export interface PublisherMatchStrategy extends MatchStrategy { readonly field: 'publisher' }
export interface CategoryMatchStrategy extends MatchStrategy { readonly field: 'category' }
export interface BookMatchStrategy extends MatchStrategy { readonly field: 'isbn' }
```
`src/services/MatchProviders.ts` boleh ditambah re-export `match-strategy.ts` (opsional, konsistensi barrel).

**3. Files yang berubah**
- `src/shared/match-strategy.ts` (BARU)
- `src/services/MatchProviders.ts` (opsional, tambah `export * from '../shared/match-strategy'`)

**4. Risiko**
Rendah. Nama `MatchStrategy` belum dipakai; tidak ada konsumen lain. Risiko terkecil: konflik barrel bila diubah tanpa hati-hati.

**5. Dependency**
Tidak ada.

**6. Validation**
`npm run lint`; `npm run build`. Engine lama (masih provider-based) harus tetap hijau.

**7. Rollback Plan**
Hapus `src/shared/match-strategy.ts`; kembalikan re-export barrel bila ditambah.

**8. Definition of Done**
File SPI ada; tipe per-field literal ada; build hijau; tidak ada file lain yang berubah.

**Boleh:** menambah tipe/file baru; re-export barrel.
**Tidak boleh:** mengubah `match-provider.ts`; mengubah Engine/Provider/Repository; menambah logika runtime.

---

## 3. WO-2 — Repository Explicit Operations

**1. Objective**
Menambahkan operasi eksplisit (ADR-019) ke 4 repository agar Provider (WO-3) dan Strategy fuzzy (WO-4) punya predikat bernama, bukan parameter perilaku. Murni additive — method lama tetap.

**2. Scope**
- `AuthorRepository`, `CategoryRepository`, `PublisherRepository` tambah:
  - `findExact(name)` → `findMany({ where: { name: { equals: name } }, take: 10, orderBy: { name: 'asc' } })`
  - `findContains(name)` → `findMany({ where: { name: { contains: name } }, take: 10, orderBy: { name: 'asc' } })`
  - `findPrefix(name)` → `findMany({ where: { name: { startsWith: name } }, take: 10, orderBy: { name: 'asc' } })`
  - `findAll(limit = 500)` → `findMany({ take: clamped, orderBy: { name: 'asc' } })` — **sengaja melewati `getPaginationParams`** (default 10) karena berfungsi sebagai super-set fuzzy; clamp 1..500.
- `BookRepository` tambah `findAll(limit = 500)` (sama). `findByISBN` sudah ada — **tidak diubah**.
- `base/repository.types.ts` dan `base/pagination.ts` **TIDAK diubah** (tidak ada `searchMode`; operasi eksplisit memakai parameter langsung).

**3. Files yang berubah**
- `src/main/repositories/author.repository.ts`
- `src/main/repositories/category.repository.ts`
- `src/main/repositories/publisher.repository.ts`
- `src/main/repositories/book.repository.ts`

**4. Risiko**
Rendah. Method baru tidak dipanggil siapa pun sampai WO-3. Jebakan: `findAll` harus tidak terpotong limit default 10 (ini sengaja dibedakan dari `findMany` tanpa argumen).

**5. Dependency**
Tidak ada (paralel dengan WO-1).

**6. Validation**
`npm run lint`; `npm run build`. Tidak ada test baru di WO ini (dipanggil mulai WO-7).

**7. Rollback Plan**
Hapus method yang ditambahkan; `findByISBN` dan method lama tidak tersentuh.

**8. Definition of Done**
4 repository punya operasi eksplisit sesuai ADR-019; tidak ada perubahan signature method lama; build hijau.

**Boleh:** menambah method baru; menambah test satuan kecil opsional (dummy DB) bila praktis.
**Tidak boleh:** mengubah `findMany`/`findById`/`existsBy*`/`count` yang ada; menambah parameter perilaku (`searchMode`/`mode`); mengubah `repository.types.ts`/`pagination.ts`.

---

## 4. WO-3 — Provider SPI Restructure + Migrasi Implementer

**1. Objective**
Mengubah SPI provider dari `findMatches(value)` (nilai + cara tersirat) menjadi **operasi eksplisit per field** (ADR-018/019), dan memigrasikan **seluruh 8 implementer** (4 Dummy + 4 Prisma) sekaligus. Ini satu-satunya "seam" interface; dibungkus method transisi (D3) agar Engine lama tetap kompilasi.

**2. Scope**
`src/shared/match-provider.ts` di-restructure ke bentuk final Rev 2:
```ts
export interface MatchCandidate { id: string; label: string }

export interface MatchProvider {
  readonly id: string
  readonly field: string
  readonly label: string
  /** TRANSISI (dihapus di WO-5): delegasi ke operasi eksplisit */
  findMatches(value: string): Promise<MatchCandidate[]>
}

export interface NamedMatchProvider extends MatchProvider {
  findExact(value: string): Promise<MatchCandidate[]>
  findContains(value: string): Promise<MatchCandidate[]>
  findPrefix(value: string): Promise<MatchCandidate[]>
  findAll(limit?: number): Promise<MatchCandidate[]>
}

export interface AuthorMatchProvider extends NamedMatchProvider { readonly field: 'authors' }
export interface PublisherMatchProvider extends NamedMatchProvider { readonly field: 'publisher' }
export interface CategoryMatchProvider extends NamedMatchProvider { readonly field: 'category' }

export interface BookMatchProvider extends MatchProvider {
  readonly field: 'isbn'
  findByISBN(isbn: string): Promise<MatchCandidate[]>
  findAll(limit?: number): Promise<MatchCandidate[]>
}
```
Migrasi implementer:
- **Dummy** (`src/services/DummyMatchProviders.ts`): keempat class mengimplementasikan operasi eksplisit dengan **semantik meniru SQLite** (`equals`/`contains`/`startsWith` case-insensitive ASCII via `toLowerCase`); data & ID kandidat (`author-*`, `isbn-*`, dst.) **tidak berubah**. `findMatches` transisi = `findContains` (Book: `findByISBN`).
- **Prisma** (`src/main/providers/prisma-{author,book,publisher,category}-match.provider.ts`): tiap operasi memanggil **satu** operasi repository WO-2 dan memetakan entity → `MatchCandidate[]`. `PrismaBookMatchProvider.findExact` → `findByISBN`. `findMatches` transisi = delegasi.

**3. Files yang berubah**
- `src/shared/match-provider.ts`
- `src/services/DummyMatchProviders.ts`
- `src/main/providers/prisma-author-match.provider.ts`
- `src/main/providers/prisma-book-match.provider.ts`
- `src/main/providers/prisma-publisher-match.provider.ts`
- `src/main/providers/prisma-category-match.provider.ts`
- `src/main/providers/index.ts` (dipastikan tetap kompilasi; `createPrismaMatchProviders` dipertahankan, di-deprecate di WO-6)
- `src/services/MatchProviders.ts` (barrel — boleh tetap)

**4. Risiko**
Sedang. Restructure interface berisiko merusak kompilasi bila ada implementer terlewat. Mitigasi: 8 implementer = seluruhnya di-migrasi dalam WO yang sama; method transisi menjaga Engine; grep `implements .*MatchProvider` dijalankan sebelum selesai. Perilaku saat WO ini: **belum berubah** (Engine masih memakai `findMatches` transisi = `findContains` untuk nama / `findByISBN` untuk isbn — sama dengan Sprint 8).

**5. Dependency**
WO-2 (Prisma provider butuh operasi repository eksplisit).

**6. Validation**
`npm run lint`; `npm run build`; grep pastikan tidak ada `findMatches(value)` selain yang transisi; `git status` hanya menampilkan file di scope.

**7. Rollback Plan**
Revert seluruh perubahan WO-3 sekaligus (interface + 8 implementer + barrel) — satu commit, satu revert.

**8. Definition of Done**
SPI = bentuk final Rev 2; 8 implementer memakai operasi eksplisit; Dummy≡Prisma semantik sama untuk mode yang sama; Engine lama masih kompilasi & perilaku Sprint 8 tidak berubah.

**Boleh:** mengubah interface provider + seluruh implementer; mempertahankan `findMatches` transisi (deprecated); menyesuaikan `index.ts` agar kompilasi.
**Tidak boleh:** mengubah Engine (di luar memastikan kompilasi); mengubah ID/label kandidat Dummy; mengubah signature repository; menambah `mode`/`switch`.

---

## 5. WO-4 — Strategy Layer

**1. Objective**
Mewujudkan ADR-018: perilaku pencarian sebagai **class per field×perilaku**, murni, testable tanpa DB, memakai operasi eksplisit provider (WO-3). Murni additive — tidak ada file runtime yang diubah.

**2. Scope**
File baru di `src/services/strategies/`:
- `ExactAuthorStrategy` → `provider.findExact(value.trim())`
- `ContainsAuthorStrategy` → `provider.findContains(value.trim())`
- `PrefixAuthorStrategy` → `provider.findPrefix(value.trim())`
- `AliasAuthorStrategy(provider, aliases)` → normalize → ekspansi alias → `provider.findExact(…)` paralel → `dedupeById`
- `FuzzyAuthorStrategy(provider, { threshold=0.8, limit=10, scanLimit=500 })` → `provider.findAll(scanLimit)` → `levenshteinRatio` → filter → sort desc → slice
- `ExactBookStrategy` → `provider.findByISBN(value.trim())`
- `ContainsPublisherStrategy` → `provider.findContains(value.trim())`
- `ContainsCategoryStrategy` → `provider.findContains(value.trim())`
- Helper murni: `similarity.ts` (`levenshteinRatio`, `normalizeForComparison`), `dedupe.ts` (`dedupeById`)
- `src/services/DummyMatchStrategies.ts` → `dummyMatchStrategies: MatchStrategy[]`:
  `[ExactBook(dummyIsbn), ContainsAuthor(dummyAuthor), ContainsPublisher(dummyPublisher), ContainsCategory(dummyCategory)]`

Semua strategy mengimplementasikan sub-interface WO-1 (`AuthorMatchStrategy`/`BookMatchStrategy`/…) dan mengisi `providerId` dari provider terikat.

**3. Files yang berubah**
- `src/services/strategies/` (BARU: 8 class + 2 helper)
- `src/services/DummyMatchStrategies.ts` (BARU)

**4. Risiko**
Rendah. File baru semua; tidak dipakai runtime sampai WO-5. Risiko kecil: salah memetakan `providerId`/`field` — dicegah sub-interface literal + review.

**5. Dependency**
WO-1 (SPI strategy), WO-3 (operasi provider).

**6. Validation**
`npm run lint`; `npm run build`; (opsional) panggil manual via script ad-hoc untuk memastikan strategy Dummy mengembalikan kandidat sesuai data uji.

**7. Rollback Plan**
Hapus direktori `src/services/strategies/` + `DummyMatchStrategies.ts`.

**8. Definition of Done**
8 class + 2 helper ada; tiap strategy memakai operasi eksplisit (tidak ada `findMatches` provider yang dipanggil); `dummyMatchStrategies` terdefinisi; build hijau.

**Boleh:** menambah file/class baru; menggunakan operasi eksplisit provider; menulis helper murni.
**Tidak boleh:** menyentuh Engine/Provider/Repository; memanggil method lama `findMatches`; menambah `mode`/enum/switch; mengubah data uji Dummy.

---

## 6. WO-5 — Matching Engine Refactor (Swap)

**1. Objective**
Mengalihkan Engine dari `providers` ke `strategies`; menghapus method transisi. **Logika status & kontrak output tidak berubah.**

**2. Scope**
- `src/services/MatchingEngineService.ts`:
  - Constructor: `(strategies: readonly MatchStrategy[] = dummyMatchStrategies)` (impor dari `./DummyMatchStrategies`).
  - `matchRow(canonicalRow)`: iterasi `strategies`; baca `canonicalRow.values[strategy.field]`; nilai kosong → `SKIPPED`; `strategy.findMatches(String(value).trim())`; status `0→NOT_FOUND`, `1→FOUND`, `>1→AMBIGUOUS`.
  - `FieldMatch.provider` diisi `strategy.providerId`.
- Hapus `findMatches(value)` dari base `MatchProvider` (`src/shared/match-provider.ts`) + hapus method delegasi transisi di 8 provider (WO-3).
- **Hanya bila D4 disetujui PO:** `src/types/import.ts` tambah `FieldMatch.strategy?: string` dan Engine mengisinya.

**3. Files yang berubah**
- `src/services/MatchingEngineService.ts`
- `src/shared/match-provider.ts`
- `src/services/DummyMatchProviders.ts`
- `src/main/providers/prisma-{author,book,publisher,category}-match.provider.ts`
- `src/types/import.ts` (opsional, D4)

**4. Risiko**
Sedang — satu-satunya WO yang mengubah **behavior dunia Dummy** secara sengaja: default `dummyMatchStrategies` memakai `ContainsAuthor/ContainsPublisher/ContainsCategory` (paritas dengan produksi), sedangkan Sprint 7/8 Dummy sebelumnya **exact**. Input uji yang ada (`andrea hirata`, `gramedia`, `bentang pustaka`, ISBN) tetap `FOUND` (substring), sehingga smoke lama diperkirakan tetap lulus; ekspektasi dicek test-by-test di WO-8.

**5. Dependency**
WO-4 (`dummyMatchStrategies`), WO-3 (provider final).

**6. Validation**
`npm run lint`; `npm run build`; smoke cepat Dummy (tanpa DB): input kanonik → status sesuai (FOUND/NOT_FOUND/AMBIGUOUS/SKIPPED).

**7. Rollback Plan**
Revert commit WO-5 = kembalikan Engine ke provider-based + restore `findMatches` transisi (atau revert WO-5+WO-3 bersama bila diperlukan).

**8. Definition of Done**
Engine memakai strategy; `findMatches` transisi hilang; kontrak `MatchedWorkbook`/`FieldMatch`/`MatchStatus` identik bentuknya; perilaku Dummy = paritas produksi (contains untuk nama).

**Boleh:** mengubah konstruktor Engine & `matchRow`; menghapus method transisi; menambah `FieldMatch.strategy?` bila disetujui.
**Tidak boleh:** mengubah arti status; mengubah bentuk output (kecuali D4); mengubah repository; menambah `mode`.

---

## 7. WO-6 — Production Factory / Registry

**1. Objective**
Menyediakan registry produksi (komposisi di tepi) yang perilakunya **identik Sprint 8**, dan menandai factory lama.

**2. Scope**
- File baru `src/main/strategies/index.ts`:
  ```ts
  export function createProductionStrategies(): MatchStrategy[] {
    const book      = new PrismaBookMatchProvider(new BookRepository())
    const author    = new PrismaAuthorMatchProvider(new AuthorRepository())
    const publisher = new PrismaPublisherMatchProvider(new PublisherRepository())
    const category  = new PrismaCategoryMatchProvider(new CategoryRepository())
    return [
      new ExactBookStrategy(book),            // isbn → exact (findByISBN)
      new ContainsAuthorStrategy(author),     // authors → contains (perilaku Sprint 8)
      new ContainsPublisherStrategy(publisher),
      new ContainsCategoryStrategy(category),
    ]
  }
  ```
- `src/main/providers/index.ts`: `createPrismaMatchProviders` ditandai deprecated (tetap ada untuk kompatibilitas smoke lama; dihapus bila WO-8 memastikan tak terpakai).

**3. Files yang berubah**
- `src/main/strategies/index.ts` (BARU)
- `src/main/providers/index.ts` (deprecate)

**4. Risiko**
Rendah. Murni komposisi; tidak ada consumer baru selain smoke WO-7.

**5. Dependency**
WO-3 (Prisma provider), WO-4 (strategy classes).

**6. Validation**
`npm run lint`; `npm run build`; (opsional) ad-hoc panggil `createProductionStrategies()` dengan DB uji.

**7. Rollback Plan**
Hapus `src/main/strategies/index.ts`; kembalikan deprecate.

**8. Definition of Done**
`createProductionStrategies()` ada dengan default sesuai D2 (perilaku Sprint 8); factory lama deprecated; build hijau.

**Boleh:** menambah factory; menandai deprecated.
**Tidak boleh:** mengubah class strategy/provider/repository; mengubah default produksi dari perilaku Sprint 8.

---

## 8. WO-7 — Smoke Tests (Lapisan Baru)

**1. Objective**
Mengikat kontrak baru (strategy, provider ops, engine, parity Dummy≡Prisma) dengan smoke test yang dapat dijalankan ulang.

**2. Scope**
Script test baru (lokasi contoh: `scripts/smoke/sprint8/`, detail disesuaikan saat implementasi):
- Unit strategy (Dummy): tiap behavior — Exact/Contains/Prefix per field, Alias (ekspansi + dedupe), Fuzzy (threshold, limit, NOT_FOUND di bawah threshold).
- Unit provider ops (Dummy): `findExact`/`findContains`/`findPrefix`/`findAll`/`findByISBN` → kandidat benar, ID kandidat stabil.
- Engine end-to-end (Dummy): status SKIPPED/FOUND/NOT_FOUND/AMBIGUOUS pada workbook sintetis (canonical rows).
- Parity Dummy ≡ Prisma (DB uji fresh): input yang sama → status & ID kandidat sama untuk mode yang sama.
- End-to-end Excel (pola Sprint 6/8): parse → validate → match.

**3. Files yang berubah**
- Script test baru (dalam folder smoke). Tidak ada file produksi (kecuali bug nyata yang ditemukan — dicatat, diperbaiki di WO ini hanya bila minimal).

**4. Risiko**
Sedang — ekspektasi Dummy berubah exact→contains (dari WO-5); pastikan ekspektasi ditulis terhadap **intent paritas produksi**, bukan kebiasaan lama.

**5. Dependency**
WO-5 (engine), WO-6 (factory produksi untuk parity).

**6. Validation**
Semua smoke test lulus; `npm run lint`; `npm run build`.

**7. Rollback Plan**
Hapus folder test; tidak ada perubahan produksi.

**8. Definition of Done**
Smoke baru lulus (est. 20+ kasus) + tidak ada perubahan produksi di luar fix minimal.

**Boleh:** menulis/menambah test; memperbaiki bug nyata minimal dengan catatan.
**Tidak boleh:** memperluas scope; mengubah behavior produksi hanya agar test lulus.

---

## 9. WO-8 — Regression & Laporan

**1. Objective**
Membuktikan tidak ada regresi: seluruh suite Sprint 6/7/8 tetap lulus (dengan penyesuaian ekspektasi yang intent-nya berubah), dan menulis laporan.

**2. Scope**
- Jalankan ulang suite Sprint 6 (18 test), Sprint 7 (25 test), Sprint 8 (16 test DB + unit).
- Bandingkan hasil test-by-test; hanya sesuaikan ekspektasi yang intent-nya berubah karena paritas Dummy (exact→contains). Catat setiap penyesuaian.
- `npm run lint`; `npm run build`; targeted eslint; fresh DB `prisma migrate deploy` (3 migrations) bila smoke DB perlu diulang.
- Tulis `SPRINT8_REVISION2_REPORT.md` (mirip pola laporan sprint sebelumnya: ringkas, status READY, pelajaran retain).
- Pastikan `createPrismaMatchProviders` lama bisa dihapus/di-deprecate final.

**3. Files yang berubah**
- Laporan `SPRINT8_REVISION2_REPORT.md` (BARU)
- (opsional) ekspektasi test lama yang intent-nya berubah
- (opsional) pembersihan `src/main/providers/index.ts` bila factory lama tak terpakai

**4. Risiko**
Rendah–sedang. Perubahan ekspektasi test harus transparan (jangan mengubah ekspektasi untuk menutup regresi).

**5. Dependency**
WO-7.

**6. Validation**
Semua suite hijau; lint+build hijau; laporan lengkap.

**7. Rollback Plan**
Revert penyesuaian ekspektasi bila terbukti salah; laporan dapat ditulis ulang.

**8. Definition of Done**
Tidak ada regresi fungsional; laporan ditulis; status READY; perubahan terisolasi di file scope.

**Boleh:** menyesuaikan ekspektasi yang intent-nya berubah (dengan catatan); membersihkan factory mati; menulis laporan.
**Tidak boleh:** mengubah produksi untuk memaksa test lulus; menambah fitur.

---

## 10. Matriks Ketergantungan & Paruh Waktu

| WO | Mulai saat | Blokir |
|---|---|---|
| WO-1 | segera | — |
| WO-2 | segera (paralel WO-1) | — |
| WO-3 | WO-2 selesai | WO-4, WO-5, WO-6 |
| WO-4 | WO-1 & WO-3 selesai | WO-5, WO-6 |
| WO-5 | WO-4 selesai | WO-7 |
| WO-6 | WO-3 & WO-4 selesai | WO-7 (parity) |
| WO-7 | WO-5 & WO-6 selesai | WO-8 |
| WO-8 | WO-7 selesai | — (akhir) |

Urutan kritikal: WO-2 → WO-3 → WO-4 → WO-5 → WO-7 → WO-8. WO-1 dapat dijalankan kapan pun di awal; WO-6 boleh paralel setelah WO-4 (asalkan WO-3 selesai).

---

## 11. Aturan Umum Semua WO

1. **Build hijau di akhir tiap WO** — `npm run lint` + `npm run build` wajib lulus sebelum WO dinyatakan selesai.
2. **Scope ketat** — hanya file yang terdaftar; cek `git status` sebelum & sesudah; jangan stage/commit file lain (working tree masih berisi WO-BR-99 + WO13).
3. **Rollback = revert commit WO** — karena tiap WO satu kesatuan kohesif, rollback dilakukan per WO, bukan per file.
4. **Tidak ada `mode`/`searchMode`/enum/switch** — ADR-018/019 adalah aturan keras.
5. **Perilaku produksi tidak boleh berubah** di luar yang dideklarasikan D2 (default Sprint 8).
6. **Kontrak output Engine stabil** — `MatchedWorkbook`/`FieldMatch`/`MatchStatus`/`MatchCandidate` bentuknya tetap (kecuali D4 disetujui, additive).
7. **Belum ada prompt implementasi / commit / test** sampai plan ini disetujui.

---

## 12. Keputusan yang Diminta dari Product Owner

1. **Setujui plan** ini sebagai baseline implementasi Sprint 8.
2. **D2**: default produksi = `ContainsAuthor` (bukan `ExactAuthor` dari contoh RFC Rev 2 §Q8) demi perilaku identik Sprint 8.
3. **D3**: pendekatan method transisi `findMatches` di WO-3, dihapus di WO-5. (Alternatif: gabung WO-3+WO-5 jadi satu WO — lebih besar tapi tanpa transisi; perlu konfirmasi.)
4. **D4**: `FieldMatch.strategy?` — setujui SKIP (default plan) atau sertakan additive di WO-5.
5. **Posisi smoke test**: folder `scripts/smoke/sprint8/` diterima, atau ikuti lokasi konvensi yang sudah ada di repo.

---

*Setelah dokumen ini selesai: BERHENTI. Belum ada implementasi. Menunggu persetujuan Product Owner.*
