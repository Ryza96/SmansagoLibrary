# Sprint 3.1 — Laporan Architecture Compliance Refactor

**Project:** APLibrary (Aplikasi Perpustakaan Desktop)  
**Tanggal:** 29 Juli 2026  
**Status:** ✅ SELESAI

---

## 1. Ringkasan

Refactor arsitektur telah selesai. Semua pelanggaran layering yang ditemukan di Sprint 3 telah diperbaiki tanpa mengubah perilaku aplikasi, UI, DTO shape, atau IPC contract.

---

## 2. Daftar Perubahan per Work Order

### WORK ORDER 1 — Service Tidak Boleh Mengenal Prisma

**Pelanggaran:** `import { prisma } from '../database'` di BookService.

**Perbaikan:** `book.service.ts` tidak lagi meng-import `prisma`. Service hanya menggunakan method-method dari BookRepository.

**Validasi:** `grep import.*prisma src/main/services/` → hanya `import { Prisma }` (type namespace, bukan client instance). Tidak ada `import { prisma }`.

### WORK ORDER 2 — Repository Menjadi Satu-satunya Layer Prisma

**Pelanggaran:** BookService menggunakan `prisma.bookAuthor.deleteMany`, `prisma.bookAuthor.createMany` secara langsung.

**Perbaikan:** Semua operasi Prisma dipindahkan ke BookRepository dengan method baru:

| Method Baru | Fungsi |
|-------------|--------|
| `createWithAuthors(input)` | Membuat buku + author connections dalam satu query |
| `replaceAuthors(bookId, authorIds)` | Replace semua author (transaction: deleteMany + createMany) |
| `deleteWithAuthors(id)` | Hapus buku + author relations (transaction) |
| `isbnExists(isbn, excludeId?)` | Cek duplikasi ISBN |

**Validasi:** `book.service.ts` tidak mengandung syntax Prisma apapun.

### WORK ORDER 3 — Main Process Tidak Mengakses Prisma

**Pelanggaran:** IPC handler `authors:findMany`, `publishers:findMany`, `categories:findMany` langsung memanggil `prisma.findMany()`.

**Perbaikan:**

| IPC Handler Sebelum | Sesudah |
|--------------------|---------|
| `prisma.author.findMany(...)` | `authorService.getAll()` |
| `prisma.publisher.findMany(...)` | `publisherService.getAll()` |
| `prisma.category.findMany(...)` | `categoryService.getAll()` |

Repositories Author, Publisher, Category juga ditambahkan `orderBy: { name: 'asc' }` untuk menjaga konsistensi hasil.

**Validasi:** `grep prisma\.(author\|publisher\|category\|book\|bookCopy) src/main/index.ts` → 0 matches.

### WORK ORDER 4 — Shared DTO

**Pelanggaran:** DTO berada di `renderer/types/dtos/book/` — hanya bisa diakses renderer.

**Perbaikan:**
- DTO dipindahkan ke `src/shared/dto/book.ts`
- `tsconfig.node.json` dan `tsconfig.web.json` ditambahkan include `src/shared/**/*`
- `src/renderer/src/types/dtos/book.ts` menjadi re-export dari shared
- BookService menggunakan DTO dari shared

**Struktur baru:**
```
src/shared/dto/
└── book.ts          ← DTO interfaces (BookListItemDTO, BookDetailDTO, CreateBookDTO, UpdateBookDTO, SelectOption)
```

### WORK ORDER 5 — ISBN Validation

**Fitur baru:** Validasi ISBN unik sebelum create/update.

**Create:** Jika ISBN sudah digunakan buku lain → throw error.
**Update:** Jika ISBN diubah ke ISBN yang sudah digunakan buku lain → throw error.

**Implementasi:** Validasi dilakukan di BookService melalui `repository.isbnExists()`, bukan mengandalkan error Prisma.

### WORK ORDER 6 — Behavior Preservation

UI, Route, IPC Contract, DTO Shape, Layout, Halaman — **tidak ada perubahan**. Build dan lint lulus.

---

## 3. Dependency Graph (Sebelum vs Sesudah)

### Sebelum Refactor
```
Renderer
    ↓
IPC (→ prisma.author.findMany untuk reference data)
    ↓
BookService (→ import prisma, prisma.bookAuthor.deleteMany)
    ↓
BookRepository
    ↓
Prisma
```

### Sesudah Refactor
```
Renderer
    ↓
IPC (hanya memanggil Service)
    ↓
BookService, AuthorService, PublisherService, CategoryService (tidak kenal Prisma)
    ↓
BookRepository, AuthorRepository, PublisherRepository, CategoryRepository (satu-satunya layer Prisma)
    ↓
Prisma
```

---

## 4. File yang Diubah

| File | Perubahan |
|------|-----------|
| `src/main/services/book.service.ts` | Hapus `import { prisma }`; pindah Prisma ops ke Repository; pakai shared DTO; ISBN validation |
| `src/main/repositories/book.repository.ts` | +createWithAuthors, +replaceAuthors, +deleteWithAuthors, +isbnExists |
| `src/main/index.ts` | +import services; ganti 3 IPC handler dari prisma langsung → service |
| `src/main/repositories/author.repository.ts` | Tambah `orderBy: { name: 'asc' }` di findMany |
| `src/main/repositories/publisher.repository.ts` | Tambah `orderBy: { name: 'asc' }` di findMany |
| `src/main/repositories/category.repository.ts` | Tambah `orderBy: { name: 'asc' }` di findMany |
| `src/shared/dto/book.ts` | **Baru** — DTO interfaces lintas layer |
| `src/renderer/src/types/dtos/book.ts` | Jadi re-export dari shared |
| `tsconfig.node.json` | +include src/shared |
| `tsconfig.web.json` | +include src/shared |

---

## 5. Import Prisma yang Dihapus

| File | Import | Status |
|------|--------|--------|
| `src/main/services/book.service.ts` | `import { prisma } from '../database'` | ✅ Dihapus |
| `src/main/index.ts` | 3x `prisma.author/publisher/category.findMany(...)` | ✅ Dipindah ke Service |

---

## 6. Hasil Validasi

| Langkah | Status |
|---------|--------|
| `npm run build` | ✅ Main (11.5 kB), Preload (1.2 kB), Renderer (487 kB) |
| `npm run lint` (tsc) | ✅ No errors |

---

**Kesimpulan: Sprint 3.1 selesai. Arsitektur sudah sesuai. Seluruh pelanggaran layering telah diperbaiki. Project siap untuk sprint berikutnya.**

*Laporan ini disusun oleh Project Engineer (OpenCode).*
