# WO-008: Borrowing Architecture Consolidation Specification

**Status:** Draft — Architecture Design
**Author:** Software Architect
**Product Owner:** [PO]
**Date:** 2026-07-30

---

## 1. TARGET ARCHITECTURE

Setelah konsolidasi, seluruh Borrowing Module menggunakan satu stack:

```
Renderer (React)
    │
    ▼
IPC Handler (electron/ipc/)
    │
    ▼
Service (src/main/services/)
    │
    ▼
Repository (src/main/repositories/)
    │
    ▼
Prisma Client (generated from schema.prisma)
    │
    ▼
SQLite
```

### Prinsip Arsitektur

1. **Single Source of Truth** — Hanya model `Borrow` dan `BorrowDetail` yang digunakan. Model `Borrowing`, `BorrowingItem`, `Return` dihapus dari kode (tidak pernah ada di schema).
2. **Layered Isolation** — Renderer hanya bicara via IPC. Service hanya bicara via Repository. Repository hanya akses Prisma.
3. **No Duplication** — Tidak ada dua implementasi paralel untuk fungsi yang sama.

### Model Data Final

```
Borrow
├── id (UUID)
├── borrowNumber (String, unique)
├── memberId → Member.id
├── memberName (denormalized)
├── memberNumber (denormalized)
├── borrowDate (DateTime)
├── dueDate (DateTime)
├── returnDate (DateTime, nullable — null = still active)
├── className (nullable)
├── notes (nullable)
├── createdAt
├── updatedAt
│
└── BorrowDetail[]
    ├── id (UUID)
    ├── borrowId → Borrow.id
    ├── bookCopyId → BookCopy.id
    ├── returnedAt (DateTime, nullable — null = still borrowed)
    ├── conditionBack (String, nullable — BAIK/RUSAK/HILANG)
    ├── note (String, nullable)
    ├── bookTitle (denormalized)
    ├── createdAt
    └── updatedAt
```

**Tidak ada model `Borrowing`, `BorrowingItem`, `Return`.** Semua data return disimpan di `BorrowDetail.returnedAt`/`conditionBack` dan `Borrow.returnDate`.

---

## 2. FLOW MAPPING

### 2.1 Create Borrow

| Layer | Current | Target |
|-------|---------|--------|
| Renderer | `BorrowingsPage.tsx` → `window.electronAPI.borrowings.create()` | Sama (tidak berubah) |
| IPC | `borrow.ipc.ts` → `borrowService.create()` | Sama (tidak berubah) |
| Service | `BorrowService.create()` — validasi + `createWithItems()` | Sama (tidak berubah) |
| Repository | `BorrowRepository.createWithItems()` — transactional | Sama (tidak berubah) |

**File berubah:** Tidak ada.

**Status:** SUDAH WORKING.

---

### 2.2 Member Search

| Layer | Current | Target |
|-------|---------|--------|
| Renderer | `BorrowingsPage.tsx` panggil `window.electronAPI.members.search(query)` — **RUNTIME ERROR** | Ganti ke `window.electronAPI.members.findMany(query)` |
| IPC | Tidak ada handler `members:search` | Tidak perlu handler baru — reuse `members:findMany` dengan parameter search |
| Service | Tidak ada | Tidak perlu — `MemberService.findMany(search)` sudah ada |
| Repository | Tidak ada | Tidak perlu — `MemberRepository.findMany({search})` sudah ada |

**File yang berubah:**
- `src/pages/BorrowingsPage.tsx:53` — ubah `window.electronAPI.members.search(query)` menjadi `window.electronAPI.members.findMany(query, 1, 20)`

**Status:** PERLU FIX — tidak perlu service/repo baru, hanya perbaikan panggilan di frontend.

---

### 2.3 Member Borrowing Stats

| Layer | Current | Target |
|-------|---------|--------|
| Renderer | `BorrowingsPage.tsx` → `window.electronAPI.borrowings.getMemberBorrowingStats(memberId)` | Sama (API contract tetap) |
| IPC | `borrow.ipc.ts` → `borrowingItemRepository.countActiveByMemberId()` + `getNearestDueDateByMemberId()` — **RUNTIME ERROR** | Ganti ke `borrowDetailRepository.countActiveByMemberId()` + method baru `getNearestDueDateByMemberId()` |
| Service | Tidak ada — di IPC langsung | Pindahkan ke `BorrowDetailService` method baru `getMemberStats()` |
| Repository | `BorrowingItemRepository` — model tidak ada | `BorrowDetailRepository` — `countActiveByMemberId()` **SUDAH ADA** + method baru `getNearestDueDateByMemberId()` |

**File yang berubah:**
- `electron/ipc/borrow.ipc.ts:26-30` — ganti implementasi handler
- `src/main/repositories/borrow-detail.repository.ts` — tambah method `getNearestDueDateByMemberId(memberId)`
- `src/main/services/borrow.service.ts` (atau service baru) — tambah method `getMemberStats()`

**Status:** PERLU IMPLEMENTASI ULANG dengan Stack A.

---

### 2.4 Barcode Scan

| Layer | Current | Target |
|-------|---------|--------|
| Renderer | `BorrowingsPage.tsx` → `window.electronAPI.bookCopies.findByBarcode(barcode)` | Sama |
| IPC | `book-copy.ipc.ts` → `borrowingService.findBookCopyByBarcode()` — WORKING tapi lewat legacy | Ganti ke `bookCopyService.findByBarcode()` — pakai `BookCopyService` (baru) |
| Service | `BorrowingService.findBookCopyByBarcode()` — delegasi ke `BookCopyRepository.findByBarcodeWithBook()` | Buat method `findByBarcode(barcode)` di `BookCopyService` (baru) |
| Repository | Legacy `BookCopyRepository.findByBarcodeWithBook()` — masih `prisma.bookCopy` yang ada | Repo baru `src/main/repositories/book-copy.repository.ts:43` sudah punya `findByBarcode()` — perlu include book |

**File yang berubah:**
- `electron/ipc/book-copy.ipc.ts:10-11` — ganti dari `borrowingService.findBookCopyByBarcode` ke `bookCopyService.findByBarcode`
- `src/main/services/book-copy.service.ts` — tambah method `findByBarcode(barcode)` dengan `include: { book: true }`

**Catatan:** `BookCopy` ada di kedua stack. Legacy tetap akses model yang valid. Tidak runtime error. Tapi dependency ke `BorrowingService` harus diputus.

---

### 2.5 Borrow Listing

| Layer | Current | Target |
|-------|---------|--------|
| Renderer | **TIDAK ADA** — tidak ada page | Buat `BorrowListPage.tsx` → `window.electronAPI.borrowings.findMany()` |
| IPC | `borrow.ipc.ts` → `borrowService.findMany()` — SUDAH ADA | Sama |
| Service | `BorrowService.findMany()` — **SUDAH ADA** | Sama — tapi perbaiki `totalItems: 0` (hardcoded) |
| Repository | `BorrowRepository.findMany()` — **SUDAH ADA** | Sama — atau perlu include count details |

**File yang berubah:**
- `src/pages/BorrowListPage.tsx` — baru
- `src/routes/index.tsx` — tambah route
- `src/components/layout/Sidebar.tsx` — jika perlu ubah link

**Status:** HANDLER SUDAH SIAP — hanya perlu UI.

---

### 2.6 Borrow Detail

| Layer | Current | Target |
|-------|---------|--------|
| Renderer | **TIDAK ADA** | Buat `BorrowDetailPage.tsx` → `window.electronAPI.borrowings.findById(id)` |
| IPC | `borrow.ipc.ts` → `borrowService.findById()` — SUDAH ADA | Sama |
| Service | `BorrowService.findById()` — **SUDAH ADA** | Sama — tapi audit `toDTO()` untuk mapping `borrowNumber` |
| Repository | `BorrowRepository.findById()` — **SUDAH ADA** | Sama — audit include details + bookCopy + book |

**File yang berubah:**
- `src/pages/BorrowDetailPage.tsx` — baru
- `src/routes/index.tsx` — tambah route

**Status:** HANDLER SUDAH SIAP — hanya perlu UI.

---

### 2.7 Return by Barcode

| Layer | Current | Target |
|-------|---------|--------|
| Renderer | `ReturnsPage.tsx` → `window.electronAPI.returns.findByBarcode(barcode)` | Sama (API contract tetap) |
| IPC | `borrow.ipc.ts` → `returnService.findBorrowingByBarcode()` — **RUNTIME ERROR** | Ganti ke handler baru di `ReturnService` (baru) |
| Service | `ReturnService.findBorrowingByBarcode()` — LEGACY, broken | Buat `ReturnService` baru di `src/main/services/` |
| Repository | `BorrowingItemRepository.findActiveByBookCopyId()` — broken | `BorrowDetailRepository` — method baru `findActiveByBookCopyId(bookCopyId)` |

**File yang berubah:**
- `src/main/services/return.service.ts` — baru
- `src/main/repositories/borrow-detail.repository.ts` — tambah method
- `electron/ipc/borrow.ipc.ts` — ganti implementasi handler `returns:findByBarcode`

**Status:** PERLU SERVICE + REPOSITORY BARU.

---

### 2.8 Return Book

| Layer | Current | Target |
|-------|---------|--------|
| Renderer | `ReturnsPage.tsx` → `window.electronAPI.returns.returnBook(input)` | Sama (API contract tetap) |
| IPC | `borrow.ipc.ts` → `returnService.returnBook()` — **RUNTIME ERROR** | Ganti ke `ReturnService.returnBook()` (baru) |
| Service | `ReturnService.returnBook()` — LEGACY, broken | `ReturnService` baru — update `BorrowDetail`, update status `BookCopy`, update `Borrow.returnDate` |
| Repository | `ReturnRepository` — semua method broken | `BorrowDetailRepository.update()` + `BorrowRepository.update()` — **SUDAH ADA** |

**File yang berubah:**
- `src/main/services/return.service.ts` — baru (sama dengan 2.7)
- `electron/ipc/borrow.ipc.ts` — ganti handler `returns:returnBook`

**Status:** PERLU SERVICE BARU.

---

### 2.9 Print Borrow Receipt

| Layer | Current | Target |
|-------|---------|--------|
| Renderer | `BorrowingsPage.tsx` → `window.electronAPI.print.borrowReceipt(borrowingId)` | Sama |
| IPC | `print.ipc.ts` → `printService.printBorrowReceipt()` — **RUNTIME ERROR** | Ganti ke `PrintService` baru |
| Service | `PrintService.printBorrowReceipt()` — LEGACY, broken | Port ke Stack A — ganti `BorrowingRepository` → `BorrowRepository` |
| Repository | `BorrowingRepository.findById()` — broken | `BorrowRepository.findById()` — **SUDAH ADA** |

**File yang berubah:**
- `electron/main/services/print.service.ts` — ubah constructor dari `BorrowingRepository` ke `BorrowRepository` (atau buat baru di `src/main/services/`)

**Status:** PERLU PORT — ubah dependency repository.

---

### 2.10 Print Return Receipt

| Layer | Current | Target |
|-------|---------|--------|
| Renderer | `ReturnsPage.tsx` → `window.electronAPI.print.returnReceipt(borrowingId)` | Sama |
| IPC | `print.ipc.ts` → `printService.printReturnReceipt()` — **RUNTIME ERROR** | Sama — service yang sama |
| Service | `PrintService.printReturnReceipt()` — LEGACY, broken | Port ke Stack A — ganti `BorrowingRepository` → `BorrowRepository` |
| Repository | `BorrowingRepository.findById()` — broken | `BorrowRepository.findById()` — **SUDAH ADA** |

**File yang berubah:**
- Sama dengan 2.9 — satu service untuk dua method print.

**Status:** PERLU PORT — satu perubahan dengan 2.9.

---

## 3. MIGRATION PLAN

### Phase 1 — Quick Fixes (Zero New Service)
**Target:** Memperbaiki runtime error paling ringan tanpa membuat service baru.

| Langkah | Perubahan | Risiko |
|---------|-----------|--------|
| 1.1 | `BorrowingsPage.tsx:53` — ganti `members.search` → `members.findMany` | Rendah — hanya ubah nama method |
| 1.2 | `borrow.ipc.ts:26-30` — ganti `borrowingItemRepository` → `borrowDetailRepository` + `borrowRepository` untuk stats | Rendah — `borrowDetailRepository.countActiveByMemberId()` sudah ada |
| 1.3 | `BorrowDetailRepository` — tambah `getNearestDueDateByMemberId()` | Rendah — method repository murni |

**Dependency tersisa:** `BorrowingService`, `ReturnService`, `PrintService`, `BorrowingRepository`, `BorrowingItemRepository`, `ReturnRepository` — masih ada.

---

### Phase 2 — Barcode Scan Refactor
**Target:** Putus dependency ke `BorrowingService.findBookCopyByBarcode`.

| Langkah | Perubahan | Risiko |
|---------|-----------|--------|
| 2.1 | `BookCopyService` (baru) — tambah method `findByBarcode(barcode)` dengan include book | Rendah — method baru |
| 2.2 | `book-copy.ipc.ts:10-11` — ganti `borrowingService.findBookCopyByBarcode` → `bookCopyService.findByBarcode` | Rendah — return type harus kompatibel |
| 2.3 | Hapus `findBookCopyByBarcode` dari `BorrowingService` (atau biarkan sampai Phase 5) | Aman — sudah tidak dipanggil |

**Dependency tersisa:** `ReturnService`, `PrintService`, `BorrowingRepository`, `BorrowingItemRepository`, `ReturnRepository`, `BorrowingService` — masih 4 dari 5 dependee legacy.

---

### Phase 3 — Return Flow (New Service)
**Target:** Buat `ReturnService` baru di Stack A. Ini adalah perubahan terbesar.

| Langkah | Perubahan | Risiko |
|---------|-----------|--------|
| 3.1 | `BorrowDetailRepository` — tambah `findActiveByBookCopyId(bookCopyId)` | Rendah — method repository |
| 3.2 | `BorrowRepository` — tambah `findActiveByMemberId(memberId)`, tambah `updateReturnStatus(borrowId)` atau perluas `update()` | Rendah — method repository |
| 3.3 | `BorrowService` — tambah method `returnBook(input: ReturnBookInput)` dan `findBorrowingByBarcode(barcode)` | Sedang — logika return perlu diport |
| 3.4 | Atau buat `ReturnService` baru di `src/main/services/return.service.ts` | Sedang — preferensi arsitektur |
| 3.5 | `borrow.ipc.ts` — ganti `returns:findByBarcode` dan `returns:returnBook` ke service baru | Sedang — pastikan return type kompatibel |

**Logika return flow di service baru:**
1. `findBorrowingByBarcode(barcode)`:
   - Cari `BookCopy` by barcode → dapat `bookCopyId`
   - Cari `BorrowDetail` by `bookCopyId` WHERE `returnedAt IS NULL`
   - Cari `Borrow` by `borrowId`
   - Return `BorrowingByBarcodeResult`
2. `returnBook(input)`:
   - Cari `BorrowDetail` by `bookCopyId` WHERE `returnedAt IS NULL`
   - Validasi: harus ditemukan
   - Transaction:
     - Update `BorrowDetail.returnedAt = now`, `conditionBack`, `note`
     - Update `BookCopy.status = 'AVAILABLE'`
     - Cek apakah semua `BorrowDetail` untuk `Borrow` sudah `returnedAt`:
       - Jika ya → update `Borrow.returnDate = now`
     - Return `BorrowingDTO`

**Dependency tersisa:** `PrintService`, `BorrowingRepository` — 2 dari 5.

---

### Phase 4 — Print Port
**Target:** Port `PrintService` ke Stack A.

| Langkah | Perubahan | Risiko |
|---------|-----------|--------|
| 4.1 | Ubah constructor `PrintService` dari `BorrowingRepository` → `BorrowRepository` | Rendah — `BorrowRepository.findById()` sudah ada |
| 4.2 | Sesuaikan mapping data di `printBorrowReceipt()` dan `printReturnReceipt()` — ganti `borrowing.xxx` → `borrow.xxx` | Rendah — mapping ulang field names |
| 4.3 | Atau buat `PrintService` baru di `src/main/services/` | Rendah — preferensi |

**Dependency tersisa:** `BorrowingService` (sudah diputus Phase 2), `BorrowingRepository` (diputus Phase 4), `BorrowingItemRepository` (diputus Phase 3), `ReturnService` & `ReturnRepository` (diputus Phase 3).

---

### Phase 5 — Cleanup Legacy
**Target:** Hapus semua kode legacy yang tidak lagi dipanggil.

| Langkah | Perubahan | Risiko |
|---------|-----------|--------|
| 5.1 | Hapus `electron/main/services/borrowing.service.ts` | Medium — pastikan benar-benar tidak dipanggil |
| 5.2 | Hapus `electron/main/services/return.service.ts` | Medium |
| 5.3 | Hapus `electron/main/services/print.service.ts` | Medium — atau hapus setelah diport |
| 5.4 | Hapus `electron/main/repositories/borrowing.repository.ts` | Medium |
| 5.5 | Hapus `electron/main/repositories/borrowing-item.repository.ts` | Medium |
| 5.6 | Hapus `electron/main/repositories/return.repository.ts` | Medium |
| 5.7 | Hapus `electron/main/repositories/member.repository.ts` | Medium — pastikan `BorrowingService` sudah tidak ada |
| 5.8 | Hapus `electron/main/shared/borrowing-status.ts` | Rendah — hanya dipakai legacy |
| 5.9 | Bersihkan `bootstrap.ts` — hapus imports, instantiasi, Container entries | Medium |
| 5.10 | Bersihkan `ipc/index.ts` — hapus tipe parameter yang tidak lagi diperlukan | Rendah |
| 5.11 | Bersihkan `borrow.ipc.ts` — hapus parameter `borrowingService` + `returnService` + `borrowingItemRepository` | Rendah |

**Urutan penghapusan yang aman:**
1. Hapus `ReturnService` + `ReturnRepository` (Phase 3)
2. Hapus `PrintService` (Phase 4) — pastikan sudah diport
3. Hapus `BorrowingService` (Phase 2) — setelah `findBookCopyByBarcode` dipindah
4. Hapus `BorrowingRepository` + `BorrowingItemRepository` — setelah semua consumer-nya dihapus
5. Hapus `MemberRepository` (legacy) — setelah `BorrowingService` dihapus
6. Cleanup container + IPC

---

### Phase 6 — UI Gap Filling
**Target:** Menambahkan UI yang belum ada.

| Langkah | Perubahan | Risiko |
|---------|-----------|--------|
| 6.1 | Buat `BorrowListPage.tsx` — listing peminjaman | Rendah — handler sudah siap |
| 6.2 | Buat `BorrowDetailPage.tsx` — detail peminjaman | Rendah — handler sudah siap |
| 6.3 | Tambah route di `src/routes/index.tsx` | Rendah |
| 6.4 | Update `Sidebar.tsx` jika diperlukan | Rendah |

---

## 4. DEPENDENCY ANALYSIS

### 4.1 BorrowingService (LEGACY — `electron/main/services/borrowing.service.ts`)

| Aspek | Detail |
|-------|--------|
| Siapa yang membuat instance? | `bootstrap.ts:70-77` — `new BorrowingService(borrowingRepository, borrowingItemRepository, ...)` |
| Siapa yang memanggil? | `book-copy.ipc.ts:11` — `borrowingService.findBookCopyByBarcode(barcode)` |
| Siapa yang bergantung padanya? | `book-copy.ipc.ts` — memanggil method `findBookCopyByBarcode()` |
| Method apa yang benar-benar dipakai? | Hanya `findBookCopyByBarcode()` — method lain adalah dead code |
| Bergantung pada apa? | `BorrowingRepository`, `BorrowingItemRepository`, `ReturnRepository`, `MemberRepository` (legacy), `BookCopyRepository`, `BookCopyService` |
| Kapan boleh dihapus? | Setelah **Phase 2** — saat `findBookCopyByBarcode()` dipindahkan ke `BookCopyService` (baru) |

### 4.2 BorrowingRepository (LEGACY — `electron/main/repositories/borrowing.repository.ts`)

| Aspek | Detail |
|-------|--------|
| Siapa yang membuat instance? | `bootstrap.ts:67` — `new BorrowingRepository()` |
| Siapa yang memanggil? | `BorrowingService`, `ReturnService`, `PrintService` — semua legacy |
| Siapa yang bergantung padanya? | 3 service legacy |
| Bergantung pada apa? | `prisma.borrowing` — model **TIDAK ADA** di schema |
| Kapan boleh dihapus? | Setelah **Phase 4** — saat `PrintService`, `ReturnService`, `BorrowingService` semuanya sudah diport/cleanup |

### 4.3 BorrowingItemRepository (LEGACY — `electron/main/repositories/borrowing-item.repository.ts`)

| Aspek | Detail |
|-------|--------|
| Siapa yang membuat instance? | `bootstrap.ts:68` — `new BorrowingItemRepository()` |
| Siapa yang memanggil? | `ReturnService`, `BorrowingService`, `borrow.ipc.ts` (handler `getMemberBorrowingStats`) |
| Siapa yang bergantung padanya? | 3 consumer |
| Bergantung pada apa? | `prisma.borrowingItem`, `prisma.borrowing` — **TIDAK ADA** di schema |
| Kapan boleh dihapus? | Setelah **Phase 3** — saat `ReturnService` diport, `getMemberBorrowingStats` diport, `BorrowingService` sudah cleanup |

### 4.4 ReturnService (LEGACY — `electron/main/services/return.service.ts`)

| Aspek | Detail |
|-------|--------|
| Siapa yang membuat instance? | `bootstrap.ts:78-84` — `new ReturnService(...)` |
| Siapa yang memanggil? | `borrow.ipc.ts:33,37` — handlers `returns:findByBarcode`, `returns:returnBook` |
| Siapa yang bergantung padanya? | Frontend `ReturnsPage.tsx` — via IPC |
| Bergantung pada apa? | `BookCopyRepository`, `BorrowingItemRepository`, `BorrowingRepository`, `ReturnRepository`, `BookCopyService` |
| Kapan boleh dihapus? | Setelah **Phase 3** — saat `ReturnService` baru sudah berfungsi dan di-switch di IPC |

### 4.5 ReturnRepository (LEGACY — `electron/main/repositories/return.repository.ts`)

| Aspek | Detail |
|-------|--------|
| Siapa yang membuat instance? | `bootstrap.ts:69` — `new ReturnRepository()` |
| Siapa yang memanggil? | `ReturnService` (legacy) |
| Siapa yang bergantung padanya? | Hanya `ReturnService` |
| Bergantung pada apa? | `prisma.return`, `prisma.borrowingItem`, `prisma.borrowing` — **TIDAK ADA** |
| Kapan boleh dihapus? | Bersamaan dengan `ReturnService` — **Phase 3** |

### 4.6 PrintService (LEGACY — `electron/main/services/print.service.ts`)

| Aspek | Detail |
|-------|--------|
| Siapa yang membuat instance? | `bootstrap.ts:85` — `new PrintService(borrowingRepository)` |
| Siapa yang memanggil? | `print.ipc.ts:6,9` — handlers `printing:borrowReceipt`, `printing:returnReceipt` |
| Siapa yang bergantung padanya? | Frontend `BorrowingsPage.tsx` dan `ReturnsPage.tsx` — via IPC `window.electronAPI.print.*` |
| Bergantung pada apa? | `BorrowingRepository` |
| Kapan boleh dihapus? | Setelah **Phase 4** — saat dependency ke `BorrowingRepository` diputus |

---

## 5. NEW SERVICES

### 5.1 ReturnService (baru — `src/main/services/return.service.ts`)

| Aspek | Detail |
|-------|--------|
| Tanggung jawab | Menangani return flow: lookup by barcode, return book |
| Method | `findBorrowingByBarcode(barcode: string): Promise<BorrowingByBarcodeResult>` |
| | `returnBook(input: ReturnBookInput): Promise<BorrowingDTO>` |
| Dependency | `BorrowDetailRepository`, `BorrowRepository`, `BookCopyRepository` (baru) |
| | atau bisa juga digabung ke `BorrowService` jika PO setuju |
| Tidak bergantung pada | `prisma.borrowing`, `prisma.borrowingItem`, `prisma.return` |

**Catatan:** Alternatif: method `returnBook` dan `findBorrowingByBarcode` bisa ditambahkan ke `BorrowService` (existing) daripada membuat service baru. Keputusan arsitektur: jika `BorrowService` sudah terlalu besar, pisah ke `ReturnService` terpisah.

### 5.2 PrintService — Port (update existing)

| Aspek | Detail |
|-------|--------|
| Tanggung jawab | Mencetak receipt peminjaman dan pengembalian |
| Method | `printBorrowReceipt(borrowingId: string): Promise<void>` |
| | `printReturnReceipt(borrowingId: string): Promise<void>` |
| Perubahan | Ganti dependency dari `BorrowingRepository` ke `BorrowRepository` |
| | Sesuaikan mapping field: `borrowing.xxx` → `borrow.xxx` |
| Opsi | Port in-place di `electron/main/services/print.service.ts` atau buat baru di `src/main/services/` |

### 5.3 BookCopyService — Tambah Method (existing — `src/main/services/book-copy.service.ts`)

| Aspek | Detail |
|-------|--------|
| Method baru | `findByBarcode(barcode: string): Promise<BookCopyWithBook \| null>` |
| Repository | `BookCopyRepository.findByBarcode()` — sudah ada, perlu tambah `include: { book: true }` |
| Logika | Delegasi ke repository, return null jika tidak ditemukan |

---

## 6. REPOSITORY CHANGES

### 6.1 BorrowDetailRepository (`src/main/repositories/borrow-detail.repository.ts`)

Method yang **SUDAH ADA**:

| Method | Status |
|--------|--------|
| `create(data)` | ✅ Ada |
| `update(id, data)` | ✅ Ada |
| `delete(id)` | ✅ Ada |
| `findById(id)` | ✅ Ada |
| `findByBorrow(borrowId)` | ✅ Ada |
| `findByBookCopy(bookCopyId)` | ✅ Ada |
| `countActiveByMemberId(memberId)` | ✅ Ada |

Method yang **PERLU DITAMBAH**:

| Method | Alasan | Query |
|--------|--------|-------|
| `findActiveByBookCopyId(bookCopyId)` | Return flow — cari active borrow detail by book copy | `WHERE bookCopyId = ? AND returnedAt IS NULL` |
| `getNearestDueDateByMemberId(memberId)` | Member stats — cari due date terdekat | `WHERE borrow.memberId = ? AND returnedAt IS NULL ORDER BY borrow.dueDate ASC LIMIT 1` |
| `hasOverdueByMemberId(memberId)` | Validasi — cek overdue items (opsional, bisa di service) | `WHERE borrow.memberId = ? AND returnedAt IS NULL AND borrow.dueDate < now` |

### 6.2 BorrowRepository (`src/main/repositories/borrow.repository.ts`)

Method yang **SUDAH ADA**:

| Method | Status |
|--------|--------|
| `create(data)` | ✅ Ada |
| `update(id, data)` | ✅ Ada |
| `delete(id)` | ✅ Ada |
| `findById(id)` | ✅ Ada |
| `findByBorrowNumber(borrowNumber)` | ✅ Ada |
| `findMany(options)` | ✅ Ada |
| `getLastBorrowNumber()` | ✅ Ada |
| `createWithItems(borrowData, itemsData)` | ✅ Ada |

Method yang **PERLU DITAMBAH**:

| Method | Alasan | Query |
|--------|--------|-------|
| `findActiveByMemberId(memberId)` | Return flow — cari active borrows by member | `WHERE memberId = ? AND returnDate IS NULL` |
| Tidak perlu method khusus return — `update()` sudah cukup untuk update `returnDate` | | |

### 6.3 BookCopyRepository (`src/main/repositories/book-copy.repository.ts`)

Method yang **PERLU DITAMBAH**:

| Method | Alasan | Detail |
|--------|--------|--------|
| `findByBarcodeWithBook(barcode)` | Barcode scan — perlu include book title | Sama seperti legacy `findByBarcodeWithBook` tetapi dengan include yang sesuai |
| `updateStatusInTx(tx, id, status)` | Transactional update status | Atau reuse pola `this.prisma.$transaction` di service |

---

## 7. RISK ANALYSIS

### Phase 1 — Quick Fixes

| Risiko | Dampak | Rollback |
|--------|--------|----------|
| `members.findMany` return type berbeda dari `members.search` (yang diharapkan) | Member dropdown di create form kosong | Kembalikan ke kode lama, verifikasi tipe data |
| `borrowDetailRepository.countActiveByMemberId` memberikan hasil berbeda dari legacy | Stats anggota salah | Rollback handler `getMemberBorrowingStats` |
| Method repository baru `getNearestDueDateByMemberId` query salah | Due date stats salah | Rollback method repository |

**Mitigasi:** Test manual untuk create borrow + stats display sebelum dan sesudah.

### Phase 2 — Barcode Scan Refactor

| Risiko | Dampak | Rollback |
|--------|--------|----------|
| Return type `findByBarcode` di BookCopyService baru berbeda dari ekspektasi frontend | Barcode scan gagal, book tidak terdeteksi | Rollback `book-copy.ipc.ts` ke pemanggilan `borrowingService` |
| `BookCopy` include berbeda — field tertentu undefined | Book info di form tidak muncul | Rollback method baru, verifikasi field mapping |

**Mitigasi:** Pastikan return type identik dengan legacy `findBookCopyByBarcode`.

### Phase 3 — Return Flow

| Risiko | Dampak | Rollback |
|--------|--------|----------|
| Logika return berbeda antara legacy dan baru — status transaksi tidak konsisten | Data pinjam/kembali korup | Rollback IPC handler, legacy masih ada sebagai fallback |
| Transaction tidak mencakup semua update (miss update book copy status) | Buku tetap status BORROWED | Manual update database |
| `BorrowDetail.returnedAt` tidak di-set | Buku tidak terhitung returned | Manual update database |

**Mitigasi:**
- Implementasi bertahap: deploy baru, test dengan data dummy sebelum cutover
- Legacy service masih utuh — rollback cukup dengan mengembalikan IPC handler
- Transaction harus mencakup: update `BorrowDetail` + update `BookCopy.status`

### Phase 4 — Print Port

| Risiko | Dampak | Rollback |
|--------|--------|----------|
| Mapping field `borrow.xxx` vs `borrowing.xxx` salah | Data receipt kosong/salah | Rollback PrintService ke legacy |
| HTML template menggunakan field yang tidak ada di Stack A | Receipt gagal dicetak | Rollback PrintService |

**Mitigasi:** Bandingkan field-by-field antara `Borrow` dan `Borrowing` sebelum port.

### Phase 5 — Cleanup Legacy

| Risiko | Dampak | Rollback |
|--------|--------|----------|
| Ada kode lain yang tidak terdeteksi masih import legacy class | Compile error | Git revert |
| Ada import dynamic/indirect yang terlewat | Runtime error | Git revert |
| Ada file yang masih dipanggil dari luar borrowing module | Runtime error | Git revert |

**Mitigasi:**
- Sebelum hapus, lakukan grep menyeluruh untuk setiap class/file
- Commit setiap sub-phase secara terpisah (5.1 terpisah dari 5.2, dst.)
- Jika ragu, comment out dulu, test, lalu hapus

### Phase 6 — UI Gap Filling

| Risiko | Dampak | Rollback |
|--------|--------|----------|
| `BorrowListPage` menampilkan data dari `findMany` yang return `totalItems: 0` (hardcoded) | Kolom jumlah buku kosong | Perbaiki `BorrowService.findMany` untuk hitung totalItems |
| Route conflict | Navigasi error | Rollback route |

---

## 8. FINAL ARCHITECTURE DIAGRAM

### After All Phases Complete

```
Renderer (React)
├── BorrowingsPage.tsx       → borrowings.create,        bookCopies.findByBarcode
│                              members.findMany,         borrowingStats
├── ReturnsPage.tsx           → returns.findByBarcode,   returns.returnBook
├── BorrowListPage.tsx        → borrowings.findMany
├── BorrowDetailPage.tsx      → borrowings.findById
└── print                     → print.borrowReceipt,     print.returnReceipt
        │
        ▼
IPC Handlers (electron/ipc/)
├── borrow.ipc.ts             → BorrowService + ReturnService
├── book-copy.ipc.ts          → BookCopyService (baru) — not legacy
├── print.ipc.ts              → PrintService
└── member.ipc.ts             → MemberService
        │
        ▼
Services (src/main/services/)
├── BorrowService
│   ├── findMany, findById, create
│   ├── getMemberStats (borrowStats)
│   └── (returnBook opsional — atau di ReturnService)
├── ReturnService (BARU)
│   ├── findBorrowingByBarcode
│   └── returnBook
├── PrintService — ported
│   ├── printBorrowReceipt
│   └── printReturnReceipt
├── BookCopyService
│   └── findByBarcode (BARU)
└── MemberService (existing)
        │
        ▼
Repositories (src/main/repositories/)
├── BorrowRepository
│   ├── findMany, findById, findByBorrowNumber
│   ├── getLastBorrowNumber, createWithItems
│   ├── update (untuk return), findActiveByMemberId (BARU)
│   └── create, delete
├── BorrowDetailRepository
│   ├── findById, findByBorrow, findByBookCopy
│   ├── countActiveByMemberId
│   ├── findActiveByBookCopyId (BARU)
│   ├── getNearestDueDateByMemberId (BARU)
│   └── hasOverdueByMemberId (BARU)
└── BookCopyRepository
    ├── findById, findByBarcode
    ├── findByBarcodeWithBook (BARU)
    └── updateStatusInTx (BARU)
        │
        ▼
Prisma Client (generated from schema.prisma)
├── Borrow
├── BorrowDetail
├── BookCopy
└── Member, Book, Author, Publisher, Category, Class, AcademicYear, Curriculum
        │
        ▼
SQLite
├── Borrow
├── BorrowDetail
├── BookCopy
└── ... (tables lain)
```

### Legacy yang Dihapus

```
ELECTRON/MAIN/ (DIHAPUS — tidak lagi digunakan)
✗ BorrowingService
✗ ReturnService
✗ PrintService (diport)
✗ BorrowingRepository
✗ BorrowingItemRepository
✗ ReturnRepository
✗ MemberRepository (legacy)
✗ shared/borrowing-status.ts
✗ shared/book-copy-status.ts (jika tidak dipakai service lain)
```

---

## APPENDIX: File Change Summary

| Phase | File | Action |
|-------|------|--------|
| 1.1 | `src/pages/BorrowingsPage.tsx:53` | Edit — `members.search` → `members.findMany` |
| 1.2 | `electron/ipc/borrow.ipc.ts:26-30` | Edit — ganti handler `getMemberBorrowingStats` |
| 1.3 | `src/main/repositories/borrow-detail.repository.ts` | Edit — tambah `getNearestDueDateByMemberId` |
| 2.1 | `src/main/services/book-copy.service.ts` | Edit — tambah `findByBarcode` |
| 2.2 | `electron/ipc/book-copy.ipc.ts:10-11` | Edit — ganti pemanggil |
| 3.1 | `src/main/repositories/borrow-detail.repository.ts` | Edit — tambah `findActiveByBookCopyId`, `hasOverdueByMemberId` |
| 3.2 | `src/main/services/return.service.ts` | **BARU** — ReturnService |
| 3.3 | `electron/ipc/borrow.ipc.ts:33,37` | Edit — ganti ke service baru |
| 4.1 | `electron/main/services/print.service.ts` | Edit — ganti `BorrowingRepository` → `BorrowRepository` |
| 5.1-11 | Multi file cleanup | Hapus legacy |
| 6.1 | `src/pages/BorrowListPage.tsx` | **BARU** |
| 6.2 | `src/pages/BorrowDetailPage.tsx` | **BARU** |
| 6.3 | `src/routes/index.tsx` | Edit — tambah route |
