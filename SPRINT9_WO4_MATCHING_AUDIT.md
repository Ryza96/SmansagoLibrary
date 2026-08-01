# SPRINT9_WO4_MATCHING_AUDIT.md

Audit tahap Matching — Book Import Pipeline
Mode: READ ONLY (tanpa perubahan kode)
Date: 2026-07-31

---

## 1. Current Flow

### Alur aktual (ditelusuri dari kode)

```
canonicalRows: CanonicalRow[]          ← dipetik dari validatedWorkbook.canonicalRows
        │                                  (MatchingEngineService.ts:17)
        ▼
MatchingEngineService.match(validatedWorkbook)   (MatchingEngineService.ts:16)
        │  default constructor: strategies = dummyMatchStrategies (renderer-safe, in-memory)
        │  (MatchingEngineService.ts:14)
        ▼
matchRow(canonicalRow)                          (MatchingEngineService.ts:37)
        │  Promise.all per strategy
        ▼
MatchStrategy.findMatches(value)                (match-strategy.ts:8)
        │  value = canonicalRow.values[strategy.field]; null/blank → SKIPPED
        ▼
Strategy → delegasi ke operasi eksplisit provider:
   ExactBookStrategy.findByISBN            (ExactBookStrategy.ts:16)
   ContainsAuthorStrategy.findContains     (ContainsAuthorStrategy.ts:16)
   ContainsPublisherStrategy.findContains  (ContainsPublisherStrategy.ts:16)
   ContainsCategoryStrategy.findContains   (ContainsCategoryStrategy.ts:16)
        ▼
Provider (4 Prisma di production / 4 Dummy di default)
   Prisma*MatchProvider → memanggil satu operasi repository
        ▼
Repository → Prisma DB
   BookRepository.findByISBN               (book.repository.ts:47)
   AuthorRepository.findContains           (author.repository.ts:54)
   PublisherRepository.findContains
   CategoryRepository.findContains
        ▼
MatchCandidate[]  ({ id, label })
        ▼
Status diturunkan: 0 → NOT_FOUND, 1 → FOUND, >1 → AMBIGUOUS   (MatchingEngineService.ts:46-47)
        ▼
FieldMatch[]  ({ field, provider, status, candidates })
        ▼
MatchedWorkbook  { canonicalRows, matchedRows, matchingResult }   (MatchingEngineService.ts:34)
   matchingResult = { valid: true, errors: [], warnings: [] }      ← HARDCODED
```

### Jawaban pertanyaan 1 — Input Matching

**Benar:** Matching mengkonsumsi **`ValidatedWorkbook.canonicalRows`** (hanya properti itu yang dibaca, `MatchingEngineService.ts:17`). **Tidak** membaca `rawWorkbook` — tidak ada akses ke `RawWorkbook`/sheet di engine.

**Catatan:** Input bertipe `ValidatedWorkbook` (objek penuh yang membungkus `rawWorkbook`), padahal hanya `canonicalRows` yang dipakai. Ini coupling tipe-level (API surface), bukan dependency fungsional.

### Jawaban pertanyaan 2 — Alur lengkap

Sudah di diagram di atas. Peta pemanggil (grep): `matchingEngineService` & `createProductionStrategies` **0 pemanggil di `src/`** — satu-satunya konsumen adalah `scripts/smoke-match-strategies.ts`. **Matching BELUM ter-wire ke pipeline runtime.**

---

## 2. Architecture Review

| Aspek | Status | Bukti |
|-------|--------|-------|
| Stage mandiri: pure engine, input `canonicalRows` | ✅ | `MatchingEngineService` tidak bergantung pada parsing/validasi/DB |
| Strategy sebagai titik ekstensi per-field | ✅ | 8 strategy class + registry `createProductionStrategies()` |
| Composition root terpisah (dummy vs produksi) | ✅ | `DummyMatchStrategies` (renderer/testing) vs `createProductionStrategies` (main/Prisma) |
| Provider → Repository boundary | ✅ | Provider hanya memanggil operasi repository; `@prisma/client` tidak disentuh provider (Sprint 8 ADR-014) |
| Engine terpisah dari Service layer legacy | ✅ | Tidak ada impor engine di `electron/` |
| **Runtime wiring** | ❌ | 0 pemanggil di UI/main; tidak ada IPC channel import/match (63 handler terdaftar, tak satu pun untuk import) |
| **Lokasi eksekusi produksi belum ditentukan** | ⚠️ | Strategi produksi di `src/main` (butuh Prisma/main-process), engine di `src/services` (kini hanya dikompilasi konteks node via scripts). Tanpa keputusan lokasi, WO-5 tak punya titik jalan |

**Kontrak stage:** Pipeline bertahap **parse → validate → match → commit** sudah benar di service layer; yang belum ada adalah titik panggil match (RC-5) dan keputusan eksekusi.

---

## 3. Dependency Review

### Jawaban pertanyaan 3 — Dependency yang seharusnya tidak ada

| Dependency | Ada? | Detail |
|-----------|------|--------|
| `RawWorkbook` (baca data mentah) | ✅ **TIDAK** (fungsional) / ⚠️ (tipe-level) | Engine hanya baca `.canonicalRows`; tapi param `match()` bertipe `ValidatedWorkbook` yang membungkus `rawWorkbook` — coupling API-surface |
| `WorkbookReaderService` | ✅ **TIDAK** | Engine tidak menyentuh reader |
| `ValidationEngineService` | ✅ **TIDAK** | Engine tidak memanggil validasi |
| UI Context / React | ✅ **TIDAK** | Engine murni TS, tanpa UI |
| `dummyMatchStrategies` (default constructor) | ⚠️ Ada | Default engine terkait dunia testing; produksi wajib menyuntik `createProductionStrategies()` — saat ini tidak ada yang menyuntikkannya |

**Kesimpulan:** Secara fungsional bersih. Satu-satunya ketidaksempurnaan adalah signature `match(validatedWorkbook)` yang membawa seluruh objek padahal hanya `canonicalRows` yang dipakai — akan menghambat bila WO-5 ingin stage match dipanggil dengan data yang sudah tipis (mis. kirim JSON lewat IPC). Rekomendasi: longgarkan ke `match(canonicalRows: CanonicalRow[])` (Catatan: ini bukan perbaikan sekarang — WO-4 read only).

---

## 4. Output Review

`MatchedWorkbook = { canonicalRows, matchedRows, matchingResult }`
- `canonicalRows`: passthrough input (baris valid dari validasi).
- `matchedRows[]`: per baris → `{ rowNumber, canonicalRow, matches: FieldMatch[], issues: [] }`.
- `matchingResult`: `{ valid: true, errors: [], warnings: [] }` — **hardcoded**.

### Jawaban pertanyaan 4 — Cukup untuk WO-5/6/7?

| Kebutuhan | Cukup? | Keterangan |
|-----------|--------|------------|
| WO-5 Auto Create — tahu entitas yang cocok (link) | ✅ Sebagian | `status FOUND` + `candidates[0].id` cukup untuk menautkan book→author/publisher/category yang sudah ada |
| WO-5 Auto Create — tahu entitas baru (create) | ✅ Sebagian | `status NOT_FOUND` + `canonicalRow.values[field]` cukup untuk create. **TAPI:** tidak ada sinyal eksplisit "create" — WO-5 harus menurunkan sendiri dari status |
| WO-5 — ambiguitas | ❌ **TIDAK** | `AMBIGUOUS` → banyak kandidat tanpa skor/peringkat; tidak ada kebijakan (skip? pilih pertama? blokir?). Deferred Sprint 8 RFC Q — belum ada solusi |
| WO-5 — validitas keseluruhan | ❌ **TIDAK** | `matchingResult.valid` selalu `true`, `errors/warnings` selalu kosong — konsumen tidak bisa mempercayainya |
| WO-5 — alasan per baris | ❌ **TIDAK** | `matchedRow.issues` selalu `[]`; konsumen harus meng-parse status sendiri |
| WO-6 Book Import (commit + transaksi) | ❌ **TIDAK** | Tidak ada layer commit/transaction; tidak ada tahap "import ke DB" |
| WO-7 BookCopy | ❌ **TIDAK** | Tidak ada kolom jumlah eksemplar di template; BookCopy tak dibahas di output match; barcode belum ada (WO berikutnya) |
| **Publisher** | ❌ **TIDAK** | Kunci `publisher` **tidak ada** di `canonicalRows` (template hanya: title, authors, year, category, isbn) → `ContainsPublisherStrategy` **selalu SKIPPED** di pipeline nyata. Book ter-import tanpa publisher |

**Catatan krusial:** Smoke test `scripts/smoke-match-strategies.ts:140-150` membangun `canonicalRows` **manual** yang menyertakan kunci `publisher` — menyembunyikan mismatch strategi↔template. Di pipeline riil (`ValidationEngineService.buildCanonicalRow`, `ValidationEngineService.ts:98-104`), kunci `publisher` tidak pernah dihasilkan.

---

## 5. Findings

**F-1 — Matching tidak ter-wire ke runtime (RC-5 belum dikerjakan).** 0 pemanggil di `src/`; tidak ada IPC channel import/match. WO-5 Auto Create tidak punya entry point.

**F-2 — Lokasi eksekusi produksi belum diputuskan.** Strategi produksi (`createProductionStrategies`) hidup di `src/main` (Prisma/main-process); engine di `src/services`. Import lintas boundary (renderer→main) akan kena TS6307. Kandidat: layanan baru di main-process yang memanggil engine + `createProductionStrategies()` dan diekspos via IPC.

**F-3 — `matchingResult` hardcoded.** `valid:true`, `errors/warnings:[]` (MatchingEngineService.ts:28-32) — tidak pernah mencerminkan status NOT_FOUND/AMBIGUOUS. Dead logic dari sisi konsumen.

**F-4 — `matchedRow.issues` selalu kosong.** Engine tidak mencatat isu per baris; field bertipe `MatchingIssue[]` tapi tak pernah diisi.

**F-5 — Publisher strategy mati di pipeline nyata.** Template tidak punya kolom publisher; `canonicalRows` tidak punya kunci `publisher`; smoke test menutupi ini dengan data manual.

**F-6 — Template field `title` tak pernah di-match.** Bukan bug (title = nilai untuk create Book), tapi perlu eksplisit agar WO-5 tahu.

**F-7 — Compatibility layer masih ada (dijadwalkan cleanup Sprint 9):**
- `MatchProvider.findMatches(value)` deprecated (transisi) + delegate di 8 provider (4 Dummy + 4 Prisma).
- `dummyMatchProviders` array (`DummyMatchProviders.ts:146`) — 0 konsumen.
- `createPrismaMatchProviders` deprecated (`main/providers/index.ts:12`) — 0 konsumen.
- `MatchProviders.ts` barrel re-export — indirection tipis.

**F-8 — Tidak ada scoring/peringkat kandidat.** `MatchCandidate = { id, label }` tanpa skor; `AMBIGUOUS` tak bisa di-resolve deterministik. Diketahui & ditunda sejak Sprint 8.

---

## 6. Risk Analysis

### Jawaban pertanyaan 6 — Risiko bila langsung lanjut ke WO-5 sekarang

| # | Risiko | Severitas | Dampak bila terlanjur |
|---|--------|-----------|----------------------|
| R1 | **Matching tidak ter-wire** (F-1) | **Tinggi** | WO-5 tidak punya titik panggil; pekerjaan dimulai tanpa jalur runtime; harus mundur ke RC-5 dulu |
| R2 | **Lokasi eksekusi belum ditentukan** (F-2) | **Tinggi** | Bila WO-5 dibangun di renderer dengan asumsi engine bisa panggil strategi Prisma → TS6307/runtime; bila di main tanpa engine → duplikasi logika |
| R3 | **`matchingResult.valid` menyesatkan** (F-3) | **Sedang** | WO-5 yang memercayai `valid` akan auto-create baris yang sebenarnya NOT_FOUND/AMBIGUOUS tanpa jejak keputusan |
| R4 | **AMBIGUOUS tanpa skor** (F-8) | **Sedang** | Auto-create tidak deterministik; perlu kebijakan baru (skip/blokir/pilih pertama) yang belum disetujui PO |
| R5 | **Publisher tak dapat di-resolve/dibuat** (F-5) | **Sedang** | Semua buku ter-import tanpa publisher; atau butuh perubahan template (keputusan PO) |
| R6 | **Multi-author sebagai satu string** | **Sedang** | `authors: "Andrea Hirata; Tere Liye"` di-match sebagai satu string (contains) → false positive; auto-create membuat 1 entitas author utuh untuk gabungan |
| R7 | **Tidak ada lapisan commit/transaksi** | **Sedang** | WO-6 (Book Import) harus membangun transaksi book+author+publisher+category dari nol; WO-5 yang tidak transaksional bisa tinggalkan data parsial |
| R8 | **BookCopy tanpa jumlah** | **Rendah** | WO-7 terpaksa default 1 eksemplar; tidak ada kolom jumlah di template |
| R9 | **Compatibility layer** (F-7) | **Rendah** | Kebisingan, bukan blocker; cleanup terjadwal |

**Ringkas:** Risiko utama bukan di dalam engine (strukturnya sehat), melainkan **tidak adanya wiring + lokasi eksekusi + kontrak output yang belum kaya** (scoring, matchingResult realistis, issues per baris, publisher).

---

## 7. Recommendation

1. **Sebelum WO-5**, selesaikan **RC-5 (wiring) + keputusan lokasi eksekusi**: buat entry point matching di **main process** (layanan import yang memanggil engine + `createProductionStrategies()`, diekspos via IPC mis. `imports:match`), dengan renderer mengirim `canonicalRows` dan menerima `MatchedWorkbook`. Ini sekaligus menyelesaikan F-1/F-2.
2. **Perkaya kontrak output** sebelum auto-create memakainya: (a) `matchingResult` diisi dari status nyata, (b) `matchedRow.issues` diisi untuk NOT_FOUND/AMBIGUOUS, (c) kebijakan AMBIGUOUS (skip/blokir) — keputusan PO, opsi scoring bisa ditunda RFC terpisah (konsisten Sprint 8).
3. **Selesaikan mismatch publisher** (F-5): pilih salah satu — tambah kolom publisher ke template **atau** keluarkan strategy publisher. Keputusan PO; template = konfigurasi, bukan kode.
4. **Selesaikan multi-author** (R6) dengan kebijakan pemisah (mis. `;`) di WO-5.
5. **Cleanup compatibility layer** (F-7) tetap di jadwal sprint — bukan blocker WO-5.
6. Decoupling signature engine (`match(canonicalRows)` saja) dapat dilakukan bersamaan wiring WO-5, bukan sekarang (read only).

**Kesimpulan:** Engine matching **sehat secara struktur dan input sudah benar** (canonicalRows). Belum siap WO-5 karena **belum ter-wire, tanpa skor/ambiguity policy, publisher mati, dan output `matchingResult` menyesatkan**. Prioritas: wiring + lokasi eksekusi dulu.

---

**Status: READY untuk review.** Mode read only — tidak ada perubahan kode. Menunggu keputusan Product Owner.
