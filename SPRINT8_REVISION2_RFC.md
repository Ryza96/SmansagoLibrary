# SPRINT8_REVISION2_RFC — Strategy Encapsulates Search Behavior (ADR-018) & Repository Operations Must Be Explicit (ADR-019)

**Status:** DRAFT — menunggu persetujuan Product Owner. **TIDAK ada implementasi / perubahan kode apa pun.**
**Menggantikan:** `SPRINT8_REVISION1_RFC.md` (DITOLAK — konsep `MatchCriterion` / `searchMode` / `mode` dihilangkan total).
**Referensi ADR:** ADR-010, ADR-011, ADR-012, ADR-013, ADR-014, ADR-018 (baru), ADR-019 (baru).

---

## 1. Analisis Desain (menjawab 10 pertanyaan)

### Q1. Apakah Strategy Interface masih tepat? Atau perlu generic?

**Tepat, sebagai kontrak polimorfik — dan TIDAK boleh menjadi generic berbasis mode.**

- Engine hanya perlu satu bentuk panggilan: `strategy.findMatches(value)`. Interface `MatchStrategy` tetap ada sebagai seam (Engine tidak boleh tahu Repository/Prisma — ADR-010, ADR-011).
- **Generic dalam arti "satu kelas yang dikonfigurasi mode" = DITOLAK**, karena itu menghidupkan kembali konsep `mode` yang sudah dibuang. Generic juga membunuh discoverability ("strategi apa yang ada untuk author?") dan type-safety per field.
- Yang boleh generic hanya **helper murni** (bukan behavior class): `normalizeForComparison()`, `dedupeById()`, `levenshteinRatio()` — fungsi tanpa state, dipakai bersama oleh strategi.
- Per-field literal dipertahankan: `AuthorMatchStrategy { field: 'authors' }`, `BookMatchStrategy { field: 'isbn' }`, dst. → kompilator menjamin strategi ISBN tidak pernah dipasang ke field author.

```ts
// src/shared/match-strategy.ts
import type { MatchCandidate } from './match-provider'

export interface MatchStrategy {
  readonly id: string
  readonly field: string
  readonly label: string
  readonly providerId: string          // id provider yang terikat — dipakai FieldMatch.provider
  findMatches(value: string): Promise<MatchCandidate[]>
}

export interface AuthorMatchStrategy extends MatchStrategy { readonly field: 'authors' }
export interface PublisherMatchStrategy extends MatchStrategy { readonly field: 'publisher' }
export interface CategoryMatchStrategy extends MatchStrategy { readonly field: 'category' }
export interface BookMatchStrategy extends MatchStrategy { readonly field: 'isbn' }
```

### Q2. Apakah Provider Interface masih tepat? Apakah Provider cukup menjadi adapter menuju Repository?

**Tepat — dan ya, Provider menjadi adapter murni.**

Provider tidak lagi menerima "cara mencari" (Rev 1) maupun "nilai + cara tersirat" (Sprint 8). Provider mengekspos **operasi eksplisit** yang memetakan 1:1 ke operasi eksplisit Repository, lalu mengubah hasil entity → `MatchCandidate[]`:

```ts
// src/shared/match-provider.ts
export interface MatchCandidate { id: string; label: string }

export interface MatchProvider {
  readonly id: string
  readonly field: string
  readonly label: string
}

// Operasi nama: identik untuk author/publisher/category (eksplisit, bukan switch)
export interface NamedMatchProvider extends MatchProvider {
  findExact(value: string): Promise<MatchCandidate[]>
  findContains(value: string): Promise<MatchCandidate[]>
  findPrefix(value: string): Promise<MatchCandidate[]>
  findAll(limit?: number): Promise<MatchCandidate[]>   // super-set untuk fuzzy
}

export interface AuthorMatchProvider extends NamedMatchProvider { readonly field: 'authors' }
export interface PublisherMatchProvider extends NamedMatchProvider { readonly field: 'publisher' }
export interface CategoryMatchProvider extends NamedMatchProvider { readonly field: 'category' }

// ISBN: hanya operasi yang bermakna untuk isbn — tidak ada findPrefix/findContains yang dipaksakan
export interface BookMatchProvider extends MatchProvider {
  readonly field: 'isbn'
  findByISBN(isbn: string): Promise<MatchCandidate[]>
  findAll(limit?: number): Promise<MatchCandidate[]>
}
```

Poin penting:
- `NamedMatchProvider` adalah interface bersama untuk 3 field nama karena **nama operasinya identik** — ini bukan pemilihan perilaku, melainkan penghindaran duplikasi. Setiap method tetap satu perilaku tetap.
- `BookMatchProvider` sengaja **lebih sempit** — memaksa `findPrefix`/`findContains` pada ISBN adalah kebisingan. Provider interface per field hanya mendeklarasikan apa yang masuk akal untuk field itu.
- Provider **tidak memutuskan apa pun**. `PrismaAuthorMatchProvider.findExact` = `AuthorRepository.findExact(name)` → map. Tidak ada logika scoring/alias/urutan di provider. (ADR-012: provider = infrastruktur; ADR-019: operasi eksplisit.)

### Q3. Bagaimana ExactAuthorStrategy bekerja? Langkah demi langkah.

```ts
class ExactAuthorStrategy implements AuthorMatchStrategy {
  readonly id = 'exact-author'
  readonly field = 'authors' as const
  readonly label = 'Exact Author'
  readonly providerId: string

  constructor(private readonly provider: AuthorMatchProvider) {
    this.providerId = provider.id
  }

  async findMatches(value: string): Promise<MatchCandidate[]> {
    return this.provider.findExact(value.trim())
  }
}
```

Langkah:
1. **Engine** membaca nilai canonical row untuk `field: 'authors'`; bila kosong → `SKIPPED` (logika status tetap di Engine).
2. Engine memanggil `ExactAuthorStrategy.findMatches("Andrea Hirata")`.
3. Strategy menormalkan ringan (`trim`; tanpa case-fold — case folding adalah urusan data source agar perilaku Dummy ≡ Prisma, lihat Q7).
4. Strategy memanggil `provider.findExact("Andrea Hirata")`.
5. `PrismaAuthorMatchProvider.findExact` → `AuthorRepository.findExact(name)` → `prisma.author.findMany({ where: { name: { equals: name } }, take: 10 })`.
6. Repository mengembalikan `Author[]`; provider memetakan → `MatchCandidate[]` (`{ id, label: name }`).
7. Strategy mengembalikan kandidat; Engine menurunkan status: 0 → `NOT_FOUND`, 1 → `FOUND`, >1 → `AMBIGUOUS`.

Catatan: `equals` di SQLite bersifat case-insensitive untuk ASCII → "andrea hirata" dan "Andrea Hirata" sama-sama cocok dengan "Andrea Hirata". Perilaku non-ASCII dicatat di §11 (deferred).

### Q4. Bagaimana ContainsAuthorStrategy bekerja?

Identik secara alur dengan Exact, bedanya hanya **operasi yang dipanggil**:

```ts
class ContainsAuthorStrategy implements AuthorMatchStrategy {
  // id = 'contains-author', field = 'authors', label = 'Contains Author'
  async findMatches(value: string): Promise<MatchCandidate[]> {
    return this.provider.findContains(value.trim())
  }
}
```

1. Engine → `ContainsAuthorStrategy.findMatches(value)`.
2. Strategy → `provider.findContains(value)`.
3. Provider → `AuthorRepository.findContains(name)` → `prisma.author.findMany({ where: { name: { contains: name } }, take: 10, orderBy: { name: 'asc' } })`.
4. Map → `MatchCandidate[]` → Engine hitung status.

**Ini mempertahankan persis perilaku Prisma Sprint 8** (yang selama ini memakai `findMany({ search })` → `contains`), tapi kini menjadi keputusan eksplisit sebuah kelas bernama `ContainsAuthorStrategy`, bukan keputusan tersembunyi.

### Q5. Bagaimana FuzzyAuthorStrategy bekerja? Tanpa mengubah Repository.

Fuzzy TIDAK butuh mode atau parameter query baru — ia memakai satu operasi eksplisit yang sudah ada (`findAll`) dan melakukan **penalaran di dalam Strategy** (murni, tanpa DB):

```ts
class FuzzyAuthorStrategy implements AuthorMatchStrategy {
  readonly id = 'fuzzy-author'
  readonly field = 'authors' as const
  readonly label = 'Fuzzy Author'

  constructor(
    private readonly provider: AuthorMatchProvider,
    private readonly options: { threshold?: number; limit?: number; scanLimit?: number } = {}
  ) {}

  async findMatches(value: string): Promise<MatchCandidate[]> {
    const needle = normalizeForComparison(value)
    const all = await this.provider.findAll(this.options.scanLimit ?? 500)

    return all
      .map(candidate => ({
        candidate,
        score: levenshteinRatio(needle, normalizeForComparison(candidate.label)),
      }))
      .filter(item => item.score >= (this.options.threshold ?? 0.8))
      .sort((a, b) => b.score - a.score)
      .slice(0, this.options.limit ?? 10)
      .map(item => item.candidate)
  }
}
```

Langkah:
1. Strategy menormalkan input ("andre hirt" → `normalizeForComparison` = trim + lowercase).
2. Strategy memanggil `provider.findAll(500)` → `AuthorRepository.findAll(500)` → `prisma.author.findMany({ take: 500, orderBy: { name: 'asc' } })` (operasi eksplisit, tanpa search).
3. Strategy menghitung skor kemiripan tiap kandidat (Levenshtein ratio — fungsi murni di `src/services/strategies/similarity.ts`).
4. Filter `score >= threshold` (0.8), urutkan menurun, potong ke limit (10).
5. Kembalikan `MatchCandidate[]`; Engine hitung status.

**Kenapa Repository tidak perlu berubah:** fuzzy tidak membutuhkan predikat baru — ia membaca super-set lalu menilai sendiri. Trade-off: pembacaan penuh (scanLimit 500) di memori — dapat diterima untuk skala katalog perpustakaan; FTS5 dicatat sebagai deferred (§12). `findAll()` sengaja melebihi limit default pagination (10) agar scan benar-benar mendapat super-set — lihat §9.

### Q6. Bagaimana AliasStrategy bekerja?

Alias murni data konfigurasi di dalam Strategy; memakai `findExact` yang sudah ada. Repository tidak berubah.

```ts
type AliasTable = Record<string, string[]>   // key ternormalisasi → ekspansi nama kanonik

class AliasAuthorStrategy implements AuthorMatchStrategy {
  readonly id = 'alias-author'
  readonly field = 'authors' as const
  readonly label = 'Alias Author'

  constructor(
    private readonly provider: AuthorMatchProvider,
    private readonly aliases: AliasTable
  ) {}

  async findMatches(value: string): Promise<MatchCandidate[]> {
    const key = normalizeForComparison(value)
    const expansions = this.aliases[key] ?? [value.trim()]

    const results = await Promise.all(
      expansions.map(expansion => this.provider.findExact(expansion))
    )
    return dedupeById(results.flat())
  }
}

// pemakaian di registry:
new AliasAuthorStrategy(provider, {
  'andre':   ['andrea hirata'],
  'pram':    ['pramoedya ananta toer'],
  'gramedia':['gramedia pustaka utama'],
})
```

Langkah: normalize input → cari di tabel alias → bila ada, expand ke nama kanonik → `findExact` per ekspansi (paralel) → union + dedupe → kembalikan. Bila tidak ada alias, fallback ke `findExact(value.trim())` (perilaku ExactStrategy).

### Q7. Bagaimana menjaga Dummy Provider tetap identik perilakunya dengan Prisma Provider?

**Syarat: Dummy meniru semantik SQLite, dan kedua sisi memakai class Strategy yang SAMA.**

1. **Strategi yang sama.** `dummyMatchStrategies` dan `createProductionStrategies()` memakai class yang sama (`ExactBookStrategy`, `ContainsAuthorStrategy`, dst.) — bedanya hanya provider yang disuntikkan.
2. **Dummy provider mengimplementasikan operasi eksplisit yang sama**, dengan semantik meniru SQLite `LIKE`/`=` (case-insensitive ASCII):
   - `findExact(v)` → `record.label.toLowerCase() === v.toLowerCase()` (≈ SQLite `=` ASCII)
   - `findContains(v)` → `record.label.toLowerCase().includes(v.toLowerCase())` (≈ `LIKE '%v%'`)
   - `findPrefix(v)` → `record.label.toLowerCase().startsWith(v.toLowerCase())` (≈ `LIKE 'v%'`)
   - `findAll(limit)` → seluruh record (urutan sama)
   - `findByISBN(i)` → normalisasi ISBN, lookup map
3. **Data uji Dummy tetap sama** (Andrea Hirata, Pramoedya Ananta Toer, ISBN 9789793062792, AMBIGUOUS 9781234567890 ×2, Gramedia Pustaka Utama, Bentang Pustaka, Fiksi, Sejarah). ID kandidat (`author-*`, `isbn-*`, dst.) tidak berubah.

Konsekuensi yang harus diverifikasi: Sprint 7/8 menguji Dummy dengan semantik **exact**; setelah revisi, default author/publisher/category menjadi **contains** (agar identik dengan Prisma). Input uji seperti `'andrea hirata'`, `'gramedia'`, `'bentang pustaka'` tetap `FOUND` karena substring. Uji yang menggunakan input ambigu menjadi lebih realistis (mis. `'a'` → AMBIGUOUS). Seluruh smoke test dijalankan ulang di Phase 3 (§11) dan hasil status dibandingkan test-by-test.

Batasan jujur: `toLowerCase()` JS mendekati (tidak persis) case-insensitivity ASCII SQLite untuk nama Latin; untuk non-ASCII dicatat sebagai deferred (§12).

### Q8. Bagaimana registry Strategy nantinya? Apakah fleksibel?

```ts
// src/main/strategies/index.ts — komposisi di tepi (edge), bukan logika inti
export function createProductionStrategies(): MatchStrategy[] {
  const book     = new PrismaBookMatchProvider(new BookRepository())
  const author   = new PrismaAuthorMatchProvider(new AuthorRepository())
  const publisher= new PrismaPublisherMatchProvider(new PublisherRepository())
  const category = new PrismaCategoryMatchProvider(new CategoryRepository())

  return [
    new ExactBookStrategy(book),                       // ISBN → exact
    new ExactAuthorStrategy(author),                   // Author → exact (default)
    new ContainsPublisherStrategy(publisher),          // Publisher → contains (default)
    new ContainsCategoryStrategy(category),            // Category → contains (default)
  ]
}
```

**Ya, fleksibel — karena strategi adalah komposisi, bukan switch.**
- Pilihan per field **independen**: ubah perilaku author ke fuzzy cukup ganti satu baris: `new FuzzyAuthorStrategy(author)`.
- Provider dapat di-reuse: `new ContainsAuthorStrategy(author)` dan `new AliasAuthorStrategy(author, aliases)` boleh hidup bersamaan.
- Alias/Fuzzy mengangkut konfigurasi (tabel alias, threshold) tanpa menyentuh Engine/Provider/Repository.
- Tabel yang diminta PO (Author→ExactAuthorStrategy, Category→ContainsCategoryStrategy, ISBN→ExactBookStrategy) tercapai langsung; struktur registry sama untuk kombinasi lain.
- Catatan desain: registry produksi **satu strategi per field** (Engine memproduksi satu `FieldMatch` per field). Bila kelak dibutuhkan multi-strategi per field (mis. Exact + Fuzzy digabung), itu perubahan terpisah di Engine — ditandai sebagai deferred.

### Q9. Apakah desain ini memenuhi ADR-010 s.d. ADR-014 + ADR-018 + ADR-019?

| ADR | Isi | Status desain |
|---|---|---|
| ADR-010 | Matching Engine pure | ✓ Engine hanya memanggil `strategy.findMatches(value)` + hitung status dari jumlah kandidat; tanpa DB/Prisma/Repository. |
| ADR-011 | Matching bergantung pada providers | ✓ Engine bergantung pada `MatchStrategy` yang terikat ke `MatchProvider`. |
| ADR-012 | Providers adalah infrastruktur | ✓ Provider di `src/main/providers/`, bergantung ke Repository; Strategy & Engine tidak melihat Repository. |
| ADR-013 | Strategy terpisah dari Provider | ✓ Diperkuat: strategy **adalah** perilaku (ADR-018), provider adalah adapter bisu. Terpisah file, terpisah tanggung jawab. |
| ADR-014 | Provider memakai Repository | ✓ Setiap operasi provider memanggil satu operasi eksplisit repository. |
| ADR-018 | Strategy meng-enkapsulasi perilaku pencarian | ✓ `ExactAuthorStrategy`/`ContainsAuthorStrategy`/`PrefixAuthorStrategy`/`AliasAuthorStrategy`/`FuzzyAuthorStrategy` = class terpisah. **Tidak ada** `mode`, `searchMode`, `switch(mode)`, `enum`. |
| ADR-019 | Operasi Repository eksplisit | ✓ `findExact`/`findContains`/`findPrefix`/`findAll`/`findByISBN`; **tidak ada** `findMany(searchMode)`. |

Tidak ada pelanggaran. Satu hal yang perlu dijaga saat implementasi: Repository mempertahankan operasi lamanya (`findMany`, `findById`, `count`, `existsBy*`) untuk UI — operasi baru **ditambah**, bukan mengubah perilaku yang ada.

### Q10. Apakah Sprint 9 menjadi lebih sederhana atau lebih kompleks?

**Lebih sederhana untuk Sprint 9.**

- **Kontrak output tidak berubah:** `MatchedWorkbook` / `MatchedRow` / `FieldMatch` / `MatchStatus` / `MatchCandidate` tetap. Pipeline Sprint 9 (parse → validate → match → commit) hanya membaca bentuk ini.
- **Pemilihan perilaku = 1 baris di registry.** Sprint 9 tinggal memanggil `createProductionStrategies()`; menukar `ContainsAuthorStrategy` → `FuzzyAuthorStrategy` tidak menyentuh pipeline.
- **Kompleksitas** bertambah hanya di dalam domain matching itu sendiri (lebih banyak class). Itu justru tujuan ADR-018: biaya eksplisit di satu tempat, keuntungan stabilitas di tempat lain. Sprint 9 tidak perlu tahu apa pun tentang Strategy/Provider/Repository.

---

## 2. Perbandingan RFC Revision 1 vs Revision 2

| Aspek | RFC Rev 1 (DITOLAK) | RFC Rev 2 (diajukan) |
|---|---|---|
| Keputusan "cara mencari" | Diwakili `MatchCriterion { value, mode, limit }` | **Tidak ada criterion.** Ada class per perilaku. |
| Mode pencarian | `mode: 'exact'\|'prefix'\|'contains'\|'fuzzy'` (enum) | **Dihilangkan total.** |
| Repository | `FindOptions.searchMode` (parameter mengubah perilaku) | Operasi eksplisit: `findExact`, `findContains`, `findPrefix`, `findAll`, `findByISBN`. |
| Dispatch | Strategy membangun criterion → provider/`switch(mode)` di dalam repository | Strategi = perilaku itu sendiri; provider memanggil satu operasi bernama. |
| Strategy | Satu interface + parameter mode | Satu interface sebagai kontrak; **kelas konkret per field×perilaku** (ExactAuthorStrategy, ContainsCategoryStrategy, …). |
| Provider | Mengeksekusi criterion (masih tahu mode) | Adapter bisu: tiap method → satu operasi repository → `MatchCandidate[]`. |
| Perilaku Dummy vs Prisma | Harus ditegakkan lewat mode yang sama | Dijamin: class Strategy sama + Dummy meniru semantik SQLite. |
| Skor/fuzzy | Fuzzy menyaring di Strategy (sudah) | Sama, kini tanpa `mode: 'fuzzy'` — memakai `findAll()` eksplisit. |
| ADR baru | — | ADR-018 (Strategy = perilaku), ADR-019 (Repository eksplisit). |

Ringkas: Rev 1 **menyeragamkan melalui parameter** (satu interface + mode). Rev 2 **menyeragamkan melalui struktur** (banyak class + nama operasi eksplisit). Keduanya menyelesaikan masalah "strategi ter-baking-in di provider", tetapi Rev 2 melakukannya tanpa konsep mode.

---

## 3. Diagram Sebelum (Sprint 8 — kondisi saat ini)

```
MatchingEngineService.match()
   │
   ├─ DummyIsbnMatchProvider      → lookup exact (memory)                 [field isbn]
   ├─ DummyAuthorMatchProvider    → lookup exact (memory)                 [field authors]
   ├─ DummyPublisherMatchProvider → lookup exact (memory)                 [field publisher]
   ├─ DummyCategoryMatchProvider  → lookup exact (memory)                 [field category]
   │
   └─ (produksi) Prisma*MatchProvider.findMatches(value)   ← nilai + cara tersirat
        ├─ PrismaBookMatchProvider     → BookRepository.findByISBN(isbn)      (exact)
        ├─ PrismaAuthorMatchProvider   → AuthorRepository.findMany({search})  (contains, diam-diam)
        ├─ PrismaPublisherMatchProvider→ PublisherRepository.findMany({search}) (contains, diam-diam)
        └─ PrismaCategoryMatchProvider → CategoryRepository.findMany({search}) (contains, diam-diam)
                                              │
                                              └── FindOptions.search → { name: { contains } } (hardcode)
```

Masalah: keputusan "exact vs contains" tersebar di implementasi provider dan terkunci di repository.

---

## 4. Diagram Sesudah (Rev 2)

```
MatchingEngineService.match()
   │  strategy.findMatches(value)  →  hitung status (FOUND/NOT_FOUND/AMBIGUOUS/SKIPPED)
   │
   ├─ ExactBookStrategy            → BookMatchProvider.findByISBN(isbn)
   ├─ ExactAuthorStrategy          → AuthorMatchProvider.findExact(name)
   ├─ ContainsPublisherStrategy    → PublisherMatchProvider.findContains(name)
   ├─ ContainsCategoryStrategy     → CategoryMatchProvider.findContains(name)
   ├─ PrefixAuthorStrategy         → AuthorMatchProvider.findPrefix(name)
   ├─ AliasAuthorStrategy          → (expansi alias) → AuthorMatchProvider.findExact(…)
   └─ FuzzyAuthorStrategy          → AuthorMatchProvider.findAll(500) → skor Levenshtein di Strategy
                                         │
                                         ▼
                              (Dummy*Provider | Prisma*Provider)
                                         │  adapter murni: entity → MatchCandidate[]
                                         ▼
                              AuthorRepository / PublisherRepository / CategoryRepository / BookRepository
                                         │  operasi eksplisit: findExact / findContains / findPrefix / findAll / findByISBN
                                         ▼
                                     Prisma (SQLite)
```

Perilaku pencarian kini **diputuskan oleh class Strategy**; Provider & Repository murni mekanis.

---

## 5. Class Diagram

```
┌────────────────────────────── src/shared ───────────────────────────────┐
│  match-provider.ts                                                     │
│    MatchCandidate { id: string; label: string }                        │
│    interface MatchProvider { id; field; label }                        │
│    interface NamedMatchProvider extends MatchProvider {                │
│      findExact; findContains; findPrefix; findAll(limit?) }            │
│    AuthorMatchProvider │ PublisherMatchProvider │ CategoryMatchProvider│
│      (extends NamedMatchProvider, field literal)                       │
│    BookMatchProvider extends MatchProvider { findByISBN; findAll }     │
│                                                                        │
│  match-strategy.ts                                                     │
│    interface MatchStrategy { id; field; label; providerId;             │
│      findMatches(value): Promise<MatchCandidate[]> }                   │
│    AuthorMatchStrategy │ PublisherMatchStrategy │                      │
│    CategoryMatchStrategy │ BookMatchStrategy (field literal)           │
└────────────────────────────────────────────────────────────────────────┘

┌───────────────────────── src/services/strategies ───────────────────────┐
│  ExactAuthorStrategy ──implements──▶ AuthorMatchStrategy                │
│  ContainsAuthorStrategy ──▶ AuthorMatchStrategy                         │
│  PrefixAuthorStrategy ──▶ AuthorMatchStrategy                           │
│  AliasAuthorStrategy (aliases) ──▶ AuthorMatchStrategy                  │
│  FuzzyAuthorStrategy (threshold, limit, scanLimit) ──▶ AuthorMatchStrategy
│  ExactBookStrategy ──▶ BookMatchStrategy                                │
│  ContainsPublisherStrategy ──▶ PublisherMatchStrategy                   │
│  ContainsCategoryStrategy ──▶ CategoryMatchStrategy                     │
│  similarity.ts (murni): levenshteinRatio(), normalizeForComparison()    │
│  dedupe.ts (murni): dedupeById()                                        │
│  (semua strategy: constructor(provider) — pure, testable tanpa DB)      │
└─────────────────────────────────────────────────────────────────────────┘

┌───────────────────────── src/services (data uji) ───────────────────────┐
│  DummyMatchProviders.ts: DummyIsbnMatchProvider, DummyAuthorMatchProvider,
│    DummyPublisherMatchProvider, DummyCategoryMatchProvider              │
│    (implements shared interfaces; meniru semantik SQLite)               │
│  DummyMatchStrategies.ts: dummyMatchStrategies =                       │
│    [ExactBook(dummyIsbn), ContainsAuthor(dummyAuthor),                 │
│     ContainsPublisher(dummyPublisher), ContainsCategory(dummyCategory)] │
└─────────────────────────────────────────────────────────────────────────┘

┌───────────────────────── src/main/providers ────────────────────────────┐
│  PrismaAuthorMatchProvider ──▶ AuthorRepository (findExact/findContains/│
│    findPrefix/findAll) — entity → MatchCandidate[]                      │
│  PrismaPublisherMatchProvider ──▶ PublisherRepository                  │
│  PrismaCategoryMatchProvider ──▶ CategoryRepository                    │
│  PrismaBookMatchProvider ──▶ BookRepository (findByISBN/findAll)        │
└─────────────────────────────────────────────────────────────────────────┘

┌───────────────────────── src/main/repositories ─────────────────────────┐
│  AuthorRepository │ PublisherRepository │ CategoryRepository            │
│    findExact(name) │ findContains(name) │ findPrefix(name) │            │
│    findAll(limit)  │ (+ findMany/findById/existsBy*/count untuk UI)     │
│  BookRepository: findByISBN(isbn) │ findAll(limit) │ (+ findMany dst.)  │
└─────────────────────────────────────────────────────────────────────────┘

┌───────────────────────── src/main/strategies ───────────────────────────┐
│  index.ts: createProductionStrategies(): MatchStrategy[]                │
│    = [ExactBook, ExactAuthor, ContainsPublisher, ContainsCategory]      │
└─────────────────────────────────────────────────────────────────────────┘

┌───────────────────────── src/services ──────────────────────────────────┐
│  MatchingEngineService(strategies = dummyMatchStrategies)               │
│    match(validatedWorkbook): MatchedWorkbook  (kontrak output tetap)    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Sequence Diagram — Exact Match

```
MatchingEngineService        ExactAuthorStrategy       PrismaAuthorMatchProvider     AuthorRepository         Prisma
      │ findMatches("Andrea Hirata")                           │                          │                      │
      │───────────────────────────────────────────────────────▶│                          │                      │
      │                          │  findExact("Andrea Hirata") │                          │                      │
      │                          │────────────────────────────▶│                          │                      │
      │                          │                             │  findExact(name)          │                      │
      │                          │                             │─────────────────────────▶│                      │
      │                          │                             │                          │  author.findMany     │
      │                          │                             │                          │  { name: { equals } }│
      │                          │                             │                          │  take: 10            │
      │                          │                             │                          │────────────────────▶│
      │                          │                             │                          │◀──── Author[] ───────│
      │                          │                             │◀──────── Author[] ────────│                      │
      │                          │◀── MatchCandidate[] ────────│  (entity → MatchCandidate)│                      │
      │◀── MatchCandidate[] ─────│                             │                          │                      │
      │ status = FOUND (1 kandidat)                            │                          │                      │
      │ (0 → NOT_FOUND, >1 → AMBIGUOUS)                        │                          │                      │
```

---

## 7. Sequence Diagram — Fuzzy Match

```
MatchingEngineService         FuzzyAuthorStrategy        PrismaAuthorMatchProvider      AuthorRepository         Prisma
      │ findMatches("andre hirt")                            │                          │                      │
      │─────────────────────────────────────────────────────▶│                          │                      │
      │                          │  findAll(500)             │                          │                      │
      │                          │──────────────────────────▶│                          │                      │
      │                          │                           │  findAll(500)            │                      │
      │                          │                           │─────────────────────────▶│                      │
      │                          │                           │                          │  author.findMany     │
      │                          │                           │                          │  take: 500           │
      │                          │                           │                          │  orderBy: name asc   │
      │                          │                           │                          │────────────────────▶│
      │                          │                           │                          │◀──── Author[] ───────│
      │                          │                           │◀──────── Author[] ────────│                      │
      │  skor: levenshteinRatio(normalize(input), normalize(label))                       │                      │
      │  filter score >= 0.8 · sort desc · slice 10           │                          │                      │
      │◀── MatchCandidate[] ─────│                           │                          │                      │
      │ status = FOUND          │                           │                          │                      │
      │ (0 → NOT_FOUND, >1 → AMBIGUOUS)                      │                          │                      │
```

Tidak ada panggilan predikat baru ke Repository — fuzzy membaca super-set eksplisit lalu menilai di Strategy.

---

## 8. Dampak terhadap Provider

| Berubah? | Detail |
|---|---|
| Interface | Ya. Dari `findMatches(value)` (nilai + cara tersirat) menjadi **operasi eksplisit** `findExact/findContains/findPrefix/findAll/findByISBN` (per-field; Book lebih sempit). |
| Peran | Provider menjadi **adapter bisu**: 1 method ↔ 1 repository method, hasil entity → `MatchCandidate[]`. Tidak ada logika keputusan. |
| `Prisma*MatchProvider` | `findMatches(value)` diganti method eksplisit; `findMany({ search })` diganti `findExact/findContains/findPrefix`; `findAll` menambah `findMany({ take: limit })`. |
| `Dummy*Provider` | Ditulis ulang mengimplementasikan operasi eksplisit yang sama dengan semantik meniru SQLite (Q7). Data uji & ID kandidat tetap. |
| `id/field/label` | Dipertahankan. `FieldMatch.provider` diisi dari `strategy.providerId` (id provider terikat). |
| Letak | Tetap: Dummy di `src/services/`, Prisma di `src/main/providers/`. |

## 9. Dampak terhadap Repository

| Berubah? | Detail |
|---|---|
| Parameter perilaku | **Tidak ada.** `FindOptions.searchMode` dari Rev 1 **dibuang**. Tidak ada `findMany(searchMode)`. |
| Operasi baru (dengan nama eksplisit) | `AuthorRepository`/`PublisherRepository`/`CategoryRepository`: `findExact(name)` → `{ name: { equals } }`, `findContains(name)` → `{ name: { contains } }`, `findPrefix(name)` → `{ name: { startsWith } }`, `findAll(limit = 500)` → `findMany({ take: limit, orderBy: { name: 'asc' } })`. `BookRepository`: tambah `findAll(limit = 500)`; `findByISBN` **tetap**. |
| Operasi lama | `findMany` (dengan `search` untuk UI), `findById`, `existsBy*`, `count` **dipertahankan** — penambahan tidak mengubah perilaku yang ada. |
| Catatan pagination | `findAll` sengaja **melewati** limit default 10 (`getPaginationParams`) karena berfungsi sebagai super-set fuzzy; ini jebakan yang harus dieksplisitkan saat implementasi. |
| Lokasi tipe | `FindOptions` tidak berubah (kecuali opsional tambahan bila nanti dibutuhkan untuk UI). |

## 10. Dampak terhadap Matching Engine

| Aspek | Detail |
|---|---|
| Konsumen | Constructor berubah: `new MatchingEngineService(strategies: readonly MatchStrategy[] = dummyMatchStrategies)`. |
| `matchRow` | Memanggil `strategy.findMatches(value)`; nilai kosong → `SKIPPED`; status dari jumlah kandidat (`0/1/>1`). Logika status **tidak berubah**. |
| Output | `MatchedWorkbook` / `MatchedRow` / `FieldMatch` / `MatchStatus` / `MatchCandidate` **identik**. `FieldMatch.provider` = `strategy.providerId`. Usulan opsional: tambah `FieldMatch.strategy?: string` (additive, non-breaking) agar konsumen tahu perilaku yang dipakai — **keputusan PO**. |
| Purity | Engine tetap tanpa import Prisma/Repository. Default tanpa argumen tetap jalan (Dummy). |
| File | `MatchingEngineService.ts` berubah kecil (provider→strategy); `MatchProviders.ts` (re-export) tetap sebagai konvensi, ditambah `match-strategy.ts` di shared. |

---

## 11. Risiko Migrasi

| Risiko | Level | Mitigasi |
|---|---|---|
| Ubah SPI Provider + tambah operasi Repository | Sedang | Migrasi satu PR; smoke test Sprint 6/7/8 (18+25+16) dijalankan ulang; kontrak output Engine tidak berubah. |
| Perubahan perilaku Dummy (exact → contains untuk nama) | Sedang | Input uji yang ada tetap FOUND (substring). Bandingkan status test-by-test di Phase 3; ubah ekspektasi test HANYA bila memang intent (dummy kini = prisma). |
| SQLite case-insensitivity hanya ASCII | Sedang | Dummy meniru dengan `toLowerCase()`; non-ASCII & `lower()` kolom dicatat deferred. |
| Fuzzy scan 500 baris di memori | Rendah | Dapat diterima untuk katalog perpustakaan; FTS5 deferred. |
| Lupa `findAll` melewati limit 10 | Rendah | Eksplisit di kode + test fuzzy memakai katalog >10 nama. |
| Konsumen tak terduga (IPC/preload/UI) | Tidak ada | Grep terverifikasi: engine & `createPrismaMatchProviders` hanya dipakai smoke test. |
| `FieldMatch.provider` berubah makna | Rendah | Tetap id provider (via `strategy.providerId`); jika PO setuju, `FieldMatch.strategy` ditambahkan additive. |

**Fase implementasi (setelah approval — RFC ini TIDAK mengimplementasikan):**
- **Phase 1 — SPI & Strategi (tanpa sentuh Prisma):** `match-strategy.ts`, ulang `match-provider.ts` (operasi eksplisit), `strategies/` (Exact/Contains/Prefix/Alias/Fuzzy + helper murni), tulis ulang `DummyMatchProviders.ts`, buat `DummyMatchStrategies.ts`, update Engine → strategy. Smoke Sprint 6/7 tetap hijau (Dummy, tanpa DB).
- **Phase 2 — Repository & Prisma:** tambah operasi eksplisit 4 repository; ubah 4 `Prisma*MatchProvider`; `createProductionStrategies()` di `src/main/strategies/`. Smoke Sprint 8 (DB) dijalankan ulang.
- **Phase 3 — Verifikasi & laporan:** semua smoke test + kasus baru (tiap operasi, alias, fuzzy threshold/limit, kesetaraan Dummy≡Prisma untuk input sama); `npm run lint`; `npm run build`; targeted eslint; tulis `SPRINT8_REVISION2_REPORT.md`.

---

## 12. Rekomendasi Akhir

1. **Setujui ADR-018 & ADR-019** sebagai dasar desain Rev 2.
2. **Setujui arsitektur:** Engine → Strategy (class per perilaku) → Provider (adapter bisu) → Repository (operasi eksplisit) → Prisma.
3. **Setujui default produksi** di `createProductionStrategies()`: `ExactBookStrategy` (ISBN), `ExactAuthorStrategy`, `ContainsPublisherStrategy`, `ContainsCategoryStrategy` — perilaku produksi identik dengan Sprint 8 (author/publisher/category tetap `contains`, ISBN tetap exact), kini diekspresikan eksplisit.
4. **Keputusan opsional:** tambah `FieldMatch.strategy?: string` (additive) untuk observability.

**Deferred (di luar scope revisi ini):** FTS5 untuk fuzzy skala besar; normalisasi non-ASCII (`lower()` kolom); multi-strategi per field di Engine.

---

*Setelah RFC ini selesai: BERHENTI. Tidak ada implementasi apa pun. Menunggu persetujuan Product Owner.*
