# SPRINT8_REVISION3_RFC — Behavior Composition Over Cartesian Explosion (ADR-020) & Field Owns Provider, Strategy Owns Behavior (ADR-021)

**Status:** DRAFT — menunggu persetujuan Product Owner. **TIDAK ada implementasi / perubahan kode apa pun.**
**Menggantikan:** `SPRINT8_REVISION1_RFC.md` (DITOLAK — konsep `mode`) dan melanjutkan `SPRINT8_REVISION2_RFC.md` (hampir disetujui; dikoreksi karena Cartesian Explosion).
**Referensi ADR:** ADR-010, ADR-011, ADR-012, ADR-013, ADR-014, ADR-018, ADR-019, ADR-020 (baru), ADR-021 (baru).

---

## 1. Analisis Masalah Baru & Desain (menjawab 10 pertanyaan)

### Masalah baru yang dipecahkan

Rev 2 membuat class **per field × per perilaku** (`ExactAuthorStrategy`, `ContainsPublisherStrategy`, dst.). Dengan `N` field dan `M` perilaku, jumlah class strategi membengkak secara **perkalian** (O(N×M)). Setiap entity baru (Subject, Language, Location, Supplier, Member) berpotensi menambah class baru per perilaku yang dipakai — **Cartesian Explosion**.

Rev 3 memisahkan dua tanggung jawab yang di Rev 2 tercampur di nama class:

- **ADR-020 — Behavior Composition Over Cartesian Explosion:** Strategy mewakili **perilaku** saja: `ExactStrategy`, `ContainsStrategy`, `PrefixStrategy`, `AliasStrategy`, `FuzzyStrategy`. Bukan kombinasi `Field + Behavior`.
- **ADR-021 — Field Owns Provider, Strategy Owns Behavior:** Field menentukan Provider/Repository/Entity (di registry). Strategy menentukan **cara matching** (di class). Strategy tidak mengenal Author/Publisher/Category/Book — ia hanya tahu "bagaimana melakukan exact/contains/fuzzy".

Kunci yang membuat ini mungkin: **Provider mengekspos kosakata operasi perilaku yang seragam dan entity-agnostic** (`findExact`/`findContains`/`findPrefix`/`findAll` — seluruhnya eksplisit, satu perilaku per method, sesuai ADR-019). Strategy hanya butuh kosakata itu; ia tidak perlu tahu entity mana yang berada di balik provider.

### Q1. Apakah Strategy benar-benar dapat dibuat generic berdasarkan behavior?

**Ya — karena ada kontrak bersama: Provider.**

Semua provider mengimplementasikan kosakata operasi yang sama bentuknya:

```ts
findExact(value: string): Promise<MatchCandidate[]>      // entity: name equals / isbn equals
findContains(value: string): Promise<MatchCandidate[]>
findPrefix(value: string): Promise<MatchCandidate[]>
findAll(limit?: number): Promise<MatchCandidate[]>       // super-set untuk fuzzy
```

Strategy hanya melihat kontrak ini + `MatchCandidate { id, label }`. Ia tidak pernah menyentuh tipe entity (`Author`, `Book`, `Category`). Karena bentuk panggilannya identik untuk semua entity, perilaku yang sama (exact/contains/…) dapat ditulis **sekali** dan dipasangkan ke provider mana pun.

Poin penting: **generic di sini = perilaku yang diparametrikan provider**, bukan perilaku yang diparametrikan mode. `mode` tetap tidak ada. Method tetap bernama eksplisit.

```ts
// src/shared/match-strategy.ts
import type { MatchCandidate } from './match-provider'

export interface MatchStrategy {
  readonly id: string            // 'exact' | 'contains' | 'prefix' | 'alias' | 'fuzzy'
  readonly label: string         // 'Exact Match', 'Contains Match', ...
  readonly providerId: string    // id provider terikat — dipakai FieldMatch.provider
  findMatches(value: string): Promise<MatchCandidate[]>
}

// Field TIDAK ada di Strategy — field dimiliki Binding (registry).
// Binding = satuan yang dikonsumsi Engine.
export interface MatchBinding {
  readonly field: string
  readonly strategy: MatchStrategy
}
```

### Q2. Bagaimana ExactStrategy bekerja dengan AuthorProvider / BookProvider / CategoryProvider tanpa mengenal entity?

```ts
// src/services/strategies/ExactStrategy.ts
export class ExactStrategy implements MatchStrategy {
  readonly id = 'exact'
  readonly label = 'Exact Match'
  readonly providerId: string

  constructor(private readonly provider: MatchProvider) {
    this.providerId = provider.id
  }

  async findMatches(value: string): Promise<MatchCandidate[]> {
    return this.provider.findExact(value.trim())
  }
}
```

Alur untuk tiga pemasangan yang berbeda — **satu class yang sama**:

| Strategy (sama) | Provider | Operasi repository yang dipicu | Arti "exact" |
|---|---|---|---|
| `ExactStrategy` | `PrismaAuthorMatchProvider` | `AuthorRepository.findExact(name)` → `{ name: { equals } }` | nama persis |
| `ExactStrategy` | `PrismaBookMatchProvider` | `BookRepository.findByISBN(isbn)` → `findUnique` | ISBN persis |
| `ExactStrategy` | `PrismaCategoryMatchProvider` | `CategoryRepository.findExact(name)` → `{ name: { equals } }` | nama persis |

ExactStrategy **tidak tahu** ia sedang membandingkan nama atau ISBN — ia memanggil `provider.findExact(value)` dan menyerahkan arti "exact" kepada provider. Provider yang tahu entity-nya. Ini persis ADR-021: **strategy = cara**, **provider = data**.

### Q3. Bagaimana FuzzyStrategy bekerja terhadap Provider yang berbeda?

```ts
// src/services/strategies/FuzzyStrategy.ts
export class FuzzyStrategy implements MatchStrategy {
  readonly id = 'fuzzy'
  readonly label = 'Fuzzy Match'
  readonly providerId: string

  constructor(
    private readonly provider: MatchProvider,
    private readonly options: { threshold?: number; limit?: number; scanLimit?: number } = {}
  ) {
    this.providerId = provider.id
  }

  async findMatches(value: string): Promise<MatchCandidate[]> {
    const needle = normalizeForComparison(value)
    const all = await this.provider.findAll(this.options.scanLimit ?? 500)

    return all
      .map(c => ({ c, score: levenshteinRatio(needle, normalizeForComparison(c.label)) }))
      .filter(x => x.score >= (this.options.threshold ?? 0.8))
      .sort((a, b) => b.score - a.score)
      .slice(0, this.options.limit ?? 10)
      .map(x => x.c)
  }
}
```

Bekerja terhadap provider mana pun yang mengimplementasikan `findAll`:
- Dengan `PrismaAuthorMatchProvider` → memindai semua author, menilai skor terhadap `label` (nama).
- Dengan `PrismaCategoryMatchProvider` → memindai semua category, menilai dengan logika yang sama.
- Dengan `PrismaBookMatchProvider` → memindai buku, membandingkan `label` (judul).

Seluruh penalaran (normalisasi, Levenshtein ratio, filter threshold, sort, slice) ada di **satu** class; repository **tidak berubah** (memakai operasi eksplisit `findAll`). Threshold/limit dapat di-set per instance bila satu field butuh tuning berbeda dari field lain.

### Q4. Apakah Provider Interface perlu disederhanakan lagi?

**Ya — ini penyederhanaan terbesar Rev 3.** Rev 2 punya beberapa interface provider per field (`AuthorMatchProvider` dengan operasi nama, `BookMatchProvider` yang lebih sempit). Rev 3 memampatkan menjadi **satu interface seragam**:

```ts
// src/shared/match-provider.ts
export interface MatchCandidate { id: string; label: string }

export interface MatchProvider {
  readonly id: string
  readonly label: string

  findExact(value: string): Promise<MatchCandidate[]>
  findContains(value: string): Promise<MatchCandidate[]>
  findPrefix(value: string): Promise<MatchCandidate[]>
  findAll(limit?: number): Promise<MatchCandidate[]>
}
```

- Satu interface, tanpa varian per field. Setiap provider (Author/Publisher/Category/Book/Subject/dst.) mengimplementasikan kosakata yang sama terhadap repository-nya.
- `field` **keluar** dari provider — field dimiliki binding (ADR-021).
- `PrismaBookMatchProvider.findByISBN` (Rev 2) melebur menjadi `findExact` → `repository.findByISBN` (semantik "exact untuk ISBN").
- Provider tetap **adapter bisu**: setiap method memanggil satu operasi repository eksplisit dan memetakan entity → `MatchCandidate[]`.

### Q5. Apakah Repository Interface tetap eksplisit?

**Ya — tidak berubah dari Rev 2 (ADR-019 dipertahankan utuh).**

```ts
AuthorRepository / PublisherRepository / CategoryRepository:
  findExact(name)      → prisma.{entity}.findMany({ where: { name: { equals: name } } })
  findContains(name)   → prisma.{entity}.findMany({ where: { name: { contains: name } } })
  findPrefix(name)     → prisma.{entity}.findMany({ where: { name: { startsWith: name } } })
  findAll(limit = 500) → prisma.{entity}.findMany({ take: limit, orderBy: { name: 'asc' } })
  (+ operasi lama untuk UI: findMany/findById/existsBy*/count — dipertahankan)

BookRepository:
  findByISBN(isbn)     → prisma.book.findUnique({ where: { isbn } })   (tetap)
  findAll(limit = 500) → prisma.book.findMany({ take: limit })
  (+ operasi lama — dipertahankan)
```

Tidak ada `searchMode`, tidak ada parameter yang mengubah perilaku, tidak ada `switch`. `findAll` sengaja melewati limit default pagination (10) sebagai super-set fuzzy.

### Q6. Bagaimana registry nantinya? Apakah cukup fleksibel?

```ts
// src/main/strategies/index.ts
export function createProductionBindings(): MatchBinding[] {
  const book     = new PrismaBookMatchProvider(new BookRepository())
  const author   = new PrismaAuthorMatchProvider(new AuthorRepository())
  const publisher= new PrismaPublisherMatchProvider(new PublisherRepository())
  const category = new PrismaCategoryMatchProvider(new CategoryRepository())

  return [
    { field: 'isbn',     strategy: new ExactStrategy(book) },
    { field: 'authors',  strategy: new ExactStrategy(author) },
    { field: 'publisher',strategy: new ContainsStrategy(publisher) },
    { field: 'category', strategy: new ContainsStrategy(category) },
  ]
}
```

Tabel PO tercapai langsung:

```
Author    → ExactStrategy
Publisher → ContainsStrategy
ISBN      → ExactStrategy
```

**Ya, fleksibel — karena registry adalah data (komposisi), bukan switch:**
- Ganti perilaku satu field = ubah **satu baris**: `{ field: 'authors', strategy: new FuzzyStrategy(author) }`.
- Tambah field = tambah provider + **satu baris binding**.
- Tambah perilaku = tambah **satu class Strategy** (+ operasi provider/repository bila kosakatanya belum ada).
- Instance yang sama dipakai dua field berbeda diperbolehkan (masing-masing instance terikat provider sendiri): `new ExactStrategy(book)` dan `new ExactStrategy(author)`.
- Konfigurasi per-instance (alias table, threshold) ikut dalam baris binding — tanpa menyentuh Engine.

### Q7. Bagaimana jika muncul entity baru: Subject, Language, Location, Supplier, Member?

**Cukup menambah Provider + 1 baris binding. Tanpa membuat Strategy baru.**

Contoh entity baru `Subject`:
1. `SubjectRepository` — implementasi operasi eksplisit (`findExact`/`findContains`/`findPrefix`/`findAll`) terhadap model `Subject` (Prisma). *(penambahan schema Prisma = WO terpisah, di luar lingkup ini)*
2. `PrismaSubjectMatchProvider implements MatchProvider` — adapter murni: repository ops → `MatchCandidate[]`.
3. Registry: `{ field: 'subject', strategy: new ContainsStrategy(subjectProvider) }`.

Selesai. Tidak ada class strategi baru — `Exact/Contains/Prefix/Alias/FuzzyStrategy` sudah menangani perilaku apa pun untuk entity apa pun. Ini **efek kunci ADR-020**: pertumbuhan entity mengikuti O(N), bukan O(N×M).

### Q8. Apakah desain ini lebih sederhana dibanding RFC Revision 2?

**Ya — untuk jumlah class dan interface.**
- Interface: Rev 2 punya beberapa interface Strategy per field + beberapa interface Provider per field. Rev 3 punya **1 `MatchStrategy` + 1 `MatchProvider` + 1 `MatchBinding`**.
- Class strategi: Rev 2 = field×behavior; Rev 3 = behavior saja (5 class untuk semua field).
- Registry: satu fungsi komposisi, satu baris per field.
- Aturan konsep tetap sama (ADR-018/019): tidak ada mode, tidak ada searchMode, method eksplisit — **yang disederhanakan adalah struktur, bukan eksplisitnya**.

### Q9. Apakah ada konsekuensi negatif yang belum terlihat?

Ada lima, dengan mitigasi:

1. **Hilangnya type-safety per field di level Strategy.** Rev 2 menjamin `ExactAuthorStrategy` hanya untuk field `authors` lewat field literal. Rev 3 menjadikan `field` sebagai data di binding — kompilator tidak bisa mencegah `{ field: 'isbn', strategy: new ContainsStrategy(authorProvider) }` yang keliru. **Mitigasi:** mapping hanya terjadi di satu tempat (registry) yang kecil dan direview; `MatchBinding.field` boleh ditype sebagai union key field yang dikenal; smoke test mengikat field→hasil yang diharapkan.
2. **Semua provider wajib mengimplementasikan seluruh kosakata** (`findExact`/`findContains`/`findPrefix`/`findAll`), termasuk operasi yang "aneh" untuk entity tertentu (mis. `findPrefix` pada ISBN). **Mitigasi:** operasi tetap eksplisit dan diimplementasikan sungguh-sungguh (isbn `startsWith` tetap bermakna untuk barcode parsial); provider diuji per operasi; kalau ada operasi yang benar-benar tidak bermakna, tetap dipetakan ke sesuatu yang konsisten daripada dihilangkan (menghilangkan = memunculkan capability-checking, yang dilarang).
3. **Konsistensi semantik lintas entity adalah disiplin tim.** Karena satu `ExactStrategy` dipakai di banyak entity, "exact" harus bermakna sama (case-insensitive ASCII seperti SQLite) di semua provider. **Mitigasi:** kontrak dokumentasi di interface; test parity Dummy≡Prisma.
4. **Perilaku yang dipakai bersama butuh tuning per field lewat instance**, bukan lewat kelas. **Mitigasi:** opsi instance (`threshold`, `limit`, `aliases`) — sudah didukung di desain.
5. **Discoverability** ("perilaku apa yang aktif untuk author?") pindah dari nama class ke registry. **Mitigasi:** registry tunggal + dokumentasi; tidak tersebar.

Tidak ada konsekuensi yang membatalkan desain; kelima poin ini dicatat sebagai "biaya" yang ditukar dengan linearitas pertumbuhan (lihat §9 Trade-off).

### Q10. Menurut saya, dari Rev1/Rev2/Rev3 mana yang paling kuat secara arsitektur? Alasan objektif.

**Rev 3.** (Jawaban objektif — argumen di §10; ringkasan di sini.)

- **Rev 1** ditolak karena beralasan: memperkenalkan `mode`/`searchMode`/`MatchCriterion` → perilaku dikendalikan parameter + `switch`, melanggar ADR-018/019. Ini kelemahan **struktural** (dispatch berbasis nilai), bukan sekadar gaya.
- **Rev 2** kuat dalam eksplisit-ness dan type-safety per field, tetapi **kombinasi Field×Behavior** membuat kompleksitas class tumbuh **perkalian** (O(N×M)). Untuk sistem yang jelas akan bertambah field (Subject, Language, dst.), ini titik kegagalan pertumbuhan.
- **Rev 3** mewarisi seluruh kelebihan Rev 2 (method eksplisit, perilaku per class, Dummy≡Prisma, kontrak output stabil) dan menghilangkan kelemahannya (explosion) dengan memindahkan `field` ke binding serta menyeragamkan provider interface. Kompleksitas tumbuh **penjumlahan** (O(N)+O(M)).

---

## 2. Perbandingan RFC Rev1 vs Rev2 vs Rev3

| Aspek | Rev 1 (DITOLAK) | Rev 2 (hampir disetujui) | Rev 3 (diajukan) |
|---|---|---|---|
| Keputusan "cara mencari" | `MatchCriterion { value, mode, limit }` | Class per field×perilaku | Class **perilaku** saja (entity-agnostic) |
| `mode` / `searchMode` / enum | Ada | Tidak ada | Tidak ada |
| Class strategi | generic + mode | `ExactAuthorStrategy`, `ContainsCategoryStrategy`, … (O(N×M)) | `ExactStrategy`, `ContainsStrategy`, `PrefixStrategy`, `AliasStrategy`, `FuzzyStrategy` (O(M)) |
| Strategy Interface | 1 + mode | beberapa (per field) | **1** `MatchStrategy` |
| Provider Interface | criterion-based | beberapa (per field: Named/Book) | **1** `MatchProvider` (kosakata seragam) |
| Repository | `searchMode` (parameter) | operasi eksplisit | operasi eksplisit (**sama** dengan Rev 2) |
| Field tinggal di mana | di provider (SPI) | di strategy class | **di binding registry** (ADR-021) |
| Provider peran | eksekutor criterion | adapter (masih per-field) | adapter bisu (satu kontrak) |
| Entity baru | — | + provider + class per perilaku terpakai | + provider + 1 baris binding |
| Perilaku baru | — | + class per field | + 1 class + (opsional) operasi repository |
| Dummy ≡ Prisma | via mode | via class sama + SQLite mimic | via class sama + SQLite mimic (**sama** dengan Rev 2) |
| Kontrak output Engine | berubah | tetap | **tetap** |

---

## 3. Diagram Arsitektur

### Sebelum (Sprint 8 — kondisi saat ini)

```
MatchingEngineService
   │  provider.findMatches(value)           ← nilai + cara tersirat
   ├─ PrismaBookMatchProvider     → BookRepository.findByISBN(isbn)         (exact)
   ├─ PrismaAuthorMatchProvider   → AuthorRepository.findMany({search})     (contains, tersembunyi)
   ├─ PrismaPublisherMatchProvider→ PublisherRepository.findMany({search})  (contains, tersembunyi)
   └─ PrismaCategoryMatchProvider → CategoryRepository.findMany({search})   (contains, tersembunyi)
                                        └── FindOptions.search → { name: { contains } } (hardcode)
```

### Sesudah (Rev 3)

```
MatchingEngineService.match()
   │  binding.strategy.findMatches(value)  →  hitung status (SKIPPED/FOUND/NOT_FOUND/AMBIGUOUS)
   │
   │  ┌─ MatchBinding (field + strategy) ────────── registry (src/main/strategies)
   │  │   { field: 'isbn',     strategy: ExactStrategy(book) }
   │  │   { field: 'authors',  strategy: ExactStrategy(author) }
   │  │   { field: 'publisher',strategy: ContainsStrategy(publisher) }
   │  │   { field: 'category', strategy: ContainsStrategy(category) }
   │  └────────────────────────────────────────────
   │
   │  Strategy (perilaku — entity-agnostic):
   │     ExactStrategy    → provider.findExact(value)
   │     ContainsStrategy → provider.findContains(value)
   │     PrefixStrategy   → provider.findPrefix(value)
   │     AliasStrategy    → (ekspansi alias) → provider.findExact(…)
   │     FuzzyStrategy    → provider.findAll(500) → Levenshtein ratio di Strategy
   │
   ▼
MatchProvider (satu kontrak — adapter bisu, ADR-021)
   │  findExact / findContains / findPrefix / findAll(limit)   → entity → MatchCandidate[]
   ├─ PrismaAuthorMatchProvider → AuthorRepository
   ├─ PrismaBookMatchProvider   → BookRepository
   ├─ PrismaPublisherMatchProvider → PublisherRepository
   ├─ PrismaCategoryMatchProvider → CategoryRepository
   └─ (Dummy*MatchProvider — in-memory, meniru semantik SQLite)
       │
       ▼
Repository (operasi eksplisit — ADR-019)
   │  findExact / findContains / findPrefix / findAll / findByISBN
   ▼
Prisma (SQLite)
```

Field menentukan Provider (kiri); Strategy menentukan Perilaku (tengah); keduanya bertemu hanya di **binding**.

---

## 4. Class Diagram

```
┌────────────────────────────── src/shared ───────────────────────────────┐
│  match-provider.ts                                                     │
│    MatchCandidate { id: string; label: string }                        │
│    interface MatchProvider {                                            │
│      id: string; label: string                                          │
│      findExact(v); findContains(v); findPrefix(v); findAll(limit?) }    │
│                                                                        │
│  match-strategy.ts                                                     │
│    interface MatchStrategy { id; label; providerId;                    │
│      findMatches(value): Promise<MatchCandidate[]> }                   │
│    interface MatchBinding { field: string; strategy: MatchStrategy }   │
└─────────────────────────────────────────────────────────────────────────┘

┌───────────────────────── src/services/strategies ───────────────────────┐
│  ExactStrategy     implements MatchStrategy   → provider.findExact(v)   │
│  ContainsStrategy  implements MatchStrategy   → provider.findContains(v)│
│  PrefixStrategy    implements MatchStrategy   → provider.findPrefix(v)  │
│  AliasStrategy (aliases) implements MatchStrategy → findExact(ekspansi) │
│  FuzzyStrategy (threshold, limit, scanLimit) implements MatchStrategy   │
│      → findAll(scanLimit) + levenshteinRatio + filter + sort + slice    │
│  similarity.ts (murni): levenshteinRatio(), normalizeForComparison()    │
│  dedupe.ts (murni): dedupeById()                                        │
│  (setiap strategy: constructor(provider) — pure, testable tanpa DB)     │
└─────────────────────────────────────────────────────────────────────────┘

┌───────────────────────── src/services (data uji) ───────────────────────┐
│  DummyMatchProviders.ts: DummyIsbnMatchProvider, DummyAuthorMatchProvider,
│    DummyPublisherMatchProvider, DummyCategoryMatchProvider              │
│    (implements MatchProvider — meniru semantik SQLite)                  │
│  DummyMatchBindings.ts: dummyMatchBindings =                            │
│    [ isbn:Exact(dummyIsbn), authors:Contains(dummyAuthor),              │
│      publisher:Contains(dummyPublisher), category:Contains(dummyCategory)]│
└─────────────────────────────────────────────────────────────────────────┘

┌───────────────────────── src/main/providers ────────────────────────────┐
│  PrismaAuthorMatchProvider implements MatchProvider → AuthorRepository  │
│  PrismaPublisherMatchProvider → PublisherRepository                     │
│  PrismaCategoryMatchProvider → CategoryRepository                       │
│  PrismaBookMatchProvider → BookRepository (findExact→findByISBN)        │
└─────────────────────────────────────────────────────────────────────────┘

┌───────────────────────── src/main/repositories ─────────────────────────┐
│  AuthorRepository │ PublisherRepository │ CategoryRepository            │
│    findExact(name) │ findContains(name) │ findPrefix(name) │            │
│    findAll(limit)  │ (+ findMany/findById/existsBy*/count untuk UI)     │
│  BookRepository: findByISBN(isbn) │ findAll(limit) │ (+ findMany dst.)  │
└─────────────────────────────────────────────────────────────────────────┘

┌───────────────────────── src/main/strategies ───────────────────────────┐
│  index.ts: createProductionBindings(): MatchBinding[]                   │
│    = [ isbn:Exact(book), authors:Exact(author),                         │
│        publisher:Contains(publisher), category:Contains(category) ]     │
└─────────────────────────────────────────────────────────────────────────┘

┌───────────────────────── src/services ──────────────────────────────────┐
│  MatchingEngineService(bindings = dummyMatchBindings)                   │
│    match(validatedWorkbook): MatchedWorkbook   (kontrak output tetap)   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Sequence Diagram

### Exact Match (Author)

```
MatchingEngineService      ExactStrategy         PrismaAuthorMatchProvider   AuthorRepository       Prisma
      │ findMatches("Andrea Hirata")                     │                       │                    │
      │──────────────────────────────────────────────────▶│                       │                    │
      │                        │ findExact("Andrea Hirata")                      │                    │
      │                        │─────────────────────────▶│                       │                    │
      │                        │                          │ findExact(name)       │                    │
      │                        │                          │──────────────────────▶│                    │
      │                        │                          │                       │ author.findMany    │
      │                        │                          │                       │ {name:{equals}}    │
      │                        │                          │                       │───────────────────▶│
      │                        │                          │                       │◀──── Author[] ─────│
      │                        │                          │◀───── Author[] ───────│                    │
      │                        │◀─ MatchCandidate[] ──────│  (entity→candidate)   │                    │
      │◀──── MatchCandidate[] ─│                          │                       │                    │
      │ status = FOUND (1 kandidat)                       │                       │                    │
      │ (0→NOT_FOUND, >1→AMBIGUOUS)                       │                       │                    │
```

Class yang sama (`ExactStrategy`) dipakai untuk Book/Publisher/Category — bedanya hanya provider di balik layar.

### Fuzzy Match (Author)

```
MatchingEngineService        FuzzyStrategy          PrismaAuthorMatchProvider   AuthorRepository       Prisma
      │ findMatches("andre hirt")                          │                       │                    │
      │───────────────────────────────────────────────────▶│                       │                    │
      │                        │ findAll(500)              │                       │                    │
      │                        │──────────────────────────▶│                       │                    │
      │                        │                           │ findAll(500)          │                    │
      │                        │                           │──────────────────────▶│                    │
      │                        │                           │                       │ author.findMany    │
      │                        │                           │                       │ take:500, name asc │
      │                        │                           │                       │───────────────────▶│
      │                        │                           │                       │◀──── Author[] ─────│
      │                        │                           │◀───── Author[] ───────│                    │
      │  skor: levenshteinRatio(normalize(input), normalize(label))                 │                    │
      │  filter >= 0.8 · sort desc · slice 10               │                       │                    │
      │◀──── MatchCandidate[] ─│                           │                       │                    │
      │ status = FOUND (0→NOT_FOUND, >1→AMBIGUOUS)         │                       │                    │
```

Tidak ada predikat query baru — fuzzy memakai `findAll()` eksplisit lalu menilai di Strategy. Alur identik untuk provider lain.

---

## 6. Analisis Kompleksitas Jumlah Class

Rumus pertumbuhan (strategi kelas saja):

| | Rev 2 | Rev 3 |
|---|---|---|
| Class strategi | O(N × M) | **O(M)** |
| Interface strategi | O(N) | **1** |
| Interface provider | O(N) | **1** |
| Class provider | O(N) | O(N) |
| Baris registry | O(N) | O(N) |

- N = jumlah field (saat ini 4; masa depan: Subject, Language, Location, Supplier, Member → ~9+), M = jumlah perilaku (5).
- **Rev 2** dengan 9 field × 5 perilaku → sampai **45 class** strategi (+9 interface).
- **Rev 3** dengan 9 field × 5 perilaku → **tetap 5 class** strategi, 1 interface strategi, 1 interface provider, 9 class provider, 9 baris registry.

Contoh tabel untuk entity baru (Rev 3):

| Entity | Provider | Strategy (dipakai ulang) |
|---|---|---|
| Author | PrismaAuthorMatchProvider | Exact / Contains / Prefix / Alias / Fuzzy |
| Publisher | PrismaPublisherMatchProvider | Exact / Contains / … |
| Category | PrismaCategoryMatchProvider | Exact / Contains / … |
| Book (isbn) | PrismaBookMatchProvider | Exact / Fuzzy |
| Subject (baru) | PrismaSubjectMatchProvider | Contains / Exact / … |
| Supplier (baru) | PrismaSupplierMatchProvider | Contains / … |

Semua strategi untuk semua entity = **5 class total**. Inilah definisi penghindaran Cartesian Explosion (ADR-020).

---

## 7. Analisis Maintainability

- **Satu sumber kebenaran perilaku.** Logika exact/contains/prefix/fuzzy ditulis sekali dan dipakai semua entity → perbaikan/penyempurnaan (mis. algoritma fuzzy) cukup di satu tempat.
- **Provider sangat kecil dan dangkal** (1 method ↔ 1 repository op + mapping) → mudah diaudit, mudah diuji.
- **Registry = peta tunggal** field→perilaku → siapa pun bisa melihat strategi aktif hanya dari satu file.
- **Kontrak output Engine stabil** (`MatchedWorkbook`/`FieldMatch`/`MatchStatus`) → Sprint 9 dan UI tidak terpengaruh perubahan internal.
- Biaya: disiplin konsistensi semantik lintas entity (lihat Q9.3) dan dependensi pada registry sebagai single point of truth untuk mapping field.

---

## 8. Analisis Extensibility

| Perubahan | Yang ditambah | Yang diubah |
|---|---|---|
| Entity baru (Subject, Language, …) | Provider + baris binding (+ schema/Repository bila belum ada) | **Tidak ada** class strategi, tidak ada Engine |
| Perilaku baru (mis. Soundex, Metafone) | 1 class Strategy (+ operasi provider/repository bila kosakatanya belum ada) | Tidak ada Engine |
| Tuning per field (threshold, alias) | Konfigurasi di baris binding | Tidak ada class |
| Ubah perilaku field yang ada | 1 baris registry | Tidak ada class |
| Provider baru untuk data source lain (API, file) | Provider implements `MatchProvider` | Tidak ada Strategy |

Prinsip **Open/Closed** terpenuhi: sistem terbuka untuk ekstensi (tambah Provider/Strategy) tanpa memodifikasi Engine atau class yang ada. Kompilator menjamin provider baru memenuhi seluruh kosakata `MatchProvider`.

---

## 9. Analisis Trade-off

**Yang didapat (Rev 3 vs Rev 2):**
1. Pertumbuhan linear O(N+M), bukan perkalian O(N×M).
2. Satu kontrak provider + satu kontrak strategi → lebih sedikit interface, lebih sedikit duplikasi.
3. Perilaku ditulis sekali → konsistensi antar entity terjaga oleh konstruksi.
4. Entity baru = tambah Provider + 1 baris (paling murah di antara ketiga RFC).

**Yang dikorbankan:**
1. **Type-safety per field** di level class (Rev 2 menjamin `ExactAuthorStrategy` hanya untuk `authors`). Rev 3 menyerahkan ke binding (data). *Mitigasi: union type `field`, registry tunggal, smoke test.*
2. **Provider wajib mengimplementasikan seluruh kosakata**, termasuk operasi yang jarang dipakai per entity. *Mitigasi: tetap eksplisit & konsisten; jangan capability-checking.*
3. **Discoverability** bergeser dari nama class ke registry. *Mitigasi: satu registry + dokumentasi.*

**Yang tetap sama di Rev 2 dan Rev 3 (tidak ada regresi):**
- Repository eksplisit (ADR-019), tanpa mode/searchMode.
- Perilaku sebagai class (ADR-018), Dummy≡Prisma, kontrak output Engine stabil.

Trade-off ini menguntungkan Rev 3 selama entity akan bertambah (fakta: Subject/Language/Supplier/Member sudah di rencana). Untuk kode statis 4 field selamanya, Rev 2 juga bisa diterima — tetapi bobot arsitekturnya Rev 3 lebih kuat pada trayektori yang ada.

---

## 10. Rekomendasi Final

**Setujui RFC Revision 3** sebagai revisi dari RFC Revision 2, dengan dasar ADR-020 & ADR-021.

Alasan objektif (menjawab Q10):
1. **Kompleksitas tumbuh linear** (O(N)+O(M)) — satu-satunya dari ketiga RFC yang kebal terhadap bertambahnya entity; sesuai rencana perluasan (Subject, Language, Location, Supplier, Member).
2. **Single Responsibility paling tajam:** Strategy = perilaku (ADR-018/020), Field = memilih Provider (ADR-021), Provider = adapter data (ADR-012/021), Repository = operasi eksplisit (ADR-019), Engine = orkestrasi murni (ADR-010). Tidak ada tumpang tindih tanggung jawab yang tersisa.
3. **Tidak mengorbankan eksplisit-ness yang ditegakkan Rev 2:** tidak ada `mode`/`searchMode`/`switch`; method eksplisit; kontrak output stabil. Rev 3 = seluruh kebaikan Rev 2 dikurangi coupling Field×Behavior.
4. **Extensibility terbaik:** entity baru cukup Provider + 1 baris binding; perilaku baru cukup 1 class. Open/Closed terpenuhi.
5. **Biaya yang dibayar** (type-safety per field, kosakata seragam) kecil, termitigasi, dan tidak struktural.

Keputusan yang diminta:
1. Setujui **ADR-020** (Strategy = perilaku, bukan Field×Behavior) dan **ADR-021** (Field owns Provider, Strategy owns Behavior).
2. Setujui **satu kontrak `MatchProvider`** (`findExact`/`findContains`/`findPrefix`/`findAll`) dan **`MatchBinding { field, strategy }`** sebagai satuan registry.
3. Setujui **default produksi**: isbn→`ExactStrategy`, authors→`ExactStrategy`, publisher→`ContainsStrategy`, category→`ContainsStrategy` (perilaku identik Sprint 8).
4. Setujui **opsional** `FieldMatch.strategy?: string` (additive, untuk observability) — keputusan PO.

**Deferred (di luar lingkup revisi ini):** FTS5 untuk fuzzy skala besar; normalisasi non-ASCII (`lower()` kolom); multi-strategi per field di Engine (jika kelak Exact+Fuzzy digabung); schema baru untuk entity baru (WO terpisah).

---

*Setelah RFC ini selesai: BERHENTI. Tidak ada implementasi apa pun. Menunggu persetujuan Product Owner.*
