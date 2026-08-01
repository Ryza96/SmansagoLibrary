# SPRINT8_REVISION1_RFC — Separating Search Strategy from Match Provider

**Status:** DRAFT — menunggu persetujuan Product Owner. **TIDAK ada implementasi sebelum approval.**
**Scope:** Revisi arsitektur Sprint 8 (Database Matching Provider).
**Referensi ADR:** ADR-010 (Matching Engine pure), ADR-011 (matching bergantung pada providers), ADR-012 (providers are infrastructure), ADR-013 (matching strategy separate from provider), ADR-014 (provider uses repository).

---

## 1. Problem Analysis

### 1.1 Kondisi saat ini (setelah Sprint 8)

Arsitektur yang terpasang:

```
Matching EngineService
   └── MatchProvider.findMatches(value)        (SPI: src/shared/match-provider.ts)
         ├── Dummy*MatchProvider               (in-memory, exact normalized)
         └── Prisma*MatchProvider              (src/main/providers/)
               └── Repository.findMany({ search }) | Repository.findByISBN(isbn)
                     └── Prisma
```

**Masalah utama — strategi pencarian ter-baking-in ke Provider:**

- `PrismaAuthorMatchProvider.findMatches(value)` memanggil `AuthorRepository.findMany({ search: value })`, yang di repository selalu diterjemahkan ke `{ name: { contains: value } }` (`src/main/repositories/author.repository.ts:29-31`). Provider **diam-diam memilih strategi `contains`** tanpa disadari oleh desain SPI.
- Hal yang sama terjadi pada `PrismaCategoryMatchProvider` (category.repository.ts:29-31) dan `PrismaPublisherMatchProvider` (publisher.repository.ts:29-31).
- `PrismaBookMatchProvider` memanggil `BookRepository.findByISBN(value)` → exact `findUnique` — jadi field ISBN justru memakai strategi **exact**, sementara 3 field lain memakai **contains**. **Inkonsistensi strategi antar provider.**
- `Dummy*MatchProvider` memakai **exact** (normalisasi lowercase). Jadi Dummy dan Prisma punya perilaku pencarian yang **tidak sama** untuk field yang sama.
- Repository `findMany` hanya mengenal satu predikat (contains) melalui `FindOptions.search` — tidak ada parameter mode.

**Konsekuensi:**
1. Melanggar ADR-013: keputusan "cara mencari" seharusnya menjadi keputusan Strategy, bukan keputusan tersembunyi di implementasi Provider/Repository.
2. Sulit menambah strategi baru (Prefix, Fuzzy, Alias) tanpa menyentuh Provider dan Repository sekaligus.
3. Hasil matching antara environment dev (Dummy) dan production (Prisma) tidak konsisten → uji dev tidak merepresentasikan perilaku produksi.

### 1.2 Kenapa sekarang ditangani (bukan saat Sprint 9)

- Engine (`MatchingEngineService`) **belum punya consumer apa pun** selain smoke test (hasil grep: tidak ada IPC/preload/UI yang memanggil `matchingEngineService` maupun `createPrismaMatchProviders`). Blast radius kecil — kita masih pemilik penuh bentuk internal.
- Sprint 9 (import pipeline end-to-end) akan mengkonsumsi output `MatchedWorkbook`/`FieldMatch`. Mengubah SPI sekarang jauh lebih murah daripada setelah Sprint 9 mengunci kontrak.
- `SPRINT8_REPORT.md` sudah mencatat risiko yang sama (substring tanpa scoring, limit 10 baris, tidak ada strategy/ranking).

---

## 2. Design Alternatives

### Opsi A — Strategy sebagai decorator post-processing (perubahan minimal)

Strategy membungkus provider dan hanya memproses hasil (alias expansion, scoring, dedupe, limit) tanpa mengubah cara query dijalankan.

```
Engine → Strategy → Provider.findMatches(value) → Repository (contains/exact tetap di dalam)
```

- **Kelebihan:** Provider interface tidak berubah (dummy & prisma tetap). Paling murah.
- **Kekurangan:** Tidak menyelesaikan masalah inti — predikat pencarian (exact vs contains vs prefix) **tetap** di dalam Provider/Repository. Hanya post-processing yang terpisah. ADR-013 tidak benar-benar terpenuhi.

### Opsi B — Strategy menyusun MatchCriterion; Provider mengeksekusinya (REKOMENDASI)

Strategy memutuskan **mode pencarian**, Provider menjadi adapter data yang mengeksekusi criterion.

```
Matching Engine
   └── MatchStrategy.findMatches(value)          (membangun criterion: normalize, alias, mode, limit)
         └── MatchProvider.findMatches(criterion)
               └── Repository (mode-aware search)
                     └── Prisma
```

- **Kelebihan:** Pemisahan penuh sesuai ADR-013. Predikat pencarian (exact/prefix/contains/fuzzy) diputuskan Strategy; Provider hanya menerjemahkan criterion ke repository; Repository menjadi mode-aware. Dummy & Prisma provider berperilaku identik (konsisten antar environment). Strategy murni, testable tanpa DB.
- **Kekurangan:** Provider interface berubah (criterion-based); repository perlu mode-aware (`searchMode` atau method baru); dummy provider ditulis ulang menjadi mode-aware; ada biaya migrasi sekali.

### Opsi C — Hilangkan layer Provider

Strategy memanggil Repository langsung.

```
Engine → Strategy → Repository → Prisma
```

- **Kelebihan:** Paling sedikit lapisan.
- **Kekurangan:** Menghapus seam infrastruktur yang diwajibkan ADR-011/012/014 (provider adalah infrastruktur, engine tidak boleh tahu repository). Dummy (in-memory, tanpa DB) tidak mungkin dipakai — pengujian unit engine jadi bergantung DB. **DITOLAK.**

**Rekomendasi: Opsi B**, dijalankan bertahap (lihat §6) agar transisi dummy→prisma tetap aman.

---

## 3. Jawaban atas 8 Pertanyaan Review

### Q1. Apa yang berubah agar Strategy benar-benar terpisah?

Tiga perubahan inti:
1. **SPI baru** `MatchStrategy` (di `src/shared/match-strategy.ts`) yang bertanggung jawab atas: normalisasi nilai → ekspansi alias → pemilihan mode pencarian → batas kandidat.
2. **Provider interface menjadi criterion-based** (bukan value-based): `findMatches(criterion: MatchCriterion)`.
3. **Repository mode-aware**: `FindOptions` mendapat `searchMode`, atau method eksplisit (`findByNameExact`, `findByNameStartsWith`), sehingga predikat pencarian bukan lagi properti tetap repository.

Engine tidak lagi memanggil `provider.findMatches(value)`; ia memanggil `strategy.findMatches(value)` dan menurunkan status (FOUND/NOT_FOUND/AMBIGUOUS/SKIPPED) dari kandidat yang dikembalikan — status logic tetap di Engine (kontrak `FieldMatch` tidak berubah).

### Q2. Apakah Provider Interface berubah?

**Ya** (Opsi B). Dari:

```ts
findMatches(value: string): Promise<MatchCandidate[]>
```

menjadi:

```ts
findMatches(criterion: MatchCriterion): Promise<MatchCandidate[]>
```

dengan:

```ts
interface MatchCriterion {
  value: string            // nilai yang sudah dinormalisasi (trim; case sudah diseragamkan)
  mode: 'exact' | 'prefix' | 'contains' | 'fuzzy'
  limit?: number           // default 10 — menjaga kelakuan lama
}
```

Provider kehilangan tanggung jawab "memilih cara mencari"; ia hanya **mengeksekusi** criterion terhadap datanya (Prisma via repository, atau store in-memory untuk Dummy). `id/field/label` dan `MatchCandidate` tetap sama.

### Q3. Apakah Repository Interface berubah?

**Ya, kecil dan backward-compatible.** `FindOptions` bertambah satu field opsional:

```ts
interface FindOptions {
  pagination?: PaginationOptions
  sort?: Record<string, SortDirection>
  search?: string
  searchMode?: 'contains' | 'prefix' | 'exact'   // default 'contains' (perilaku lama)
  memberType?: string
  where?: Record<string, unknown>
}
```

Implementasi `findMany` memetakan mode ke predikat Prisma:
- `contains` → `{ name: { contains } }` (default, = perilaku hari ini)
- `prefix` → `{ name: { startsWith } }`
- `exact` → `{ name: { equals } }`
- `fuzzy` → fetch `contains` dengan `limit` lebih besar; scoring/penyaringan dilakukan Strategy (repository hanya menyuplai super-set).

`BookRepository.findByISBN` (exact `findUnique`) tetap dipertahankan; provider field `isbn` dengan `mode: 'exact'` boleh memakainya, mode lain memakai `findMany` (isbn/title contains). Signature `findByISBN` tidak berubah. **Tidak ada konsumen lain** yang menggunakan `FindOptions.search` selain ketiga provider Prisma (grep terverifikasi), jadi menambah field ini tidak merusak apa pun.

### Q4. Bentuk interface Strategy terbaik?

Satu interface, berorientasi hasil — Strategy **menghasilkan kandidat** (bukan cuma criterion), karena strategi seperti Fuzzy harus menilai & menyaring hasil:

```ts
interface MatchStrategy {
  readonly id: string            // contoh 'exact', 'alias', 'prefix', 'contains', 'fuzzy'
  readonly field: string         // 'isbn' | 'authors' | 'publisher' | 'category'
  readonly label: string
  findMatches(value: string): Promise<MatchCandidate[]>
}

interface ExactMatchStrategy extends MatchStrategy {
  readonly field: 'isbn'         // type literal bila perlu mengunci field
}
```

Alasan desain:
- **Mirror SPI Provider yang sudah ada** (id/field/label + findMatches) → mudah dibaca, mudah diuji.
- `value` adalah nilai mentah dari `CanonicalRow`; Strategy menangani normalisasi + pembentukan criterion + interpretasi hasil. Provider tidak peduli dari mana nilai berasal.
- `field` literal memungkinkan pembatasan type-level per field, konsisten dengan `IsbnMatchProvider`/`AuthorMatchProvider` yang sudah ada.

### Q5. Bagaimana ExactStrategy bekerja?

```ts
class ExactMatchStrategy implements MatchStrategy {
  constructor(private readonly provider: MatchProvider) {}

  async findMatches(value: string): Promise<MatchCandidate[]> {
    const normalized = value.trim().toLowerCase()
    const candidates = await this.provider.findMatches({ value: normalized, mode: 'exact', limit: 10 })
    return candidates
  }
}
```

- **Prisma:** criterion `{ mode: 'exact' }` → `AuthorRepository.findMany({ search: normalized, searchMode: 'exact' })` → `{ name: { equals } }` (case-insensitive via SQLite `=` yang case-insensitive untuk ASCII; untuk non-ASCII perlu `lower(name)=lower(?)` — dibahas di §7).
- **Dummy:** lookup langsung di store in-memory yang sudah dinormalisasi (perilaku hari ini, tidak berubah).
- **Status:** Engine menghitung dari jumlah kandidat — 0 → NOT_FOUND, 1 → FOUND, >1 → AMBIGUOUS.
- Catatan: di lingkungan produksi, exact match untuk author/publisher/category akan menghasilkan 0 atau 1 karena nama disimpan unik (kondisi `existsByName`). AMBIGUOUS baru muncul bila ada duplikat nama atau saat mode non-exact dipakai.

### Q6. Menambah Alias/Prefix/Contains/Fuzzy tanpa mengubah Engine?

Ya, selama Engine memanggil **Strategy**, bukan provider. Setiap strategi baru cukup:
1. Mengimplementasikan `MatchStrategy` (constructor mengambil provider + opsi).
2. Didaftarkan di **registry/factory** (`createPrismaMatchStrategies()`, analog `createPrismaMatchProviders()`), atau dipilih per-field lewat konfigurasi engine.

Sketsa tiap strategi (semuanya memakai `provider.findMatches(criterion)` yang sama):

- **AliasStrategy** — ekspansi nilai sebelum query:
  ```ts
  class AliasMatchStrategy implements MatchStrategy {
    constructor(private readonly provider: MatchProvider, private readonly aliases: Record<string, string[]>) {}
    // normalize(value) → cari di tabel alias → findMatches per alias (mode 'exact'), union + dedupe
  }
  // contoh: 'andre' → ['andrea hirata']; 'pj' → ['Pramoedya Ananta Toer']
  ```

- **PrefixStrategy** — `{ mode: 'prefix' }` → Prisma `{ startsWith }`; berguna untuk katalog besar (Sunda/Betawi-nama panjang) dengan limit 10.

- **ContainsStrategy** — `{ mode: 'contains' }` → perilaku Prisma hari ini, dikemas sebagai strategi eksplisit (bukan keputusan tersembunyi). Menggantikan implementasi `findMany({ search })` yang sekarang.

- **FuzzyStrategy** — pendekatan bertingkat:
  1. fetch `{ mode: 'contains', limit: 50 }` (super-set);
  2. skor tiap kandidat terhadap nilai input (mis. Levenshtein ratio / Jaro-Winkler) di Strategy;
  3. pertahankan kandidat `score >= threshold` (default 0.8), urutkan menurun, potong ke `limit` awal.
  Dengan cara ini repository hanya menyuplai data mentah; seluruh penalaran fuzziness ada di Strategy (murni, teruji tanpa DB).

**Engine tidak berubah** selama memanggil `strategy.findMatches(value)` — penambahan strategi = tambah class + daftarkan di factory. Tidak ada perubahan di `MatchingEngineService.match()`, `FieldMatch`, atau `MatchedWorkbook`.

### Q7. Backward compatibility dengan Dummy Provider?

**Terjaga.** Peta kompatibilitas:

| Kepentingan | Setelah revisi |
|---|---|
| Output Engine (`MatchedWorkbook`, `FieldMatch`, `MatchStatus`, `MatchCandidate`) | **Tidak berubah** — kontrak untuk Sprint 9 tetap. |
| Default engine (tanpa argumen) | Tetap `dummyMatchProviders` → kini **strategies** berbasis Dummy; engine tanpa DI masih jalan tanpa DB. |
| `Dummy*Provider` | Ditulis ulang dari value-based menjadi criterion-based (mode-aware) atas store in-memory yang sama; data uji yang sama (Andrea Hirata, Pramoedya, 9789793062792, AMBIGUOUS 9781234567890, Gramedia, Bentang, Fiksi, Sejarah) → semua smoke test Sprint 6–8 tetap lulus. |
| Perilaku exact Dummy | Identik hari ini (mode 'exact' = normalize + lookup). |
| `MatchProvider` SPI lama | API lama (`findMatches(value)`) tidak dipertahankan — satu-satunya consumer adalah dummy & prisma providers serta engine (semuanya ikut dimigrasi dalam PR yang sama). Tidak ada API publik eksternal (tidak diekspor ke preload/renderer). |

Catatan kejujuran: ini **breaking change internal**, bukan transisi mulus dengan dua API. Namun karena tidak ada konsumen di luar smoke test, "backward compat" artinya **hasil test & kontrak output tetap**, bukan "API lama tetap ada".

### Q8. Dampak ke Sprint 9?

- **Positif — kontrak output stabil.** Sprint 9 (pipeline import end-to-end: parse → validate → match → commit) mengonsumsi `MatchedWorkbook`/`MatchedRow.matches[]`/`FieldMatch` yang tidak berubah bentuknya.
- Sprint 9 mendapat titik ekstensi yang tepat: memilih strategi per field via factory (`createPrismaMatchStrategies()`) dengan default **ExactStrategy untuk isbn, ContainsStrategy untuk author/publisher/category** (meniru perilaku produksi hari ini), siap ditukar ke Prefix/Alias/Fuzzy tanpa menyentuh pipeline.
- Sprint 9 tidak perlu tahu tentang Provider/Repository — ia berhadapan dengan Strategy. Ini memperkecil permukaan yang Sprint 9 harus tahu.
- Satu catatan: bila Sprint 9 membutuhkan skor/peringkat untuk menyelesaikan AMBIGUOUS, sebaiknya scoring dibahas dalam RFC ini (lihat §7 "deferred") agar `FieldMatch` bisa diberi `score` sebelum Sprint 9 mengunci pembacaannya.

---

## 4. Architecture Impact — Before / After

### Sebelum (Sprint 8)

```
MatchingEngineService.match()
   │
   ├─(field isbn)     DummyIsbnMatchProvider     → lookup exact (memory)
   ├─(field authors)  DummyAuthorMatchProvider   → lookup exact (memory)
   ├─(field publisher) DummyPublisherMatchProvider → lookup exact (memory)
   ├─(field category) DummyCategoryMatchProvider → lookup exact (memory)
   │
   └─(production, via createPrismaMatchProviders)
        PrismaBookMatchProvider     → BookRepository.findByISBN(isbn)          (exact)
        PrismaAuthorMatchProvider   → AuthorRepository.findMany({search})      (contains, diam-diam)
        PrismaPublisherMatchProvider→ PublisherRepository.findMany({search})   (contains, diam-diam)
        PrismaCategoryMatchProvider → CategoryRepository.findMany({search})    (contains, diam-diam)
                                            │
                                            └── FindOptions.search → { name: { contains } } (hardcode)
```

- Strategi pencarian **tersebar** dan **tersembunyi**: di Dummy exact, di Prisma bercampur (isbn exact, nama contains).
- Provider membuat keputusan "cara mencari" (melanggar ADR-013).

### Sesudah (Opsi B)

```
MatchingEngineService.match()                      (tidak berubah kontrak output)
   │
   └── MatchStrategy.findMatches(value)            (SPI baru: normalize + mode + interpretasi)
         │
         ├─ ExactStrategy    → provider.findMatches({value, mode:'exact'})
         ├─ ContainsStrategy → provider.findMatches({value, mode:'contains'})
         ├─ PrefixStrategy   → provider.findMatches({value, mode:'prefix'})
         ├─ AliasStrategy    → expand alias → provider.findMatches({value, mode:'exact'})
         └─ FuzzyStrategy    → provider.findMatches({value, mode:'contains', limit:50})
                                      │              → skor & saring (Levenshtein) di Strategy
                                      ▼
         MatchProvider.findMatches(criterion)       (criterion-based)
              │
              ├─ Prisma*Provider → Repository.findMany({ search, searchMode })   (mode-aware)
              └─ Dummy*Provider  → lookup in-memory mode-aware (data sama)
                      │
                      ▼
                 Prisma (SQLite)
```

- Keputusan strategi **eksplisit di satu tempat** (Strategy); Provider & Repository menjadi murni mekanis.
- Dummy dan Prisma berperilaku **identik** untuk mode yang sama → pengujian dev mencerminkan produksi.
- Titik ekstensi Sprint 9: `createPrismaMatchStrategies()`.

---

## 5. Migration Risk

| Risiko | Level | Mitigasi |
|---|---|---|
| Mengubah SPI Provider memengaruhi smoke test Sprint 6–8 | Rendah–sedang | Migrasi dalam satu PR; seluruh smoke test (18+25+16) dijalankan ulang; kontrak output engine tidak berubah. |
| `searchMode` default salah → perilaku produksi berubah tanpa sadar | Rendah | Default `'contains'` = perilaku hari ini; smoke DB Sprint 8 (16 test) diulang untuk memverifikasi hasil identik. |
| SQLite case-insensitivity hanya untuk ASCII (`contains`/`equals` non-ASCII berbeda) | Sedang | Keputusan jelas di RFC: pertahankan `LIKE` bawaan; non-ASCII diseragamkan dengan `lower()` bila diperlukan; catat sebagai deferred. |
| Fuzzy tanpa indeks FTS → query lambat di DB besar | Sedang | Fuzzy memakai `contains` limit 50 + scoring di memory; FTS5 dibahas terpisah (deferred), tidak memblokir revisi. |
| Konsumen tak terduga (IPC/preload/UI) | Tidak ada | Grep `findMatches`/`MatchingEngineService`/`createPrismaMatchProviders` — 0 konsumen selain engine & smoke test. |
| Regression pada Dummy (default engine) | Rendah | Data dummy tidak berubah; hanya dibungkus criterion-based. |

---

## 6. Phased Implementation Steps (setelah approval)

**Phase 1 — SPI + Strategy (tanpa mengubah perilaku Prisma):**
1. Buat `src/shared/match-strategy.ts`: `SearchMode`, `MatchCriterion`, `MatchStrategy` (+ sub-interface dengan `field` literal).
2. Ubah `src/shared/match-provider.ts`: `findMatches(criterion: MatchCriterion)`.
3. Buat `src/services/strategies/`: `ExactMatchStrategy`, `ContainsMatchStrategy` (inti), `PrefixMatchStrategy`, `AliasMatchStrategy`, `FuzzyMatchStrategy` (lengkap; Fuzzy memakai Levenshtein ratio).
4. Ubah `src/services/DummyMatchProviders.ts` menjadi criterion-based (mode-aware, data sama).
5. Ubah `MatchingEngineService` memanggil Strategy (constructor DI `strategies`, default = strategi Dummy). Output & status logic tetap.

**Phase 2 — Repository mode-aware:**
6. Tambah `searchMode` ke `FindOptions`; update `author/category/publisher/book` `findMany`.
7. Ubah 4 `Prisma*MatchProvider` → criterion-based (field `isbn` exact memakai `findByISBN`; lainnya mode-aware).
8. Buat `src/main/providers/index.ts` → `createPrismaMatchStrategies()` (Exact untuk isbn; Contains untuk author/publisher/category sebagai default produksi).

**Phase 3 — Verifikasi & laporan:**
9. Jalankan ulang seluruh smoke test (Sprint 6: 18, Sprint 7: 25, Sprint 8: 16 DB + unit). Tambah smoke untuk: tiap mode (exact/prefix/contains), Alias expansion, Fuzzy threshold, dan kesetaraan Dummy-vs-Prisma untuk input yang sama.
10. `npm run lint`, `npm run build`, targeted eslint.
11. Tulis `SPRINT8_REVISION1_REPORT.md`.

---

## 7. Deferred / Out of Scope (untuk keputusan terpisah)

- **Scoring di `FieldMatch`** (`score` per kandidat) — diperlukan bila Sprint 9 harus memilih kandidat dari AMBIGUOUS; usulkan menjadi RFC/WO terpisah sebelum Sprint 9 mengunci kontrak.
- **FTS5 / indeks pencarian** untuk Fuzzy skala besar.
- **Normalisasi non-ASCII** (`lower()` kolom) untuk search case-insensitive penuh.
- **Dedupe provider per field** di Engine (saat ini dua provider dengan `field` sama menghasilkan dua `FieldMatch` terpisah — perilaku dipertahankan).

---

## 8. Keputusan yang Diminta

1. Setujui **Opsi B** (Strategy menyusun criterion, Provider mengeksekusi) — atau pilih A (decorator, masalah inti tidak terselesaikan) / C (tanpa provider, ditolak).
2. Setujui default produksi: **ExactStrategy untuk isbn, ContainsStrategy untuk author/publisher/category** (meniru perilaku hari ini).
3. Setujui `searchMode` di `FindOptions` (default `contains`, backward compatible) vs method repository eksplisit.
