# REPORT R-6 — DISCOVERY: Laporan Koleksi Buku

## Status: DISCOVERY APPROVED — 4 keputusan PO diterima (2026-08-05), implementasi dimulai

## 1. Ringkasan
Audit read-only untuk menyusun **Laporan Koleksi Buku** (R-6) di atas fondasi Report Module yang sudah disetujui (R-1..R-5). Laporan Koleksi Buku adalah **satu-satunya laporan yang sudah memiliki backend penuh sejak R-1** (`CollectionReportDTO`, `findBookReportRows`, `getCollectionSummary`, channel `reports:collections`), tetapi **belum pernah dibuat UI-nya** (ReportsPage baru 4 kartu; kartu Koleksi belum ada).

Temuan inti: **semua kolom yang diminta PO tersedia di domain** — namun dengan **3 catatan penting**:
1. Per-baris breakdown `Sedang Dipinjam / Tersedia / Rusak / Hilang` **BELUM ada** di DTO R-1 (baris hanya `copyCount`).
2. **Kosakata "Rusak" tidak ada** di `BookCopy.condition` (nilai: `GOOD | LIGHT_DAMAGE | HEAVY_DAMAGE`); tidak ada nilai `RUSAK`/`BAD`.
3. **Status dan kondisi adalah dua dimensi ORTOGONAL** — satu eksemplar bisa `BORROWED` sekaligus rusak. Kolom target tidak saling lepas (overlap).

## 2. Ruang Lingkup Audit (READ-ONLY)
| # | Item | Sumber |
|---|------|--------|
| 1 | Struktur tabel `Book` | `prisma/schema.prisma` (model `Book`) |
| 2 | Struktur tabel `BookCopy` (status/kondisi) | `prisma/schema.prisma` + `src/shared/config/book-copy-status.ts` + `electron/main/shared/book-copy-condition.ts` |
| 3 | Fondasi laporan yang sudah ada | `src/shared/dto/report.ts`, `src/main/repositories/report.repository.ts`, `src/main/services/report.service.ts`, `electron/ipc/report.ipc.ts` |
| 4 | Audit data dev DB | query read-only `prisma/aplibrary.db` |
| 5 | Riwayat keputusan | IT-1 (status), WO13 (pengadaan), R-1 (fondasi laporan) |

## 3. Audit Model `Book` (schema.prisma:193)
| Field | Tipe | Nullable | Relevansi laporan |
|-------|------|----------|-------------------|
| `isbn` | String | YES (@unique) | Kolom **ISBN** — opsional, bisa null |
| `title` | String | NO | Kolom **Judul** |
| `authorId` | String? → `Author.name` | YES | Kolom **Pengarang** |
| `publisherId` | String? → `Publisher.name` | YES | Kolom **Penerbit** |
| `categoryId` | String? → `Category.name` | YES | Kolom **Kategori** + filter |
| `publicationYear` | Int | YES | Kolom **Tahun** |
| `description` | String? | YES | tidak dipakai laporan |
| `createdAt/updatedAt` | DateTime | — | tidak relevan |

Semua relasi (author/publisher/category) opsional — buku bisa tanpa pengarang/penerbit/kategori.

## 4. Audit Model `BookCopy` — Sumber "Jumlah Eksemplar" dan status
`Book.bookCopies` (relasi 1-N) = **Jumlah Eksemplar** per judul (SSOT: hitung `BookCopy`).

### 4.1 `BookCopy.status` (schema:220, default `"AVAILABLE"`)
SSOT status = `src/shared/config/book-copy-status.ts` (IT-1, single authority):
- `AVAILABLE` → kolom **Tersedia**
- `BORROWED` → kolom **Sedang Dipinjam**
- `LOST` → kolom **Hilang** (IT-1: return `HILANG` → status `LOST`)
- `REMOVED` → eksemplar didekomision; **tidak punya kolom target** (lihat G-5)

Transisi dijamin atomic via guarded `updateMany` (IT-1: `createWithItems`, `processReturn`, `decommissionCopy`) → status BORROWED adalah otoritas "sedang dipinjam".

### 4.2 `BookCopy.condition` (schema:219, default `"GOOD"`)
SSOT kondisi = `electron/main/shared/book-copy-condition.ts` (legacy config):
- `GOOD`, `LIGHT_DAMAGE`, `HEAVY_DAMAGE` — **TIDAK ada nilai `RUSAK`/`BAD`**.

Fakta penting:
- Kondisi hanya di-set **saat pembuatan eksemplar** (`addCopies`, dialog "Tambah Eksemplar"). Jalur update kondisi (`BookCopyRepository.updateCondition`) **tidak diekspos ke IPC/UI** (debt tercatat IT-1 & PRA_INVENTORY GAP-006).
- Kosakata `BAIK/RUSAK/HILANG` (`conditionBack` di `BorrowDetail`, R-3) adalah **snapshot saat pengembalian** — berbeda domain, TIDAK boleh dicampur dengan `BookCopy.condition`.

## 5. Mapping Kolom Target → Sumber Data
| Kolom (target PO) | Sumber | Status |
|-------------------|--------|--------|
| ISBN | `Book.isbn` | Tersedia (nullable) |
| Judul | `Book.title` | Tersedia |
| Kategori | `Book.category.name` | Tersedia (nullable) |
| Pengarang | `Book.author.name` | Tersedia (nullable) |
| Penerbit | `Book.publisher.name` | Tersedia (nullable) |
| Tahun | `Book.publicationYear` | Tersedia (nullable) |
| Jumlah Eksemplar | count `BookCopy` per `Book` (relasi) | Tersedia — sudah `copyCount` di R-1 |
| Sedang Dipinjam | count `BookCopy` dgn `status = BORROWED` | Data tersedia; **belum di row DTO** (G-1) |
| Tersedia | count `BookCopy` dgn `status = AVAILABLE` | Data tersedia; **belum di row DTO** (G-1) |
| Rusak | **TIDAK ADA nilai `RUSAK`** di `BookCopy.condition`; terdekat: `LIGHT_DAMAGE`/`HEAVY_DAMAGE` | **GAP** (G-2) |
| Hilang | count `BookCopy` dgn `status = LOST` | Data tersedia; **belum di row DTO** (G-1) |

## 6. Fondasi R-1 yang Sudah Ada (yang akan dipakai, TANPA refactor)
| Item | Lokasi | Konten |
|------|--------|--------|
| `CollectionReportFilter` | `report.ts:216` | `categoryId?`, `search?`, `page?`, `limit?` |
| `CollectionReportRowDTO` | `report.ts:223` | `isbn, title, authorName, publisherName, categoryName, publicationYear, copyCount` |
| `CollectionReportSummaryDTO` | `report.ts:243` | `totalTitles, totalCopies, totalAssetValue, byStatus, byCondition` (groupBy status & kondisi) |
| `findBookReportRows` | `report.repository.ts:501` | pagination `getPaginationParams`, order `title asc`, **search hanya `title contains`** |
| `getCollectionSummary` | `report.repository.ts:522` | `count`/`aggregate SUM(acquisitionCost)`/`groupBy` — **anti-pola B1 sudah dihindari** |
| `getCollectionReport` | `report.service.ts:312` | gabung rows + summary → DTO |
| Channel IPC | `report.ipc.ts:9` | `reports:collections` **sudah ada** → tanpa wiring baru |

## 7. Audit Data Dev DB (read-only, prisma/aplibrary.db)
| Ukuran | Nilai |
|--------|-------|
| Buku | 2 |
| Eksemplar | 26 |
| Status | AVAILABLE 24 · BORROWED 2 · LOST 0 · REMOVED 0 |
| Kondisi | GOOD 26 · LIGHT_DAMAGE 0 · HEAVY_DAMAGE 0 |
| ISBN null | 0 |
| Pengarang null | **1** (1 buku tanpa author) |
| Kategori null | 0 |
| Penerbit null | 0 |
| Tahun null | 0 |

## 8. GAP & KEPUTUSAN YANG DIBUTUHKAN PO
### G-1 (PASTI DIBUTUHKAN — tidak bisa dihindari)
**Row DTO R-1 hanya `copyCount`; kolom per-barris `Sedang Dipinjam / Tersedia / Rusak / Hilang` belum ada.**
→ Perlu ekstensi **aditif** `CollectionReportRowDTO` (+`borrowedCount`, +`availableCount`, +`lostCount`, dan kondisi per G-2) + per-row agregasi di repository (groupBy/`_count` berpredikat — bukan fetch-all, anti-pola B1).

### G-2 (BUTUH KEPUTUSAN PO) — Definisi "Rusak"
`BookCopy.condition` TIDAK punya nilai `RUSAK`. Dua opsi:
- **(a)** Kolom "Rusak" = count `condition ∈ {LIGHT_DAMAGE, HEAVY_DAMAGE}` (nilai yang ADA di schema; label "Rusak Ringan"/"Rusak Berat" sudah dipakai Inventory UI).
- **(b)** Ubah domain (nilai/kolom baru) — **DI LUAR SCOPE** R-6 (laporan, tanpa schema/migration).

**Catatan kualitas data:** kondisi hanya di-set saat pembuatan; tanpa jalur update → nilai "Rusak" mencerminkan kondisi awal, bukan kondisi terkini (bisa basi). Data dev saat ini 100% GOOD.

### G-3 (DOKUMENTASI, bukan blokir) — Dua kosakata kondisi
`conditionBack` (`BAIK/RUSAK/HILANG`, snapshot pengembalian R-3) ≠ `BookCopy.condition` (`GOOD/LIGHT_DAMAGE/HEAVY_DAMAGE`). **Jangan dicampur.** "Rusak" pada laporan koleksi = dimensi `BookCopy.condition`; status `HILANG` saat return sudah direfleksikan ke `status LOST` (IT-1).

### G-4 (BUTUH KEPUTUSAN PO) — "Jumlah Eksemplar" vs REMOVED
R-1 `totalCopies` = **SEMUA** BookCopy (termasuk `REMOVED` dan `LOST`). Apakah kolom "Jumlah Eksemplar":
- **(a)** = semua eksemplar (termasuk REMOVED/LOST) — konsisten R-1; atau
- **(b)** = hanya eksemplar non-REMOVED.
Rekomendasi: **(a)** — `REMOVED` adalah artefak dekomision dan langka; `LOST` tetap "eksemplar" (tampil di kolom Hilang). Perlu konfirmasi PO.

### G-5 (BUTUH KEPUTUSAN PO) — Overlap dimensi status × kondisi
Status dan kondisi **ortogonal**: eksemplar `BORROWED` bisa juga rusak; eksemplar `LOST` bisa juga rusak. Akibatnya `Tersedia + Sedang Dipinjam + Hilang + Rusak` **TIDAK dijamin sama dengan Jumlah Eksemplar** (overlap Rusak dengan 3 kolom lainnya; `REMOVED` tak masuk kolom mana pun). Opsi:
- **(a)** Kolom dihitung **per dimensi terpisah** (boleh overlap) — nilai jujur, konsisten SSOT status/condition.
- **(b)** Buat kategori **eksklusif** (prioritas: Hilang → Sedang Dipinjam → Rusak → Tersedia) — jumlah pasti = total, tapi menyembunyikan fakta.
Rekomendasi: **(a)** — laporan mencerminkan fakta; ringkasan tetap pakai `byStatus`/`byCondition` R-1 yang memang per-dimensi.

### G-6 (OPSIONAL — keputusan PO) — Search & filter
R-1 `findBookReportRows` **search hanya judul** (`title contains`), filter hanya `categoryId`. Bila PO ingin pencarian ISBN/pengarang/penerbit (pola R-2/R-3/R-4), ekstensi aditif `CollectionReportFilter.search` → builder `OR` di repository. Tanpa keputusan PO, R-6 memakai kontrak R-1 apa adanya.

## 9. Rekomendasi (tanpa implementasi)
1. Ekstensi **aditif** `CollectionReportRowDTO`: `borrowedCount`, `availableCount`, `lostCount` (+ `damagedCount` bila PO pilih G-2a).
2. Per-row agregasi via `_count` berpredikat / groupBy (anti-pola B1), mirror pola R-5 (`buildMemberReportWhere`).
3. UI baru `CollectionReportPage.tsx` + kartu "Laporan Koleksi Buku" di `ReportsPage.tsx` + route + nav + labels — konsisten R-2..R-5, channel `reports:collections` reused.
4. Keputusan G-2, G-4, G-5 (dan G-6 bila diinginkan) **sebelum implementasi**.

## 10. KEPUTUSAN PO (DISETUJUI 2026-08-05)
| ID | Pertanyaan | Keputusan PO |
|----|-----------|--------------|
| G-2 | "Rusak" = `LIGHT_DAMAGE`+`HEAVY_DAMAGE`? | **YA** — kolom "Rusak" = count `condition ∈ {LIGHT_DAMAGE, HEAVY_DAMAGE}`, tanpa migration |
| G-4 | "Jumlah Eksemplar" = semua BookCopy? | **TIDAK** — **Non-REMOVED saja**: `copyCount` & `totalCopies` menghitung `status != REMOVED` |
| G-5 | Status × kondisi boleh overlap? | **YA** — per dimensi (boleh overlap); ringkasan pakai `byStatus`/`byCondition` R-1 |
| G-6 | Search ditambah ISBN/pengarang/penerbit? | **YA** — search `OR` memakai relasi author/publisher + `isbn` (tidak hanya title) |

## 11. Status
**DISCOVERY APPROVED — implementasi R-6 SELESAI.** 4 keputusan PO diterapkan; lihat `WORK_ORDER_REPORT_R6_IMPLEMENTATION.md` untuk laporan implementasi & validation.
