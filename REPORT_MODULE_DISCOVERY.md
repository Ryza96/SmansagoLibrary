# REPORT MODULE — DISCOVERY REPORT (v1.0)

| | |
|---|---|
| Mode | **DISCOVERY — READ ONLY** |
| Peran | Product Owner ↔ Project Engineer |
| Tanggal | 2026-08-05 |
| Status | **APPROVED — keputusan PO tercatat di §4/§11** |
| Output | `REPORT_MODULE_DISCOVERY.md` (ini) |

> **TIDAK** ada perubahan kode, commit, migration, schema, UI, atau Service yang dibuat oleh laporan ini.

### 0.1 KEPUTUSAN PRODUCT OWNER (2026-08-05)

| # | Pertanyaan | Keputusan PO |
|---|---|---|
| K1 (Gap #1 Petugas) | Perlakuan kolom Petugas | **Kolom "Petugas" DIHAPUS dari desain laporan v1.0.** Tidak ada sistem user. Jika multi-user dibutuhkan, kolom ditambahkan di versi berikutnya. `Setting.librarianName`/`reportSigner` HANYA untuk **tanda tangan laporan**, bukan data transaksi. |
| K2 (Gap #2 Denda) | Perlakuan denda | **Tanpa nominal denda.** Laporan Keterlambatan menampilkan status (masih/pernah terlambat) + jumlah hari keterlambatan. Engine denda = WO masa depan. |

Keputusan ini menjadikan **R-1..R-7 TANPA perubahan schema/migration** (confirms §11).

---

## 0. Ringkasan Eksekutif

1. **Enam (6) laporan v1.0 dapat dibangun TANPA mengubah schema database.** Seluruh data inti tersedia di model `Borrow`, `BorrowDetail`, `Member`, `MemberEnrollment`, `Book`, `BookCopy`, `PromotionRun`, `PromotionRunItem`.
2. **Satu gap fungsional:** kolom **Petugas** per transaksi peminjaman/pengembalian **TIDAK ADA** — aplikasi tidak punya model User/login, `Borrow`/`BorrowDetail` tidak punya `createdBy`/`processedBy`. Ketersediaan opsi di bawah Gap #1.
3. **Satu gap turunan:** **nominal denda** pada Laporan Keterlambatan tidak dapat dihitung (tidak ada engine denda; `BorrowingItemDetailDTO.fine` selalu `null`). Keterlambatan (status + jumlah hari) tersedia.
4. **TIDAK diperlukan tabel baru.** **TIDAK wajib migration** untuk v1.0. Opsional: index tanggal untuk skala besar (lihat Performa).
5. **Arsitektur rekomendasi:** **SATU `ReportRepository`** (query agregat khusus laporan, extends `BaseRepository`) + **`ReportService`** (orkestrasi + DTO) → IPC → Renderer, memakai **stack baru (`src/main/`, satu PrismaClient)**. Repository domain existing TIDAK diubah; label/mapping yang sudah jadi (mis. `classInfoFrom`, `PromotionRunService`) di-*reuse* via Service.
6. **Volume data saat ini kecil** (3 peminjaman, 395 anggota, 26 eksemplar) — query laporan aman secara performa. Rekomendasi index hanyalah langkah skala-ke-depan.

---

## 1. Metodologi

Audit read-only atas:
- `prisma/schema.prisma` (seluruh 17 model)
- Stack baru `src/main/repositories/` + `src/main/services/` + `src/shared/dto/`
- Stack legacy `electron/main/services/` + `electron/main/repositories/` + `electron/ipc/` + `electron/preload/`
- Kontrak renderer `src/renderer/env.d.ts`, `src/routes/index.tsx`, `src/pages/ReportsPage.tsx`
- Konfigurasi domain `src/shared/config/*` (member-type, academic-status, book-copy-status)
- Data nyata DB dev `prisma/aplibrary.db` (hitung per tabel untuk audit performa)

**Catatan kritis — DUA PrismaClient:** aplikasi memiliki dua instance Prisma yang menunjuk ke file SQLite yang sama:
- Legacy: `electron/main/database.ts` → `prisma` (dipakai `AssetEventRepository`, layanan legacy).
- Baru: `src/main/repositories/base/prisma.ts` → `getPrisma()` (seluruh repository di `src/main/`).
Keputusan IT-1 telah memindahkan otoritas status ke stack baru. **Report Wajib memakai `getPrisma()` (satu client).** Jangan memakai `electron/main/database.ts` untuk laporan.

---

## 2. Inventarisasi Data per Domain

### 2.1 Domain BORROW

**Data tersedia** (`Borrow` + `BorrowDetail`):
- `borrowNumber` (Nomor Transaksi, unik) · `borrowDate` · `dueDate` · `returnDate` (null = aktif)
- Snapshot anggota: `memberName`, `memberNumber`, `className` (diisi saat create dari Enrollment ACTIVE; `null` untuk Guru/Umum — by design snapshot)
- `notes`
- Per-buku (`BorrowDetail`): `bookCopyId`, `bookTitle` (snapshot), `returnedAt`, `conditionBack`, `note`
- Relasi: `member`, `details.bookCopy.book` (judul terkini)

**Repository (sumber data):**
- `src/main/repositories/borrow.repository.ts` — `findById` (full include), `findMany` (search+pagination), `createWithItems`, `processReturn`, `getLastBorrowNumber`, `count`, `getNearestDueDateByMemberId`
- `src/main/repositories/borrow-detail.repository.ts` — `findByBorrow`, `findByBookCopy`, `countActiveByMemberId`, `findActiveByBookCopyId`, `count`

**Service:**
- `src/main/services/borrow.service.ts` — `create`, `findById`, `findMany`
- `src/main/services/return.service.ts` — `findBorrowingByBarcode`, `returnBook`

**Cukup untuk laporan?** YA, kecuali kolom **Petugas** (Gap #1) dan status **OVERDUE** yang bersifat turunan (komputasi `returnDate=null && dueDate<today`), bukan kolom.

**Perlu query baru?** YA — filter **rentang tanggal** (`borrowDate` antara), filter status (AKTIF/SELESAI/TERLAMBAT), dan ekspor penuh. `findMany` existing hanya search + pagination (limit clamp 100, lihat Gap #5).

### 2.2 Domain RETURN

**Data tersedia:**
- **Tidak ada model `Return`.** Pengembalian = mutasi pada data peminjaman:
  - Per-buku: `BorrowDetail.returnedAt`, `BorrowDetail.conditionBack` (`BAIK`/`RUSAK`/`HILANG`), `BorrowDetail.note`
  - Transaksi (semua buku kembali): `Borrow.returnDate`
  - Status eksemplar hasil kembali: `BookCopy.status` (AVAILABLE / LOST saat `conditionBack='HILANG'`)
- Semua konteks peminjaman tersedia via relasi `detail.borrow` + `detail.bookCopy.book`

**Repository:** `BorrowRepository.processReturn` (menulis), `BorrowDetailRepository` (membaca).

**Service:** `ReturnService` (barcode + return). Tidak ada service "daftar pengembalian" — **gap query**.

**Cukup untuk laporan?** YA untuk data pengembalian per-buku (tanggal kembali, kondisi, buku, anggota, nomor transaksi). **Petugas** tidak tersedia (Gap #1).

**Perlu query baru?** YA — daftar detail dengan `returnedAt` pada rentang tanggal + join `borrow` (member, dueDate, borrowNumber) + `bookCopy.book` (judul). Tidak ada endpoint existing yang mengembalikan "daftar pengembalian".

### 2.3 Domain MEMBER

**Data tersedia** (`Member` + `MemberEnrollment` + `Class` + `AcademicYear`):
- `memberNumber` · `fullName` · `memberType` (SISWA/GURU/UMUM) · `gender` · `nisn`/`nip`/`nuptk`/`nik` · `birthPlace`/`birthDate` · `address` · `phone` · `email` · `status` (ACTIVE/INACTIVE) · `createdAt`
- Kelas (SSOT = `MemberEnrollment` ACTIVE): `educationLevel`, `parallel`, `curriculum`, `academicYear` — di-map ke `MemberDTO.classInfo` (MEMBER CLASS DISPLAY)
- Riwayat penempatan: `MemberEnrollment.status` (7 status akademik) + `enrolledAt`/`leftAt`

**Repository:** `MemberRepository`, `EnrollmentRepository`, `ClassRepository`, `AcademicYearRepository`.

**Service:** `MemberService` (findMany/findById/create/update/delete), `EnrollmentService` (enroll/close/repoint/historyByMember/findActiveByMember).

**Cukup untuk laporan?** YA. Daftar anggota + kelas + status; rekap per kelas/tahun (dari enrollment) juga tersedia.

**Perlu query baru?** YA opsional — agregasi jumlah anggota per tipe/kelas/tahun untuk ringkasan; endpoint existing `members.findMany` sudah punya filter `memberType` + search tapi tanpa filter tahun/kelas dan paginated.

### 2.4 Domain BOOK

**Data tersedia** (`Book` + `Author` + `Publisher` + `Category`):
- `isbn` · `title` · `author` · `publisher` · `category` · `publicationYear` · `description`
- Jumlah eksemplar per judul = `BookCopy` (relasi)

**Repository:** `BookRepository` (findById/findMany/findAll/count), `AuthorRepository`, `PublisherRepository`, `CategoryRepository`.

**Service:** `BookService` (legacy), `BookImportService`, `BookCopyService` (src/main).

**Cukup untuk laporan?** YA.

**Perlu query baru?** YA opsional — agregasi jumlah judul per kategori/penerbit/tahun terbit; `BookRepository.findMany` tidak punya `groupBy`.

### 2.5 Domain INVENTORY (BookCopy)

**Data tersedia** (`BookCopy` + `AssetEvent`):
- `inventoryNumber` · `barcode` · `condition` (GOOD/…) · `status` (AVAILABLE/BORROWED/LOST/REMOVED) · `shelfLocation`
- Pengadaan (WO13/WO13-R1): `acquisitionDate` · `acquisitionSource` (enum ketat) · `acquisitionCost` (Int) · `acquisitionSourceDetail` · `acquisitionNotes`
- `notes` · relasi `book` (judul/isbn/penerbit/kategori)
- `AssetEvent` (riwayat: `eventType`, `actorType`, `actorId`, `metadata`, `notes`, `occurredAt`) — **hanya diisi oleh `addCopies` legacy** (event create). Belum ada event borrow/return/status.

**Repository:** `BookCopyRepository` (src/main, stack baru), `AssetEventRepository` (legacy, electron).

**Service:** `BookCopyService` (src/main: findByBarcode/decommission), `InventoryService` (legacy: findMany filter status/kondisi), `AssetEventService`.

**Cukup untuk laporan?** YA. Rekap stok per status/kondisi/lokasi; nilai aset = `SUM(acquisitionCost)`; daftar eksemplar.

**Perlu query baru?** YA — `groupBy` status/kondisi/shelfLocation, `SUM` harga perolehan, daftar eksemplar per buku/kategori. `BookCopyRepository.findMany` ada pagination + filter `where` (bisa di-*reuse* untuk daftar), tapi agregasi belum ada.

### 2.6 Domain PROMOTION

**Data tersedia** (`PromotionRun` + `PromotionRunItem`):
- `fromYearId`/`toYearId` (tahun sumber/target) · `mode` (AUTOMATIC/MAPPING/BULK_EDIT) · `runBy` (nullable) · `status` (SUCCESS/PARTIAL/FAILED) · `summary` (JSON counts) · `startedAt`/`finishedAt`
- Per anggota: `memberId`, `sourceClassId`, `targetClassId`, `outcome` (PROMOTED/REPEATED/REDISTRIBUTED/GRADUATED/NO_TARGET/ERROR), `message`
- Label kelas via batch lookup (pola P-3); nama anggota via relasi `member`

**Repository:** `PromotionRepository` (findById + label kelas, findMany paginated).

**Service:** `PromotionRunService` (findById/findMany — read-only, parse summary → counts 8 kolom), `PromotionPreviewService` (decide), `PromotionExecuteService`.

**Cukup untuk laporan?** YA — riwayat run + hasil per anggota sudah lengkap di `promotions:findMany`/`findById`.

**Perlu query baru?** YA opsional — filter riwayat per tahun (from/to), agregasi outcome lintas run, daftar anggota yang lulus per tahun.

---

## 3. Audit Kebutuhan Laporan

### 3.1 LAPORAN PEMINJAMAN

| Kolom yang diminta | Tersedia? | Sumber |
|---|---|---|
| Nomor Transaksi | ✅ | `Borrow.borrowNumber` |
| Tanggal | ✅ | `Borrow.borrowDate` |
| Anggota | ✅ | `Borrow.memberName` + `memberNumber` (snapshot) / relasi `member` |
| Kelas | ✅ (snapshot) | `Borrow.className` — diisi saat create dari Enrollment ACTIVE; `null` untuk Guru/Umum |
| Buku | ✅ | `BorrowDetail.bookTitle` (snapshot) + relasi `bookCopy.book.title` |
| Due Date | ✅ | `Borrow.dueDate` |
| Status | ✅ (turunan) | `returnDate=null → AKTIF`; `returnDate≠null → SELESAI`; `returnDate=null && dueDate<today → TERLAMBAT` (komputasi) |
| **Petugas** | ❌ | Tidak ada kolom/user system — **Gap #1** |

### 3.2 LAPORAN PENGEMBALIAN

| Kebutuhan | Tersedia? | Sumber |
|---|---|---|
| Nomor Transaksi | ✅ | `Borrow.borrowNumber` |
| Tanggal Pinjam | ✅ | `Borrow.borrowDate` |
| Tanggal Kembali | ✅ | `BorrowDetail.returnedAt` (per-buku); `Borrow.returnDate` (per-transaksi lengkap) |
| Anggota + Kelas | ✅ | `Borrow.memberName`/`className` (snapshot) + relasi `member` |
| Buku | ✅ | `BorrowDetail.bookTitle` + relasi `bookCopy.book.title` |
| Kondisi Kembali | ✅ | `BorrowDetail.conditionBack` (BAIK/RUSAK/HILANG) |
| Due Date / Terlambat | ✅ (turunan) | `dueDate` vs `returnedAt` |
| **Petugas** | ❌ | **Gap #1** |

**Catatan:** karena tidak ada transaksi "pengembalian" tersendiri, baris laporan = **per-buku** (1 baris per `BorrowDetail` yang sudah kembali) — konsisten dengan definisi `returned` di Dashboard Phase 1.

### 3.3 LAPORAN KETERLAMBATAN

| Kebutuhan | Tersedia? | Sumber |
|---|---|---|
| Transaksi + Anggota + Kelas + Buku + Due Date | ✅ | Sama seperti 3.1/3.2 |
| Status (masih terlambat / pernah terlambat) | ✅ (turunan) | `returnDate=null && dueDate<today` (masih aktif, terlambat); `returnedAt > dueDate` (pernah terlambat) |
| Jumlah hari keterlambatan | ✅ (turunan) | `diffDays(today, dueDate)` atau `diffDays(returnedAt, dueDate)` |
| **Nominal Denda** | ❌ | **Gap #2** — tidak ada engine denda; `BorrowingItemDetailDTO.fine` selalu `null`; `Setting.lateFee` ada tapi belum dikonsumsi |

### 3.4 LAPORAN ANGGOTA

| Kebutuhan | Tersedia? | Sumber |
|---|---|---|
| No. Anggota, Nama, Tipe, Gender, Kontak | ✅ | `Member` lengkap |
| Kelas (saat ini) | ✅ | `MemberEnrollment` ACTIVE → `classInfo` (pola MEMBER CLASS DISPLAY) |
| Status keanggotaan | ✅ | `Member.status` |
| Riwayat kelas per tahun | ✅ | `EnrollmentRepository.findManyByMember` / `historyByMember` |
| Rekap jumlah per tipe/kelas/tahun | ✅ (perlu query) | `groupBy` Member/Enrollment |

### 3.5 LAPORAN KOLEKSI BUKU

| Kebutuhan | Tersedia? | Sumber |
|---|---|---|
| Judul, ISBN, Pengarang, Penerbit, Kategori, Tahun | ✅ | `Book` + relasi |
| Jumlah judul / jumlah eksemplar | ✅ | `count` Book + BookCopy |
| Status & kondisi eksemplar | ✅ | `BookCopy.status/condition` |
| Lokasi rak | ✅ | `BookCopy.shelfLocation` |
| Nilai aset / data pengadaan | ✅ | `BookCopy.acquisition*` (WO13) |
| Rekap per kategori/penerbit | ✅ (perlu query) | `groupBy` |

### 3.6 LAPORAN PROMOSI

| Kebutuhan | Tersedia? | Sumber |
|---|---|---|
| Run: tahun sumber/target, mode, status, tanggal | ✅ | `PromotionRun` + `promotions:findMany` |
| Hasil per anggota (outcome, kelas asal/target) | ✅ | `PromotionRunItem` + `promotions:findById` (label via batch lookup) |
| Rekap 8 kolom (Promoted/Graduated/…) | ✅ | `summary` JSON → `counts` (P-3) |
| Pelaksana (`runBy`) | ✅ (opsional, nullable) | `PromotionRun.runBy` |

---

## 4. Gap Analysis

| # | Gap | Dampak | Ketersediaan Opsi |
|---|---|---|---|
| **1** | **Petugas per transaksi tidak ada** | Kolom Petugas di Laporan Peminjaman & Pengembalian tidak bisa diisi | **KEPUTUSAN PO (K1): kolom dihapus dari desain laporan v1.0.** `Setting.librarianName`/`reportSigner` hanya untuk tanda tangan laporan. |
| **2** | **Denda tidak dapat dihitung** | Kolom nominal denda di Laporan Keterlambatan kosong | **KEPUTUSAN PO (K2): tanpa nominal.** Laporan menampilkan status + jumlah hari keterlambatan saja; engine denda = WO terpisah |
| **3** | **Tidak ada query "daftar pengembalian"** | Laporan Pengembalian butuh query baru | Ditutup di R-1 (`ReportRepository`) |
| **4** | **Tidak ada filter rentang tanggal pada Borrow/Member/Book list existing** | Laporan butuh filter `between` | Ditutup di R-1; repository domain existing TIDAK diubah |
| **5** | **Pagination clamp `limit ≤ 100`** (`getPaginationParams`) | Jangan fetch-all via `findMany(limit 1000)` — terpotong 100 (pola bug B1 Dashboard) | Report pakai query agregat `count()` + `take`/pagination sendiri |
| **6** | **`AssetEvent` hanya mencatat create (addCopies)** | Riwayat aset (borrow/return/decommission) tidak lengkap | Tidak memblokir laporan v1.0 (koleksi pakai `BookCopy`); pencatatan event penuh = backlog |
| **7** | **Dua PrismaClient** (legacy vs baru) | Risiko inkonsistensi/duplikasi koneksi | Report Wajib pakai `getPrisma()` (stack baru) — konsisten keputusan IT-1 |
| **8** | **`PromotionRun.runBy` nullable & belum diisi alur UI** | Kolom pelaksana laporan promosi bisa kosong | UI operator (P-4) belum kirim `runBy`; opsional |

---

## 5. Architecture Recommendation

```
ReportRepository (src/main/repositories/report.repository.ts)
        ↓
ReportService   (src/main/services/report.service.ts)
        ↓
report.ipc.ts + report.preload.ts + env.d.ts + bootstrap wiring
        ↓
Renderer: ReportsPage → sub-halaman laporan
        ↓ (opsional)
Print/PDF: reuse pola template pure data → HTML (borrow-card.service) + PrintService
```

### 5.1 SATU ReportRepository — cukup? Ya, dengan syarat.

**Rekomendasi: SATU `ReportRepository` baru yang meng-extend `BaseRepository`** dan berisi **query agregat khusus laporan** (filter rentang tanggal, `groupBy`, `count`, batch lookup label). Alasan:

1. **Pemisahan tanggung jawab:** repository domain existing (`borrow`, `member`, `bookCopy`, …) dirancang untuk CRUD + DTO aplikasi. Menambah method laporan ke mereka mengotori kontrak domain dan berisiko mengubah perilaku yang sudah diuji smoke (regression besar).
2. **Konsistensi akses data:** `ReportRepository extends BaseRepository` → otomatis memakai `getPrisma()` (satu client, stack baru).
3. **Reuse MAPPING, bukan QUERY:** label/mapping yang sudah jadi TETAP di-*reuse* dari Service existing, mis. `MemberService` (dengan `classInfo`), `PromotionRunService.findById/findMany` (history + counts), `MemberTypeConfig`, `ACADEMIC_STATUS`, `BOOK_COPY_STATUS`. ReportService memanggil keduanya (ReportRepository untuk data mentah + Service existing untuk DTO).

### 5.2 Boundary Service

`ReportService`:
- Menerima input filter (rentang tanggal, tahun ajaran, kelas, status, kategori, tipe anggota).
- Melakukan boundary tanggal (pola `startOfDay`/`endOfDay` Dashboard).
- Menyusun `ReportDTO` per jenis laporan; **seluruh komputasi business (status TERLAMBAT, hari, ringkasan) di Service** — renderer TIDAK menurunkan angka (konsisten WO-2/P-4).
- Boleh meng-*compose* beberapa repository dalam satu laporan (mis. koleksi = Book + BookCopy aggregate) via `Promise.all`.

### 5.3 IPC / Preload / Renderer

- `electron/ipc/report.ipc.ts`: channel `reports:<jenis>` (mis. `reports:borrowings`, `reports:returns`, `reports:overdues`, `reports:members`, `reports:collections`, `reports:promotions`). Setiap channel menerima filter → `ReportDTO`.
- `electron/preload/report.preload.ts` + `src/renderer/env.d.ts`: `reportAPI`.
- Bootstrap: instantiasi `ReportRepository` + `ReportService` di Container (pola existing).
- `src/pages/ReportsPage.tsx` (saat ini placeholder "sedang dalam pengembangan") → halaman menu laporan; sub-halaman per jenis laporan (routes baru di bawah `/reports/*`). Sidebar item "Laporan" sudah ada.

### 5.4 Template Print/PDF (rekomendasi, bukan blokir v1.0)

Bila laporan perlu cetak/PDF, ikuti pola **borrow-card**: assembler data (`ReportData` string siap-render) → **template pure function `data → HTML`** (satu-satunya sumber Print/Preview/PDF) → `PrintService.printHtml`/`renderPdf` (sudah ada di `electron/main/services/print.service.ts`). Setting yang tersedia untuk kop laporan: `libraryName`, `schoolName`, `address`, `phone`, `email`, `website`, `logoPath`, `principalName`, `librarianName`, `reportPaperSize`, `reportDateFormat`, `reportSigner`.

---

## 6. Query Recommendation

| Laporan | Query inti (di ReportRepository) |
|---|---|
| Peminjaman | `borrow.findMany({ where: { borrowDate: { gte, lte } }, include: { details: { include: { bookCopy: { include: { book } } } }, member } , orderBy: borrowDate })` + `borrow.count` (ringkasan) |
| Pengembalian | `borrowDetail.findMany({ where: { returnedAt: { gte, lte } }, include: { borrow: { include: { member } }, bookCopy: { include: { book } } } })` — **1 baris per buku kembali** |
| Keterlambatan | (a) masih terlambat: `borrow.findMany({ where: { returnDate: null, dueDate: { lt: today } } })`; (b) pernah terlambat: `borrowDetail.findMany({ where: { returnedAt: { gt: dueDateField } } })` — **hari dihitung di Service** |
| Anggota | `member.findMany` + enrollment ACTIVE (pola `member.repository.findMany` yang sudah include enrollment) atau `memberEnrollment.groupBy` per kelas/tahun |
| Koleksi | `book.findMany` + `bookCopy` aggregate: `groupBy({ by: ['status'] })`, `groupBy({ by: ['condition'] })`, `SUM(acquisitionCost)` via `$queryRaw`/`aggregate` |
| Promosi | `promotionRun.findMany` (existing) + opsional filter tahun; **TIDAK menambah query ke `decide()`** (history = audit) |

Prinsip:
- **Filter di DB, bukan fetch-all lalu saring di memori** (kecuali data master kecil seperti daftar kelas).
- **Batch lookup label** (pola `promotion.repository.findById`): kumpulkan `classIds`, satu query `class.findMany({ where: { id: { in } } })`, petakan `Map` — **dilarang query per baris**.
- **`count()` untuk angka ringkasan**, bukan `data.length` dari fetch terbatas.
- **`take`/pagination eksplisit** untuk daftar laporan; JANGAN andalkan `findMany` domain yang clamp limit 100 (Gap #5).

---

## 7. Performance Audit

### 7.1 Volume data nyata (DB dev, 2026-08-05)

| Tabel | Jumlah |
|---|---|
| Borrow / BorrowDetail | 3 / 3 |
| Member / Enrollment | 395 / 395 |
| Book / BookCopy | 2 / 26 |
| Class / AcademicYear | 13 / 1 |
| PromotionRun / PromotionRunItem | 0 / 0 |
| AssetEvent | 0 |

Kontek sekolah (1 unit): realistis puluhan ribu `Borrow` per tahun, ratusan ribu dalam beberapa tahun. SQLite + Prisma cukup untuk itu selama query memakai filter + index yang tepat.

### 7.2 Penilaian berat/tidak

- **Tidak berat pada skala saat ini.** Query laporan adalah `findMany` ber-filter + `groupBy`; dengan volume dev, seluruh laporan selesai < 50 ms.
- **Berpotensi berat bila:** (a) tanpa filter rentang tanggal → scan seluruh tabel; (b) N+1 pada label kelas/anggota; (c) ekspor tanpa pagination ratusan ribu baris; (d) `ORDER BY` pada kolom tak berindex.

### 7.3 Solusi yang direkomendasikan

1. **Index pada kolom filter laporan (opsional, migration di masa depan):**
   - `Borrow.@@index([borrowDate])` — filter laporan peminjaman
   - `BorrowDetail.@@index([returnedAt])` — laporan pengembalian/keterlambatan
   - `Borrow.@@index([dueDate])` — laporan keterlambatan
   - (sudah ada: `Borrow(memberId)`, `BookCopy(status)`, `BookCopy(shelfLocation)`, `Book(title)`, `Member(fullName)`, `Class(academicYearId)`, `MemberEnrollment(memberId,status)`)
   - **TIDAK wajib untuk v1.0** (volume kecil); dibuat sebagai migration terpisah bila diperlukan.
2. **Filter tanggal WAJIB** `{ gte, lte }` di query laporan (Service menetapkan boundary).
3. **Batch lookup** untuk semua label (kelas, kurikulum, kategori) — tidak ada N+1.
4. **Pagination** daftar laporan (`take` + `total`) dan `count()` untuk ringkasan; **jangan** `findMany(limit 1000)`.
5. **`Promise.all`** untuk laporan yang menggabungkan beberapa agregasi (pola Dashboard Service).

---

## 8. Technical Debt (yang harus diselesaikan dahulu?)

**Tidak ada blocker.** Namun dicatat (opsional / backlog):

| # | Debt | Prioritas |
|---|---|---|
| 1 | Kolom **Petugas** per transaksi tidak ada (Gap #1) | **KEPUTUSAN PO** — kosongkan, isi dari Setting, atau tambah schema |
| 2 | Engine **denda** tidak ada (Gap #2) | KEPUTUSAN PO — laporan keterlambatan v1.0 tanpa nominal |
| 3 | Dua PrismaClient (legacy vs baru) | Report wajib pakai `getPrisma()`; konsolidasi = backlog |
| 4 | `AssetEvent` hanya mencatat create | Riwayat aset penuh = backlog |
| 5 | `PromotionRun.runBy` tidak diisi UI | Opsional — kirim dari operator saat execute |
| 6 | `Borrow.className` snapshot | By design; laporan historis tetap akurat; "kelas terkini" harus via enrollment |

---

## 9. Risiko

| Risiko | Level | Mitigasi |
|---|---|---|
| Kolom Petugas kosong → PO menolak laporan | ~~Tinggi~~ **Diminimalkan (K1)** | Kolom Petugas dihapus dari desain; PO sudah menyetujui |
| Denda diharapkan ada → laporan dianggap kurang | ~~Sedang~~ **Diminimalkan (K2)** | Laporan keterlambatan tanpa nominal; PO sudah menyetujui |
| Fetch-all via findMany existing (limit 100) | Sedang | ReportRepository memakai query agregat sendiri (R-1 smoke membuktikan >100 baris) |
| Regression repository domain bila method laporan ditambahkan ke sana | Sedang | DILARANG; ReportRepository baru, repository domain tidak diubah |
| Dua PrismaClient menyebabkan laporan baca instance salah | Rendah | Report extends BaseRepository (getPrisma) |
| Rentang tanggal salah boundary (timezone) | Rendah | Boundary `startOfDay`/`endOfDay` di Service (pola Dashboard) |

---

## 10. Work Breakdown Structure

| WO | Deskripsi | Deliverable | Gate |
|---|---|---|---|
| **R-1** | Fondasi Laporan: `ReportDTO` (shared) + `ReportRepository` (query agregat: date-range borrowings, returned details, overdue derivation support, groupBy koleksi) + smoke murni/fresh-DB | DTO, Repository, smoke | Smoke R-1 PASS; lint |
| **R-2** | `ReportService` — 6 laporan (peminjaman, pengembalian, keterlambatan, anggota, koleksi, promosi) + mapping + boundary tanggal + ringkasan | Service + smoke 6 laporan | Smoke R-2 PASS |
| **R-3** | Wiring: `report.ipc.ts` + `report.preload.ts` + `env.d.ts` + bootstrap | IPC/preload/env/bootstrap | grep bundle channel; lint |
| **R-4** | UI Laporan Peminjaman (filter rentang tanggal + status + tabel) | Page + route + labels | Build; smoke UI kontrak |
| **R-5** | UI Laporan Pengembalian + Keterlambatan | Page + route + labels | Build |
| **R-6** | UI Laporan Anggota (filter tipe/tahun/kelas) + Koleksi Buku (rekap + nilai aset) | Page + route + labels | Build |
| **R-7** | UI Laporan Promosi (riwayat run + detail outcome) | Page + route + labels | Build |
| **R-8** *(opsional)* | Cetak/PDF laporan: assembler `ReportData` + template pure `data→HTML` + `PrintService` (pola borrow-card) | Template + channel print | Smoke template |
| **R-9** | Regression penuh + UAT + rilis (laporan + AGENTS.md + commit tunggal) | Laporan, regression suite | 100% PASS |

> Catatan scope: R-1..R-7 membangun laporan **tanpa** mengubah schema. R-8 (print/PDF) dan keputusan Gap #1/#2 diserahkan ke PO.

---

## 11. Jawaban Empat Pertanyaan Wajib

1. **Apakah seluruh laporan v1.0 dapat dibangun TANPA mengubah schema database?**
   **YA — dikonfirmasi.** Enam laporan (Peminjaman, Pengembalian, Keterlambatan, Anggota, Koleksi Buku, Promosi) semua berbasis model yang sudah ada. Kolom **Petugas** secara resmi **dihapus dari desain** (K1) sehingga tidak ada kebutuhan schema.

2. **Apakah diperlukan migration?**
   **TIDAK untuk v1.0.** K2 (tanpa denda) mengeliminasi kebutuhan perubahan schema. Rekomendasi: v1.0 tanpa migration.

3. **Apakah diperlukan tabel baru?**
   **TIDAK.** Tidak ada laporan v1.0 yang membutuhkan tabel baru.

4. **Apakah ada technical debt yang harus diselesaikan dahulu?**
   **Tidak ada blocker.** Dua keputusan PO sudah dikonfirmasi (K1 hapus Petugas, K2 tanpa denda). Sisa debt opsional/backlog (index, dua PrismaClient, AssetEvent).

---

## 12. Lampiran (sumber audit)

- `prisma/schema.prisma` (17 model)
- `src/main/repositories/` (19 file) + `src/main/services/` (23 file)
- `electron/main/services/print.service.ts` (engine print/PDF existing + setting kop laporan)
- `electron/main/services/setting.service.ts` + `Setting` model (kop/format laporan)
- `electron/ipc/*` (21 handler) + `electron/preload/index.ts` + `src/renderer/env.d.ts` (permukaan API renderer)
- `src/pages/ReportsPage.tsx` (placeholder) · `src/routes/index.tsx` · `src/components/layout/Sidebar.tsx` (item "Laporan" sudah ada)
- Data DB dev `prisma/aplibrary.db` (hitung per tabel)

---

**BERHENTI — Menunggu review Product Owner.**
