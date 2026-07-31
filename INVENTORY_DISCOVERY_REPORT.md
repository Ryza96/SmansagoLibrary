# INVENTORY MODULE — DISCOVERY REPORT

> Audit date: 2026-07-30
> Scope: Full-stack tracing dari UI hingga database
> Mode: Read-only — tidak ada kode yang diubah

---

## 1. STRUKTUR HALAMAN INVENTORY

### 1.1 Halaman Utama (`InventoryPage.tsx`)

**Path:** `src/pages/InventoryPage.tsx` (8 baris)

**Status:** PLACEHOLDER

Hanya menampilkan:
```
Inventaris
Modul Inventaris sedang dalam pengembangan.
```

Tidak ada tabel, filter, search, pagination, atau action button.

### 1.2 Inventory Berada di Dalam Book Detail

Satu-satunya tempat yang menampilkan data inventaris adalah halaman **Book Detail** (`src/pages/BookDetailPage.tsx`) yang me-render komponen `BookDetail` (`src/components/books/BookDetail.tsx`).

Di halaman Book Detail, tabel daftar `BookCopy` (eksemplar) ditampilkan sebagai tabel di dalam section buku. Tidak ada halaman inventory yang berdiri sendiri.

---

## 2. SEMUA FITUR YANG TERKAIT INVENTORY

| Fitur | Status | Lokasi |
|-------|--------|--------|
| Lihat daftar eksemplar per buku | ✅ Berfungsi | `BookDetail.tsx` table |
| Tambah eksemplar baru | ⚠️ Parsial (lihat §16) | `BookDetail.tsx` modal dialog |
| Nonaktifkan/hapus eksemplar | ⚠️ Parsial (lihat §16) | `BookDetail.tsx` tombol per baris |
| Scan barcode (peminjaman) | ✅ Berfungsi | `BorrowingsPage.tsx` |
| Scan barcode (pengembalian) | ✅ Berfungsi | `ReturnsPage.tsx` |
| Halaman Inventory terpusat | ❌ Tidak ada | Placeholder saja |
| Filter/search inventory global | ❌ Tidak ada | — |
| Lihat riwayat peminjaman per copy | ❌ Tidak ada | — |
| Ubah kondisi fisik copy | ❌ Tidak ada | — |
| Mutasi lokasi rak | ❌ Tidak ada | — |
| Laporan inventaris | ❌ Tidak ada | — |

---

## 3. SEMUA TOMBOL DAN AKSI

### 3.1 Di `BookDetail.tsx`

| Tombol/Aksi | Fungsi | Trigger |
|-------------|--------|---------|
| `+ Tambah Eksemplar` | Membuka modal dialog tambah copy | `onClick → setShowAddDialog(true)` |
| `Tambah` (di modal) | Submit form Add Copies | `onAddCopies({ quantity, shelfLocation, condition })` |
| `Batal` (di modal) | Tutup modal | `setShowAddDialog(false)` |
| Icon tempat sampah / segitiga | Decommission copy | `onDecommissionCopy(copy.id)` + confirm dialog |

### 3.2 Di `BookDetailPage.tsx`

| Aksi | Fungsi |
|------|--------|
| `handleAddCopies(input)` | Panggil `api.bookCopies.addCopies(id, input)`, refresh state |
| `handleDecommissionCopy(copyId)` | Panggil `api.bookCopies.decommissionCopy(copyId)`, filter dari state |

### 3.3 Tidak Ada Tombol di `InventoryPage.tsx`

Halaman `/inventory` tidak memiliki tombol karena masih placeholder.

---

## 4. WORKFLOW PENGGUNA

### 4.1 Melihat Inventaris Suatu Buku

```
Buku → Klik judul buku → Scroll ke "Eksemplar" section
```

### 4.2 Menambah Eksemplar Baru

```
Buku → Detail Buku → Klik "+ Tambah Eksemplar"
→ Isi: jumlah, lokasi rak, kondisi awal
→ Klik "Tambah"
→ Backend: generate nomor inventaris + barcode → insert
→ UI refresh daftar
```

### 4.3 Menonaktifkan/Menghapus Eksemplar

```
Buku → Detail Buku → Klik icon hapus pada baris eksemplar
→ Konfirmasi (pesan berbeda jika punya riwayat peminjaman)
→ Jika punya riwayat: set status REMOVED
→ Jika tidak punya riwayat: hard delete
```

### 4.4 Meminjam Buku (Scan Barcode)

```
Peminjaman → Scan barcode eksemplar → Validasi status AVAILABLE
→ Tambah ke daftar → Simpan transaksi → Status berubah menjadi BORROWED
```

### 4.5 Mengembalikan Buku (Scan Barcode)

```
Pengembalian → Scan barcode eksemplar → Validasi status BORROWED
→ Proses return → Status kembali menjadi AVAILABLE
```

---

## 5. STRUKTURE DATABASE

### 5.1 Model `BookCopy` (di `schema.prisma`)

```prisma
model BookCopy {
  id              String    @id @default(uuid())
  bookId          String
  inventoryNumber String    @unique
  barcode         String    @unique
  condition       String    @default("GOOD")
  status          String    @default("AVAILABLE")
  shelfLocation   String
  acquisitionDate DateTime?
  notes           String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  book          Book           @relation(fields: [bookId], references: [id])
  borrowDetails BorrowDetail[]

  @@index([status])
  @@index([shelfLocation])
}
```

### 5.2 Kolom Detail

| Field | Tipe | Constraint | Default | Keterangan |
|-------|------|-----------|---------|------------|
| `id` | String (UUID) | PK | `uuid()` | — |
| `bookId` | String | FK → Book.id | — | ID buku induk |
| `inventoryNumber` | String | **Unique** | — | Nomor inventaris (`INV-000001`) |
| `barcode` | String | **Unique** | — | Barcode (`BC-{12 hex}`) |
| `condition` | String | — | `"GOOD"` | GOOD / LIGHT_DAMAGE / HEAVY_DAMAGE |
| `status` | String | — | `"AVAILABLE"` | AVAILABLE / BORROWED / LOST / REMOVED |
| `shelfLocation` | String | — | — | Lokasi rak |
| `acquisitionDate` | DateTime? | nullable | — | Tanggal perolehan |
| `notes` | String? | nullable | — | Catatan |
| `createdAt` | DateTime | — | `now()` | — |
| `updatedAt` | DateTime | — | `@updatedAt` | — |

### 5.3 Indexes

- `@@index([status])` — untuk filtering by status
- `@@index([shelfLocation])` — untuk pencarian lokasi

### 5.4 Model `inventorySequence` **TIDAK ADA** di Schema

**Kritis:** `InventoryNumberGenerator` mereferensi `tx.inventorySequence` (model `inventorySequence`). Model ini **tidak ada** di `schema.prisma`. Runtime akan crash dengan error `Prisma: Model 'inventorySequence' not found`.

---

## 6. REPOSITORY YANG DIGUNAKAN

### 6.1 New Stack (`src/main/repositories/book-copy.repository.ts`)

**Status:** ✅ Sesuai schema, digunakan production

Extends `BaseRepository`. Method:

| Method | Keterangan |
|--------|-----------|
| `create(data)` | Insert single copy |
| `update(id, data)` | Update single copy |
| `delete(id)` | Hard delete |
| `findById(id)` | Include book |
| `findByBarcode(barcode)` | Without book include |
| `findByBarcodeWithBook(barcode)` | Include book |
| `findByInventoryNumber(invNum)` | Cari by nomor inventaris |
| `findByBook(bookId)` | Semua copy milik buku tertentu |
| `findMany(options)` | Pagination + search (barcode/inv number) |
| `existsByBarcode(barcode)` | Cek duplikat barcode |
| `existsByInventoryNumber(invNum)` | Cek duplikat nomor inventaris |
| `count()` | Total semua copy |

**Tidak ada method** untuk:
- `findManyByStatus(status)` — filter by status
- `findByShelfLocation(location)` — filter by rak
- `countByStatus(status)` — statistik per status

### 6.2 Legacy Stack (`electron/main/repositories/book-copy.repository.ts`)

**Status:** ❌ Referensi `borrowingItems` — RUNTIME ERROR

| Method | Issue |
|--------|-------|
| `findById(id)` | `_count: { select: { borrowingItems: true } }` — `borrowingItems` tidak ada di schema |
| `findManyByBookId(bookId)` | Sama: `_count: { select: { borrowingItems: true } }` |
| `findByIdWithTx(tx, id)` | ✅ OK (tidak include _count) |
| `findByBarcodeWithBook(barcode)` | ✅ OK |
| `createMany(data)` | ✅ OK |
| `createManyWithTx(tx, data)` | ✅ OK |
| `updateStatus(tx, id, status)` | ✅ OK |
| `updateCondition(id, condition)` | ✅ OK |
| `countByBookId(bookId)` | ✅ OK |
| `deleteById(id)` | ✅ OK |

### 6.3 Book Repository Legacy (`electron/main/repositories/book.repository.ts`)

Method `findByIdWithDetails` juga mereferensi `borrowingItems` di line 43:

```typescript
bookCopies: {
  include: { _count: { select: { borrowingItems: true } } },
}
```

Ini akan **runtime error** saat membuka detail buku yang memiliki eksemplar.

---

## 7. SERVICE YANG DIGUNAKAN

### 7.1 New Stack (`src/main/services/book-copy.service.ts`)

**Status:** ✅ Minimal, digunakan production

```typescript
class BookCopyService {
  async findByBarcode(barcode: string)
    → delegates to BookCopyRepository.findByBarcodeWithBook(barcode)
}
```

Hanya 1 method. Service ini hanya dipakai untuk **scan barcode** di peminjaman/pengembalian.

### 7.2 Legacy Stack (`electron/main/services/book-copy.service.ts`)

**Status:** ❌ Referensi `borrowingItems` — RUNTIME ERROR

| Method | Issue |
|--------|-------|
| `getCopiesByBookId(bookId)` | Mapping `c._count.borrowingItems` — RUNTIME ERROR |
| `addCopies(bookId, input)` | Panggil `InventoryNumberGenerator.generateBatch` — RUNTIME ERROR (model `inventorySequence` tdk ada) |
| `decommissionCopy(id)` | `copy._count.borrowingItems` — RUNTIME ERROR |
| `updateStatus(id, newStatus, tx?)` | ✅ OK (via `findByIdWithTx` yang aman) |
| `updateCondition(id, newCondition)` | ✅ OK (via `updateCondition` yang aman) |

**Status transition validation:**

```
AVAILABLE  → BORROWED, LOST, REMOVED
BORROWED   → AVAILABLE, LOST, REMOVED
LOST       → REMOVED
REMOVED    → (tidak bisa berubah)
```

### 7.3 Book Service Legacy (`electron/main/services/book.service.ts`)

Method `getBookById(id)` mapping `c._count.borrowingItems > 0` — **RUNTIME ERROR**.

### 7.4 Inventory Number Generator (`electron/main/services/inventory-number-generator.ts`)

**Status:** ❌ Model `inventorySequence` tidak ada di schema

```typescript
// Akan crash:
await tx.inventorySequence.upsert({ ... })
await tx.inventorySequence.update({ ... })
```

Format nomor: `INV-{6 digit sequential}` contoh: `INV-000001`, `INV-000002`.

---

## 8. IPC YANG DIGUNAKAN

### 8.1 Registrasi Handler (`electron/ipc/book-copy.ipc.ts`)

| IPC Channel | Delegasi | Status |
|-------------|----------|--------|
| `bookCopies:findByBarcode` | `newBookCopyService.findByBarcode` | ✅ OK (new stack) |
| `bookCopies:findByBookId` | `bookCopyService.getCopiesByBookId` | ❌ RUNTIME ERROR (legacy) |
| `bookCopies:addCopies` | `bookCopyService.addCopies` | ❌ RUNTIME ERROR (legacy + inventorySequence) |
| `bookCopies:decommissionCopy` | `bookCopyService.decommissionCopy` | ❌ RUNTIME ERROR (legacy) |

### 8.2 Channel yang Tersedia di Renderer

Dari `env.d.ts` dan `book-copy.preload.ts`:

```typescript
electronAPI.bookCopies.findByBarcode(barcode)
electronAPI.bookCopies.findByBookId(bookId)
electronAPI.bookCopies.addCopies(bookId, input: CreateBookCopiesDTO)
electronAPI.bookCopies.decommissionCopy(id)
```

---

## 9. ROUTE REACT

### 9.1 Route Utama

```typescript
{ path: 'inventory', element: <InventoryPage /> }  // Placeholder
```

Tidak ada sub-route seperti `/inventory/:id`, `/inventory/new`, `/inventory/status/:status`.

### 9.2 Route yang Mengakses BookCopy

| Route | Mengakses BookCopy Via |
|-------|----------------------|
| `/books/:id` (BookDetailPage) | `api.bookCopies.findByBookId(id)` |
| `/borrowings` (BorrowingsPage) | `api.bookCopies.findByBarcode(barcode)` |
| `/returns` (ReturnsPage) | `api.returns.findByBarcode(barcode)` → internally `BookCopyRepository` |

### 9.3 Sidebar

Sidebar memiliki menu `Inventaris` yang mengarah ke `/inventory` (placeholder).

```typescript
{ to: '/inventory', label: 'Inventaris', icon: ClipboardList }
```

---

## 10. RELASI INVENTORY DENGAN BOOK

### 10.1 Schema

```
Book (1) ──── (N) BookCopy
  ↑ id = bookId
```

- Satu judul buku bisa memiliki **0..N** eksemplar.
- Setiap eksemplar **wajib** terikat ke satu buku (`bookId` required).
- Tidak ada kaskade delete — eksemplar tidak otomatis terhapus jika buku dihapus.
- Book `deleteBook` memeriksa `countCopies` > 0 dan **menolak** penghapusan jika masih ada eksemplar.

### 10.2 Representasi di DTO

`BookListItemDTO` memiliki field `copyCount: number` yang menunjukkan jumlah eksemplar per buku.

`BookDetailDTO.copies: BookCopyDTO[]` — daftar lengkap eksemplar.

### 10.3 Business Rule

**Tidak bisa hapus buku jika masih memiliki eksemplar.** Pesan error: "Buku tidak dapat dihapus karena masih memiliki {count} eksemplar."

---

## 11. RELASI INVENTORY DENGAN BORROWING

### 11.1 Schema

```
BookCopy (1) ──── (N) BorrowDetail
  ↑ id = bookCopyId
        ↓ borrowId = Borrow.id
```

- Satu eksemplar bisa muncul di **0..N** BorrowDetail (riwayat peminjaman).
- Setiap BorrowDetail mencatat `bookCopyId` + `borrowId`.

### 11.2 Alur Status

```
Peminjaman:  AVAILABLE  → BORROWED
Pengembalian: BORROWED   → AVAILABLE
```

- Status eksemplar berubah saat transaksi peminjaman/pengembalian.
- Perubahan status dilakukan oleh `BorrowService` / `ReturnService` (new stack) menggunakan `BookCopyRepository.update` (new stack).

### 11.3 Cek Riwayat Sebelum Hapus

- Jika eksemplar memiliki **BorrowDetail** (riwayat peminjaman): `hasBorrowingHistory = true` → soft delete (status → REMOVED).
- Jika eksemplar **tidak** memiliki riwayat: hard delete (`prisma.bookCopy.delete`).

---

## 12. FIELD YANG DIMILIKI INVENTORY

### 12.1 Tabel Database (`BookCopy`)

| Field | Tipe | Required | Default |
|-------|------|----------|---------|
| id | UUID | ✅ | auto |
| bookId | UUID | ✅ | — |
| inventoryNumber | String | ✅ (unique) | — |
| barcode | String | ✅ (unique) | — |
| condition | String | ✅ | GOOD |
| status | String | ✅ | AVAILABLE |
| shelfLocation | String | ✅ | — |
| acquisitionDate | DateTime? | ❌ | null |
| notes | String? | ❌ | null |
| createdAt | DateTime | — | now() |
| updatedAt | DateTime | — | updatedAt |

### 12.2 DTO (`BookCopyDTO`)

```typescript
interface BookCopyDTO {
  id: string
  inventoryNumber: string
  barcode: string | null
  shelfLocation: string | null
  condition: string
  status: string
  hasBorrowingHistory: boolean
}
```

**Catatan:** `shelfLocation` dan `barcode` di DTO adalah nullable (`string | null`), tapi di schema `shelfLocation` adalah `String` (required) dan `barcode` adalah `String` (required). Jadi nilai null tidak mungkin terjadi di runtime.

---

## 13. BAGAIMANA STATUS COPY DISIMPAN

### 13.1 Storage

Status disimpan sebagai **string** di kolom `status` tabel `BookCopy`.

### 13.2 Nilai yang Valid

| Nilai | Makna |
|-------|-------|
| `AVAILABLE` | Tersedia untuk dipinjam |
| `BORROWED` | Sedang dipinjam |
| `LOST` | Hilang |
| `REMOVED` | Dihapus/dinonaktifkan |

Didefinisikan di `electron/main/shared/book-copy-status.ts`.

### 13.3 State Machine

```
AVAILABLE ──→ BORROWED ──→ AVAILABLE (via return)
     │              │
     ├──→ LOST ─────┤
     │              │
     └──→ REMOVED ←─┘
```

### 13.4 Siapa yang Mengubah

| Aksi | Pengubah | Method |
|------|----------|--------|
| Pinjam | `BorrowService.create` (new) | `BookCopyRepository.update` |
| Kembali | `ReturnService.returnBook` (new) | `BookCopyRepository.update` |
| Hilang | Legacy `BookCopyService.updateStatus` | Legacy `BookCopyRepository.updateStatus` |
| Hapus | Legacy `BookCopyService.decommissionCopy` | Legacy repo (update/delete) |

**Status tidak pernah diubah langsung dari UI.** Semua perubahan melalui service layer.

---

## 14. APAKAH BARCODE DIBUAT PER COPY ATAU PER BUKU

### 14.1 Jawaban: Per Copy

- Setiap **eksemplar** memiliki barcode unik sendiri.
- Format: `BC-{12 karakter hex}` contoh: `BC-A3F29B1C4D5E`.
- Digenerate oleh `BookCopyService.generateBarcodes()` (legacy) menggunakan `crypto.randomBytes(6).toString('hex').toUpperCase()`.
- Tidak ada barcode yang merupakan barcode buku — barcode selalu untuk eksemplar individual.

### 14.2 Keunikan

Di schema: `barcode String @unique` — constraint database menjamin unik.

### 14.3 Pengecekan Duplikat

`BookCopyService.addCopies` menggunakan retry loop (max 3x) dengan catch error `P2002` (unique constraint violation). Jika terjadi碰撞 (tabrakan barcode), akan retry generate ulang.

---

## 15. APAKAH INVENTORY MEWAKILI COPY FISIK ATAU JUDUL BUKU

### 15.1 Jawaban: Copy Fisik

Setiap record `BookCopy` mewakili **satu eksemplar fisik** buku.

- `inventoryNumber` = nomor inventaris fisik (unik per eksemplar)
- `barcode` = identitas scan per eksemplar
- `condition` = kondisi fisik eksemplar (dapat berubah seiring waktu)
- `status` = status sirkulasi per eksemplar
- `shelfLocation` = lokasi rak fisik per eksemplar

### 15.2 Konsekuensi

Jika sebuah buku memiliki 5 eksemplar, maka ada **5 baris** di tabel `BookCopy`. Masing-masing memiliki `inventoryNumber`, `barcode`, `shelfLocation` sendiri.

### 15.3 Implikasi untuk InventoryPage

Halaman Inventaris harus menampilkan **semua eksemplar** dari seluruh buku, bukan ringkasan per judul.

---

## 16. KEKURANGAN IMPLEMENTASI SAAT INI

### 16.1 KRITIS — Legacy `borrowingItems` Reference

**File:** `electron/main/repositories/book-copy.repository.ts:10`, `electron/main/repositories/book.repository.ts:43`, `electron/main/services/book-copy.service.ts:40,115`, `electron/main/services/book.service.ts:45`

**Masalah:** Semua legacy repository/service yang mereferensi `_count.borrowingItems` akan **runtime error** karena model Prisma saat ini menggunakan `BorrowDetail` dengan relasi `borrowDetails`, bukan `borrowingItems`.

**Dampak:**
- Membuka detail buku → error
- Menambah eksemplar → error
- Menonaktifkan eksemplar → error
- Melihat daftar copy → error

### 16.2 KRITIS — `inventorySequence` Model Tidak Ada

**File:** `electron/main/services/inventory-number-generator.ts:13,19`

**Masalah:** `InventoryNumberGenerator.generateBatchWithPrefix` mengakses `tx.inventorySequence` yang tidak ada di `schema.prisma`.

**Dampak:** Setiap kali menambah eksemplar, akan crash dengan Prisma error "Model `inventorySequence` not found".

### 16.3 Halaman Inventory Placeholder

**File:** `src/pages/InventoryPage.tsx`

**Masalah:** Halaman `/inventory` hanya menampilkan placeholder. Tidak ada tabel, search, filter, pagination, atau action.

**Dampak:** Tidak ada command center untuk melihat/mengelola semua eksemplar. Pustakawan harus masuk ke detail buku satu per satu.

### 16.4 Tidak Ada Filter atau Search Global

**Masalah:** Tidak ada cara untuk:
- Mencari eksemplar berdasarkan barcode atau nomor inventaris
- Filter eksemplar berdasarkan status (AVAILABLE, BORROWED, LOST, REMOVED)
- Filter berdasarkan kondisi (GOOD, LIGHT_DAMAGE, HEAVY_DAMAGE)
- Filter berdasarkan lokasi rak

**Dampak:** Tidak bisa melakukan stock opname atau audit inventaris.

### 16.5 Tidak Ada Riwayat per Eksemplar

**Masalah:** Tidak ada halaman/dialog yang menampilkan riwayat peminjaman untuk satu eksemplar tertentu.

**Dampak:** Tidak bisa melihat siapa saja yang pernah meminjam eksemplar tertentu, berapa kali dipinjam, atau track record kondisi.

### 16.6 Tidak Ada Ubah Kondisi Fisik

**Masalah:** `BookCopyService.updateCondition` (legacy) ada di service layer, tetapi **tidak ada IPC handler** yang mengeksposnya ke UI. Tidak ada tombol/aksi di UI untuk mengubah kondisi eksemplar.

**Dampak:** Kondisi fisik tidak bisa diperbarui setelah pembuatan awal.

### 16.7 Tidak Ada Ubah Lokasi Rak

**Masalah:** Tidak ada fitur untuk mengubah `shelfLocation` setelah eksemplar dibuat.

**Dampak:** Jika buku dipindahkan rak, tidak ada cara untuk memperbarui datanya.

### 16.8 Dual Stack Inconsistency

| Layer | New Stack (`src/main/`) | Legacy Stack (`electron/main/`) |
|-------|------------------------|----------------------------------|
| Repository | ✅ Schema sesuai | ❌ `borrowingItems` |
| Service | ✅ Minimal, hanya findByBarcode | ❌ `borrowingItems` + `inventorySequence` |
| IPC | — (tidak langsung) | ❌ Konek ke service rusak |
| Preload | — | ✅ Interface benar |

**Dampak:** Semua operasi inventaris kecuali scan barcode menggunakan legacy stack yang rusak.

### 16.9 Tidak Ada Validasi Input di IPC

**File:** `electron/ipc/book-copy.ipc.ts:16-20`

Tidak ada validasi input di IPC handler untuk `addCopies` dan `decommissionCopy`. Validasi hanya di service layer (yang juga rusak karena referensi legacy).

### 16.10 Tidak Ada Audit Trail

Tidak ada kolom `createdBy` atau `updatedBy` di model `BookCopy`. Tidak ada log aktivitas untuk perubahan status/kondisi eksemplar.

---

## RINGKASAN ARC

```
┌──────────────────────────────────────────┐
│              InventoryPage.tsx            │
│            (PLACEHOLDER — 8 baris)        │
└──────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────┐
│             BookDetailPage.tsx             │
│  (satu-satunya UI yang menampilkan copy)   │
└──────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────┐
│           BookDetail.tsx (komponen)        │
│  - Tabel daftar eksemplar                 │
│  - Modal tambah eksemplar                 │
│  - Tombol decommission                    │
└──────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────┐
│        electronAPI.bookCopies.*           │
│   (IPC bridge — preload → renderer)       │
│                                            │
│   findByBarcode   → NEW Stack ✅          │
│   findByBookId    → LEGACY Stack ❌       │
│   addCopies       → LEGACY Stack ❌       │
│   decommissionCopy→ LEGACY Stack ❌       │
└──────────────────────────────────────────┘
                     │
                     ▼
┌──────────────┐    ┌──────────────────────┐
│ NEW STACK     │    │   LEGACY STACK        │
│ src/main/     │    │   electron/main/       │
│              │    │                        │
│ ✅ BookCopy  │    │ ❌ BookCopyRepository  │
│   Repository  │    │   (borrowingItems)     │
│ ✅ BookCopy  │    │ ❌ BookCopyService     │
│   Service     │    │   (borrowingItems)     │
│              │    │ ❌ BookService         │
│              │    │   (borrowingItems)     │
│              │    │ ❌ InventoryNumberGen   │
│              │    │   (inventorySequence)   │
└──────────────┘    └──────────────────────┘
```

### BANYAKNYA RUNTIME ERROR: 6 titik

| # | File | Baris | Root Cause |
|---|------|-------|------------|
| 1 | `electron/main/repositories/book-copy.repository.ts` | 10 | `_count.borrowingItems` |
| 2 | `electron/main/repositories/book-copy.repository.ts` | 32 | `_count.borrowingItems` |
| 3 | `electron/main/repositories/book.repository.ts` | 43 | `_count.borrowingItems` |
| 4 | `electron/main/services/book-copy.service.ts` | 40 | `c._count.borrowingItems` |
| 5 | `electron/main/services/book-copy.service.ts` | 115 | `copy._count.borrowingItems` |
| 6 | `electron/main/services/book-copy.service.ts` | 78 | `tx.inventorySequence` |
| 7 | `electron/main/services/inventory-number-generator.ts` | 13 | `tx.inventorySequence.upsert` |
| 8 | `electron/main/services/inventory-number-generator.ts` | 19 | `tx.inventorySequence.update` |
| 9 | `electron/main/services/book.service.ts` | 45 | `c._count.borrowingItems` |
