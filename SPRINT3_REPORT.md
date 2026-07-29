# Sprint 3 — Laporan Master Buku (Architecture First)

**Project:** APLibrary (Aplikasi Perpustakaan Desktop)  
**Tanggal:** 29 Juli 2026  
**Status:** ✅ SELESAI

---

## 1. Ringkasan

Modul Master Buku selesai dibangun dengan mengikuti arsitektur yang telah ditetapkan: Renderer → IPC → Service → Repository → Prisma → SQLite. DTO pattern mulai diterapkan di Sprint ini.

### Yang Diimplementasikan
- Daftar Buku dengan data table, search client-side, refresh
- Detail Buku dengan informasi lengkap termasuk penulis dan eksemplar
- Tambah Buku (form dengan validasi)
- Edit Buku (reuse form dengan initial data)
- Hapus Buku (confirmation dialog)
- DTO layer (BookListItem, BookDetail, Create, Update)
- Config/Constants untuk navigasi, app info, dan UI labels
- 8 IPC handlers baru untuk operasi buku + reference data

---

## 2. Arsitektur

```
Renderer (BooksPage / BookFormPage / BookDetailPage)
    ↓ IPC (preload/contextBridge)
Main Process (ipcMain handlers)
    ↓
BookService (DTO mapping + orchestrasi)
    ↓
BookRepository (Prisma queries)
    ↓
Prisma ORM → SQLite
```

**Tidak ada Page yang mengakses Repository atau Prisma secara langsung.**

---

## 3. DTOs

| DTO | Lokasi | Field |
|-----|--------|-------|
| `BookListItemDTO` | types/dtos/book.ts | id, title, isbn, categoryName, publisherName, publicationYear, copyCount |
| `BookDetailDTO` | types/dtos/book.ts | id, title, isbn, category, publisher, publicationYear, edition, language, pageCount, description, coverImage, authors[], copies[], createdAt, updatedAt |
| `CreateBookDTO` | types/dtos/book.ts | title, isbn?, categoryId?, publisherId?, publicationYear?, edition?, language?, pageCount?, description?, authorIds[] |
| `UpdateBookDTO` | types/dtos/book.ts | title?, isbn?, categoryId?, publisherId?, publicationYear?, edition?, language?, pageCount?, description?, authorIds[]? |

---

## 4. IPC Channels Baru

| Channel | Arah | Handler |
|---------|------|---------|
| `books:findMany` | Renderer → Main | BookService.getAllBooks → BookListItemDTO[] |
| `books:findById` | Renderer → Main | BookService.getBookById → BookDetailDTO |
| `books:create` | Renderer → Main | BookService.createBook → BookDetailDTO |
| `books:update` | Renderer → Main | BookService.updateBook → BookDetailDTO |
| `books:delete` | Renderer → Main | BookService.deleteBook → boolean |
| `authors:findMany` | Renderer → Main | prisma.author.findMany (untuk multi-select form) |
| `publishers:findMany` | Renderer → Main | prisma.publisher.findMany (untuk dropdown) |
| `categories:findMany` | Renderer → Main | prisma.category.findMany (untuk dropdown) |

---

## 5. Routes

| Route | Page | Deskripsi |
|-------|------|-----------|
| `/books` | BooksPage | Daftar Buku (table, search, toolbar) |
| `/books/new` | BookFormPage | Tambah Buku (form mode create) |
| `/books/:id` | BookDetailPage | Detail Buku |
| `/books/:id/edit` | BookFormPage | Edit Buku (form mode edit) |

---

## 6. Struktur Folder Baru

```
src/renderer/src/
├── config/
│   └── navigation.ts        # Route constants + helpers
├── constants/
│   ├── app.ts               # App-level constants
│   └── labels.ts            # All UI labels (no hardcoded strings)
├── components/
│   └── books/
│       ├── BookTable.tsx     # Data table component
│       ├── BookForm.tsx      # Create/Edit form component
│       └── BookDetail.tsx    # Detail display component
├── pages/
│   ├── BooksPage.tsx         # List page (rewritten)
│   ├── BookDetailPage.tsx    # Detail page (new)
│   └── BookFormPage.tsx      # Create/Edit page (new)
├── routes/
│   └── index.tsx             # +3 book routes
└── types/
    └── dtos/
        └── book.ts           # DTO interfaces
```

---

## 7. File yang Dibuat/Diubah

### File Baru (12 files)
| File | Keterangan |
|------|------------|
| `src/renderer/src/config/navigation.ts` | Route constants & path helpers |
| `src/renderer/src/constants/app.ts` | Nama app, versi, dll |
| `src/renderer/src/constants/labels.ts` | Semua label UI modul buku |
| `src/renderer/src/components/books/BookTable.tsx` | Tabel daftar buku |
| `src/renderer/src/components/books/BookForm.tsx` | Form create/edit buku |
| `src/renderer/src/components/books/BookDetail.tsx` | Detail buku |
| `src/renderer/src/pages/BookDetailPage.tsx` | Halaman detail buku |
| `src/renderer/src/pages/BookFormPage.tsx` | Halaman form buku |
| `src/renderer/src/types/dtos/book.ts` | DTO interfaces |
| `prisma/migrations/...` | Tidak ada migration baru (tidak ada perubahan schema) |

### File Diubah (7 files)
| File | Perubahan |
|------|-----------|
| `src/renderer/src/pages/BooksPage.tsx` | Dari placeholder → data table dengan toolbar |
| `src/renderer/src/routes/index.tsx` | +3 routes buku |
| `src/main/index.ts` | +8 IPC handlers buku & reference data |
| `src/preload/index.ts` | +API books, authors, publishers, categories |
| `src/renderer/src/env.d.ts` | +Type definitions API baru |
| `src/main/repositories/book.repository.ts` | +findManyWithCount, findByIdWithDetails |
| `src/main/services/book.service.ts` | DTO mapping, author connection, full rewrite |

---

## 8. UI Flow

```
/books (Daftar Buku)
├── [Tambah Buku] → /books/new
├── [Search] → filter client-side
├── [Refresh] → reload dari database
├── [👁] → /books/:id (Detail)
├── [✏️] → /books/:id/edit (Edit)
└── [🗑] → confirm → delete

/books/:id (Detail Buku)
├── [← Kembali] → /books
└── [Edit] → /books/:id/edit

/books/new (Tambah Buku)
├── Form: Judul*, ISBN, Kategori, Penerbit, Tahun, Penulis (multi), Deskripsi
└── [Simpan] → validasi → IPC → service → repository → redirect

/books/:id/edit (Edit Buku)
├── Form: (pre-filled)
└── [Simpan] → validasi → IPC → service → repository → redirect
```

---

## 9. Hasil Validasi

| Langkah | Status | Keterangan |
|---------|--------|------------|
| `npm run build` | ✅ | Main (7.80 kB), Preload (1.18 kB), Renderer (487 kB JS, 19.5 kB CSS) |
| `npm run lint` (tsc) | ✅ | No errors |

---

## 10. Catatan Arsitektur

- **DTO Pattern**: Service mengembalikan DTO (plain objects), bukan Prisma Entity. Repository mengembalikan Prisma result, Service memetakan ke DTO.
- **Constants**: Semua label UI baru berasal dari `constants/labels.ts`. Tidak ada hardcode string baru.
- **Form Validation**: Title required, Year must be number. ISBN unique validation akan dilakukan di sisi server pada sprint berikutnya.
- **Multi-select Authors**: Menggunakan checkbox list. Data authors di-fetch dari IPC `authors:findMany`.
- **Copy Count**: Menggunakan Prisma `_count` aggregate di `findManyWithCount`.
- **Delete Cascade**: BookAuthor entries dihapus terlebih dahulu sebelum menghapus Book.

---

**Kesimpulan: Sprint 3 selesai. Modul Master Buku siap untuk dikembangkan lebih lanjut di sprint berikutnya.**

*Laporan ini disusun oleh Project Engineer (OpenCode).*
