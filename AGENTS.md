# APLibrary — Session Summary

## Completed Work Orders

### WO-001: Project Restructuring
- Restructured to `electron/` + `src/` layout
- IPC split into 9 domain files; `any` removed; `bootstrap.ts` created
- Preload split into 9 domain files; `index.ts` as aggregator

### WO-002: Prisma Schema
- 11 models; rejected initial version (PO objected to removing Author/Publisher/Category)
- Restored all removed models

### WO-003: Repository Infrastructure
- Base repository + 11 domain repositories

### WO-004: Member Service Layer
- Service, NumberGeneratorService, DTO, IPC, preload, bootstrap, env.d.ts
- Business rules: status INACTIVE default, borrow history check before delete, uniqueness

### WO-005: Academic Service Layer
- AcademicYear, Curriculum, Class services; IPC; preload; bootstrap; env.d.ts

### WO-006: Borrow Service Layer (New Stack)
- `borrow.service.ts`, `borrow.repository.ts` (with `createWithItems` transactional), `borrow-detail.repository.ts`
- IPC, preload, bootstrap updates
- MAX_BOOKS=20 hardcoded (Technical Debt)

### WO-006A: Member UI Integration
- MembersPage, MemberForm, MemberEditPage
- Server-side pagination, search, delete with borrow-history check

### WO-006B: Fix Member Create (BLOCKER)
- Root cause: schema/DB column mismatch (`memberNumber`→`number`, `birthPlace`→`birthplace`)
- Fixed with `@map` + `prisma db push`

### Schema Normalization Audit
- Full drift analysis: 6 orphaned migrations, 5 `db push` tables, `@map` bridges
- Two-migration plan: M7 (baseline record) + M8 (remove `@map`)

### WO-006C: Member Navigation Redesign
- Collapsible Anggota sidebar (Siswa/Guru/Umum), 3 routes, MemberListPage
- Filtering moved from React → backend (Repository/Service/IPC)
- STAFF→GENERAL rename across all layers
- Case bug fixed (STUDENT→student) in route props

### WO-007: Borrowing Module Audit (COMPLETE)
See full report below.

---

## WO-007: Borrowing Module — Discovery & Architecture Audit — LENGKAP

## 1. RUANG LINGKUP
Audit menyeluruh terhadap Borrowing Module: Prisma schema, Repository, Service, IPC, Preload, UI Pages, Routes, Sidebar, DTO, env.d.ts.

## 2. ARSITEKTUR — DUA STACK PARALEL

### STACK A (BARU — `src/main/`)
| Layer | File | Model Prisma |
|-------|------|-------------|
| Service | `src/main/services/borrow.service.ts` | `Borrow`, `BorrowDetail` |
| Repository | `src/main/repositories/borrow.repository.ts` | `Borrow` |
| Repository | `src/main/repositories/borrow-detail.repository.ts` | `BorrowDetail` |

### STACK B (LEGACY — `electron/main/`)
| Layer | File | Model Prisma |
|-------|------|-------------|
| Service | `electron/main/services/borrowing.service.ts` | `Borrowing`, `BorrowingItem`, `Return` |
| Service | `electron/main/services/return.service.ts` | `Borrowing`, `BorrowingItem`, `Return` |
| Service | `electron/main/services/print.service.ts` | `Borrowing` |
| Repository | `electron/main/repositories/borrowing.repository.ts` | `Borrowing` |
| Repository | `electron/main/repositories/borrowing-item.repository.ts` | `BorrowingItem`, `Borrowing` |
| Repository | `electron/main/repositories/return.repository.ts` | `Return`, `BorrowingItem`, `Borrowing` |

**CRITICAL:** Stack B mereferensi model Prisma (`Borrowing`, `BorrowingItem`, `Return`) yang **TIDAK ADA** di `schema.prisma` saat ini. Hanya `Borrow` dan `BorrowDetail` yang ada.

## 3. PRODUCTION FLOW STATUS

| Feature | Status | Root Cause |
|---------|--------|------------|
| Create Borrow | **WORKING** | Stack A (baru) |
| Barcode Scan (create) | **WORKING** | Akses `BookCopy` yang ADA di schema |
| Member Search (create) | **BROKEN** | Tidak ada IPC handler `members:search` |
| Member Stats (create) | **BROKEN** | Legacy reference ke `borrowingItem`/`borrowing` |
| Borrow Listing | **NO UI** | Handler ada, page tidak ada |
| Borrow Detail | **NO UI** | Handler ada, page tidak ada |
| Return by Barcode | **BROKEN** | Legacy reference ke `borrowingItem`/`borrowing` |
| Return Book | **BROKEN** | Legacy reference ke `borrowingItem`/`borrowing`/`return` |
| Print Borrow Receipt | **BROKEN** | Legacy reference ke `borrowing` |
| Print Return Receipt | **BROKEN** | Legacy reference ke `borrowing` |

## 4. LEGACY AUDIT

### BorrowService (`src/main/services/borrow.service.ts`)
- **Digunakan:** YA — Production flow (create, findMany, findById)
- **Duplicate:** Ya — BorrowingService (legacy) adalah duplikat dengan schema salah
- **Rekomendasi: PERTAHANKAN**

### BorrowingService (`electron/main/services/borrowing.service.ts`)
- **Digunakan:** SEBAGIAN — hanya `findBookCopyByBarcode()` dipakai
- **Dead code:** Method `getAll`, `getById`, `create` tidak dipanggil
- **Duplicate:** Ya — BorrowService adalah pengganti
- **Rekomendasi: HAPUS** — pindahkan `findBookCopyByBarcode` ke service lain

### BorrowRepository (`src/main/repositories/borrow.repository.ts`)
- **Digunakan:** YA — oleh BorrowService (baru)
- **Duplicate:** Ya — BorrowingRepository
- **Rekomendasi: PERTAHANKAN**

### BorrowingRepository (`electron/main/repositories/borrowing.repository.ts`)
- **Digunakan:** YA — oleh BorrowingService, ReturnService, PrintService
- **Akan RUNTIME ERROR** karena model `Borrowing` tidak ada di schema
- **Rekomendasi: HAPUS**

### BorrowDetailRepository (`src/main/repositories/borrow-detail.repository.ts`)
- **Digunakan:** YA — oleh BorrowService (baru)
- **Rekomendasi: PERTAHANKAN**

### BorrowingItemRepository (`electron/main/repositories/borrowing-item.repository.ts`)
- **Digunakan:** YA — oleh ReturnService, BorrowingService, langsung dari IPC (`getMemberBorrowingStats`)
- **Akan RUNTIME ERROR** karena model `BorrowingItem`/`Borrowing` tidak ada
- **Rekomendasi: HAPUS** — pindahkan method yang diperlukan ke BorrowDetailRepository

### ReturnService (`electron/main/services/return.service.ts`)
- **Digunakan:** YA — Return flow (`findByBarcode`, `returnBook`)
- **Akan RUNTIME ERROR**
- **Rekomendasi: HAPUS** — buat ReturnService baru di `src/main/services/`

### ReturnRepository (`electron/main/repositories/return.repository.ts`)
- **Digunakan:** YA — oleh ReturnService
- **Akan RUNTIME ERROR**
- **Rekomendasi: HAPUS** — buat ReturnRepository baru di `src/main/repositories/`

## 5. TEMUAN TAMBAHAN

### 5.1 `members:search` — Missing IPC Handler
- `BorrowingsPage.tsx:53` memanggil `window.electronAPI.members.search(query)`
- Tidak ada handler, preload method, atau type definition
- Runtime error saat user mencari anggota di form peminjaman

### 5.2 `PrintService` — Dual Dependency
- Bergantung pada `BorrowingRepository` (legacy, broken)
- Perlu diport ke Stack A menggunakan `BorrowRepository`

### 5.3 Legacy `MemberRepository` (`electron/main/repositories/member.repository.ts`)
- Hanya punya `findById`, `update`, `search`
- Digunakan oleh `BorrowingService` (legacy) — akan ikut terhapus saat Stack B dibersihkan

## 6. REKOMENDASI WORK ORDER

### Prioritas 1 (BLOCKER)
| WO | Deskripsi |
|----|-----------|
| WO-007A | Buat `members:search` IPC handler, preload, env.d.ts |
| WO-007B | Buat `ReturnService` + `ReturnRepository` baru di `src/main/`, port return flow |
| WO-007C | Port `getMemberBorrowingStats` ke `BorrowDetailRepository` |
| WO-007D | Port `PrintService` ke `BorrowRepository` (baru) |

### Prioritas 2 (Fungsional)
| WO | Deskripsi |
|----|-----------|
| WO-007E | Buat Borrow Listing page |
| WO-007F | Buat Borrow Detail page |
| WO-007G | Pindahkan `findBookCopyByBarcode` ke `BookCopyService`/`BorrowService` |

### Prioritas 3 (Housekeeping)
| WO | Deskripsi |
|----|-----------|
| WO-007H | Hapus Stack B: seluruh legacy borrowing services + repositories |
| WO-007I | Hapus legacy `member.repository.ts` jika sudah tidak digunakan |
| WO-007J | Cleanup `bootstrap.ts` — hapus instantiasi legacy borrowing classes |

## 7. KESIMPULAN
**Module tidak production-ready.** 9 production flows: 2 bekerja, 3 broken, 1 partial broken, 2 tanpa UI. Root cause: Stack B mempertahankan referensi ke model Prisma yang sudah dihapus dari schema.

---

## WO-PV-01: ADR-002 Migration Recovery Implementation (COMPLETE)

### Ringkasan
- ADR-002 disetujui (Strategi C+D: squash baseline + governance) menggantikan Strategi A yang sempat diimplementasikan.
- **Pekerjaan 1 — Migration Recovery (DONE):**
  - 11 migration lama (termasuk 2 no-op REPAIR + `20260731_pv01_schema_baseline`) di-archive ke `prisma/migrations_archive/` sebagai dokumentasi.
  - Baseline tunggal `prisma/migrations/20260731_adr002_initial/migration.sql` (296 baris) di-generate resmi via `prisma migrate diff --from-empty --to-schema-datamodel --script`.
  - Fresh DB `migrate deploy` PASS; `migrate diff` = "No difference detected" (replay & datasource); `migrate status` = up to date.
  - Dev DB di-reconcile hanya via mekanisme resmi `prisma migrate resolve --applied` — TIDAK ada perubahan manual checksum `_prisma_migrations`. Checksum baseline baru match dengan file (hash dihitung Prisma). 11 record lama tetap ada sebagai riwayat (folder sudah tidak aktif).
- **Pekerjaan 2 — Member Detail (DONE):** `src/pages/MemberDetailPage.tsx` memakai data real (`api.members.findById`, `api.borrowings.findMany`, `api.borrowings.getMemberBorrowingStats`); `MOCK_MEMBER` 0 match di seluruh `src/`.
- **Validation:** `npm run lint` PASS, `npm run build` PASS.
- **Regression:** seeded smoke test pada fresh baseline DB PASS (findById+classInfo, borrowings search/findById/stats, returns findByBarcode/returnBook, stats turun ke 0). DB uji dibersihkan.
- **Status: READY.**

### Pelajaran (retain)
- Field Prisma ter-map: `memberNumber`/`borrowNumber` (bukan `number`); smoke seed wajib pakai `memberNumber`.
- `prisma/migrations/` di-gitignore; `prisma/migrations_archive/` TIDAK tercakup pola gitignore (jika nanti commit, perlu pola tambahan).
- Squash baseline: arsipkan folder lama → generate `--from-empty` baseline → `migrate resolve --applied` (dev yang sudah ada schema final) → status hijau. Fresh deploy hanya 1 migration.
