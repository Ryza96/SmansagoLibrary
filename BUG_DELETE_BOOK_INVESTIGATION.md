# BUG_DELETE_BOOK_INVESTIGATION.md — Delete Book Error

**Tanggal:** 01 Agustus 2026
**Mode:** READ ONLY — TIDAK ada perubahan kode, staging, atau commit.
**Gejala dilaporkan:**
```
Uncaught (in promise) Error: Error invoking remote method 'books:delete':
AppError: Buku tidak dapat dihapus karena masih memiliki 10 eksemplar.
Console menunjuk BooksPage.tsx:43
```
**Status:** **COMPLETE — ROOT CAUSE TERIDENTIFIKASI**

---

## Root Cause (Ringkas)

1. **Exception dilempar dengan sengaja** oleh business rule: `BookService.deleteBook()` menolak menghapus buku yang masih memiliki `BookCopy` (`electron/main/services/book.service.ts:106-113`).
2. **Renderer tidak menangkap rejection**: `BooksPage.tsx:41` memanggil `await api.books.delete(id)` **tanpa try/catch** → promise reject menjadi **unhandled rejection** → "Uncaught (in promise)".
3. **Pesan diperindah/prefixed oleh Electron**: saat handler main melempar, `ipcRenderer.invoke` mengembalikan promise reject dengan pesan baru `Error invoking remote method '<channel>': <original>`. Karena tidak ada penanganan, pesan mentah itu tampil di console.
4. **Bukan bug business logic** — aturan blokade sudah benar dan konsisten dengan constraint DB `ON DELETE RESTRICT` pada `BookCopy.bookId`.

**Kesimpulan: bug ini 95% masalah UI (error handling hilang) + 5% UX (tidak ada jalur user untuk menyadari aturan). Business rule berfungsi sebagaimana dirancang.**

---

## 1. Code Path Lengkap (Hapus Ditekan → Database)

| # | Lapisan | File:Line | Aksi |
|---|---------|-----------|------|
| 1 | Renderer (tombol) | `src/components/books/BookTable.tsx:58-64` | Tombol `Trash2` → `onClick={() => onDelete(book.id)}` |
| 2 | Renderer (handler) | `src/pages/BooksPage.tsx:39-43` | `handleDelete(id)` → `window.confirm(...)` → `await api.books.delete(id)` |
| 3 | Renderer (api binding) | `BooksPage.tsx:9` | `const api = window.electronAPI` |
| 4 | Preload | `electron/preload/book.preload.ts:10` | `delete: (id) => ipcRenderer.invoke('books:delete', id)` |
| 5 | Type kontrak | `src/renderer/env.d.ts:26` | `books.delete: (id: string) => Promise<boolean>` |
| 6 | IPC (main) | `electron/ipc/book.ipc.ts:10` | `ipcMain.handle('books:delete', async (_e, id) => bookService.deleteBook(id))` |
| 7 | Service | `electron/main/services/book.service.ts:102-117` | `deleteBook(id)` |
| 8 | Repository | `electron/main/repositories/book.repository.ts:75-77` | `countCopies(id)` → `prisma.bookCopy.count({ where: { bookId: id } })` |
| 9 | Service (guard) | `book.service.ts:107-113` | `if (copyCount > 0) throw new AppError(400, 'Validation Error', ...)` |
| 10 | Repository (hapus) | `book.repository.ts:71-73` | `deleteWithAuthors(id)` → `prisma.book.delete` (HANYA bila copyCount === 0) |
| 11 | Database | — | Query Prisma: `book.findUnique` → `bookCopy.count` → (opsional) `book.delete` |

---

## 2. Lokasi Exception Pertama Dilempar

- **File:** `electron/main/services/book.service.ts`
- **Function:** `BookService.deleteBook(id)`
- **Baris:** **108** (blok `throw`), dalam `if (copyCount > 0)` di baris 107:

```ts
102:  async deleteBook(id: string): Promise<boolean> {
103:    const existing = await this.repository.findById(id)
104:    if (!existing) return false
105:
106:    const copyCount = await this.repository.countCopies(id)
107:    if (copyCount > 0) {
108:      throw new AppError(
109:        400,
110:        'Validation Error',
111:        `Buku tidak dapat dihapus karena masih memiliki ${copyCount} eksemplar.`
112:      )
113:    }
114:
115:    await this.repository.deleteWithAuthors(id)
116:    return true
117:  }
```

Nilai `copyCount` = **10** (sesuai pesan error) berasal dari `prisma.bookCopy.count` (repository baris 76).

---

## 3. Apakah Exception Itu AppError?

**Di main process: YA — benar-benar `AppError`.**
- `electron/main/errorHandler.ts:1-10` — `AppError extends Error` dengan properti `statusCode` (400) dan `type` ('Validation Error'), `name = 'AppError'`.

**Di renderer: BUKAN AppError — menjadi `Error` biasa dengan pesan prefixed.**
- Saat promise handler main reject, Electron menangkapnya dan mengirim ke renderer sebagai **error baru** yang pesannya `"Error invoking remote method '<channel>': <pesan-asli>"`.
- Properti terstruktur (`statusCode`, `type`) **TIDAK diserialkan** ke renderer. Renderer hanya menerima string pesan.
- Bukti: console menampilkan `Error invoking remote method 'books:delete': AppError: Buku tidak dapat...` — ini adalah hasil pembungkusan Electron, bukan objek `AppError` asli yang sampai ke renderer.

---

## 4. Business Rule: Sengaja Melarang Delete?

**YA — sengaja, diimplementasikan dan didokumentasikan.**

| Bukti | Lokasi |
|-------|--------|
| Guard eksplisit | `book.service.ts:106-113` — `copyCount > 0` → `throw AppError` |
| Dokumentasi desain | `INVENTORY_DISCOVERY_REPORT.md:358` — "Tidak bisa hapus buku jika masih memiliki eksemplar. Pesan error: 'Buku tidak dapat dihapus karena masih memiliki {count} eksemplar.'" |
| Konsistensi DB (lapisan kedua) | `DATABASE_DISCOVERY_REPORT.md:213` — FK `BookCopy.bookId ON DELETE RESTRICT`; bahkan tanpa guard, Prisma akan menolak delete |
| Kontrak IPC | `SPRINT3_REPORT.md:62` — `books:delete` → `BookService.deleteBook → boolean` |

**Kesimpulan:** Aturan blokade adalah keputusan desain yang benar. Service secara defensif memeriksa jumlah eksemplar sebelum menghapus, sehingga pengguna harus menghapus semua eksemplar terlebih dahulu (di halaman detail buku) sebelum bisa menghapus buku.

---

## 5. Mengapa "Uncaught (in promise)"?

**Penyebab: promise tidak ditangkap (missing try/catch) — bukan karena catch melempar ulang.**

Bukti `BooksPage.tsx:39-43`:
```ts
async function handleDelete(id: string) {
  if (!window.confirm(LABELS.BOOK.CONFIRM_DELETE)) return
  await api.books.delete(id)          // ← line 41: reject TANPA try/catch
  setBooks((prev) => prev.filter((b) => b.id !== id))
}
```

Rantai kegagalan:
1. `ipcRenderer.invoke('books:delete', id)` mengembalikan `Promise` yang **reject** saat handler main melempar `AppError` (IPC layer mengubahnya menjadi error prefixed).
2. `await` di `handleDelete` (BooksPage.tsx:41) menerima rejection **tanpa `try/catch`** → `handleDelete` sendiri menjadi promise rejected.
3. `handleDelete` dipanggil dari `onDelete={handleDelete}` (BooksPage.tsx:92) — tidak ada `.catch()`, tidak ada `ErrorBoundary` (grep `ErrorBoundary` di `src/` = 0 match), React **tidak** menangkap rejection event-handler async.
4. Hasilnya: **unhandled promise rejection** → browser/Electron menampilkan "Uncaught (in promise)".

**Pembanding (pola yang benar sudah ada di codebase):**
- `src/pages/master/AuthorListPage.tsx:46-54` — `try { await api.authors.delete(...) } catch (err: any) { alert(err.message) }`
- `src/components/books/BookDetail.tsx:79-94` — `try { ... } catch { alert(message) }`
- Halaman lain (`InventoryPage.tsx:80`, `ReturnsPage.tsx:30`, `BorrowingsPage.tsx:135`, `SettingsPage.tsx:81`) semuanya punya try/catch.

**`BooksPage.tsx` adalah satu-satunya halaman daftar yang delete-nya tanpa try/catch** → ini akar UI bug.

---

## 6. Apakah Renderer Seharusnya Menampilkan Toast/Dialog/Alert?

**Status saat ini:** Tidak ada infrastruktur notifikasi global (toast/snackbar/ErrorBoundary) di aplikasi. Grep `toast|snackbar|ErrorBoundary` di `src/` = **0 match**.

**Pola yang ada & konsisten di seluruh aplikasi:** `window.alert(err.message)` (lihat AuthorListPage, BookDetail, InventoryPage, dll).

**Rekomendasi (bukan implementasi):**
- **Minimal & konsisten:** ikuti pola existing — `try/catch` + `alert(message)` di `handleDelete`. Tidak butuh komponen baru.
- **Opsional (UX lebih baik):** membangun sistem notifikasi terpusat (toast/snackbar) adalah refactor lintas-aplikasi, di luar scope perbaikan bug ini.
- **Penting:** bila pakai `alert(err.message)` langsung, user akan melihat teks panjang `Error invoking remote method 'books:delete': AppError: Buku tidak dapat...`. Idealnya preload/IPC mengekspos **pesan bersih** (`Buku tidak dapat dihapus karena masih memiliki 10 eksemplar.`) — lihat Minimal Fix Proposal.

---

## 7. UI atau Business Logic?

**Keduanya tersentuh, tetapi akar bug = UI.**

| Aspek | Penilaian | Bukti |
|-------|-----------|-------|
| Business logic | **BENAR** — aturan sengaja & benar | `book.service.ts:106-113`, konsisten FK RESTRICT |
| Error handling UI | **SALAH** — rejection tak ditangkap | `BooksPage.tsx:41` tanpa try/catch |
| Pesan user | **SALAH** — tidak ada feedback; pesan mentah prefixed | Tidak ada handler; Electron prefix |
| UX alur | Gap — user tidak diarahkan untuk menghapus eksemplar dulu | Tidak ada pesan/instruksi di UI |

**Kesimpulan:** Perilaku backend (menolak delete) adalah fitur, bukan bug. Yang bug adalah **renderer tidak mengomunikasikan penolakan itu** — user hanya melihat error console, bukan pesan yang dapat dipahami.

---

## 8. Minimal Fix Proposal (JANGAN DIIMPLEMENTASI)

### Perubahan 1 — `src/pages/BooksPage.tsx` (wajib)
Bungkus panggilan delete dengan try/catch, ikuti pola existing:
```ts
async function handleDelete(id: string) {
  if (!window.confirm(LABELS.BOOK.CONFIRM_DELETE)) return
  try {
    await api.books.delete(id)
    setBooks((prev) => prev.filter((b) => b.id !== id))
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : LABELS.BOOK.DELETE_ERROR
    alert(message)
  }
}
```

### Perubahan 2 — `src/utils/labels.ts` (wajib, di blok `LABELS.BOOK`)
Tambahkan label fallback:
```ts
DELETE_ERROR: 'Gagal menghapus buku.',
```

### Perubahan 3 — Pesan bersih (disarankan; 1 dari 2 opsi)
Agar user tidak melihat prefix Electron:
- **Opsi A (preload, minimal):** di `electron/preload/book.preload.ts`, bungkus invoke dan bersihkan pesan:
  ```ts
  delete: async (id: string) => {
    try {
      return await ipcRenderer.invoke('books:delete', id)
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err)
      const idx = raw.indexOf(': ') === -1 ? -1 : raw.indexOf(': ')
      const clean = idx !== -1 ? raw.slice(raw.indexOf('AppError: ') + 9) : raw
      throw new Error(clean || raw)
    }
  }
  ```
- **Opsi B (main, lebih baik):** membuat wrapper global `ipcMain.handle` yang menangkap `AppError` dan mengirimkan objek `{ statusCode, type, message }` terstruktur, sehingga renderer bisa membaca `message` bersih tanpa parse string. Ini refactor kecil di `electron/ipc/index.ts` (atau helper `registerHandler`).

### Perubahan 4 (opsional, UX) — `BookTable.tsx`
Tidak wajib. Bila ingin mencegah aksi tak berdaya, nonaktifkan tombol Hapus ketika `book.copyCount > 0` (tooltip "Hapus eksemplar terlebih dahulu"). Namun keputusan ini perlu diskusi PO karena mengubah perilaku UI aktif.

### Scope & non-goals
- **TIDAK** mengubah business rule `book.service.ts:106-113` (aturan benar).
- **TIDAK** mengubah repository / DB / schema.
- **TIDAK** menambah infrastruktur toast/snackbar global.
- **TIDAK** menghapus eksemplar secara otomatis saat delete buku.

### Verifikasi setelah fix (nanti)
1. Buka buku ber-eksemplar → Hapus → `alert` menampilkan "Buku tidak dapat dihapus karena masih memiliki 10 eksemplar." (tanpa prefix).
2. Hapus semua eksemplar → Hapus buku → sukses (row hilang, `copyCount === 0`).
3. Console bersih — tidak ada "Uncaught (in promise)".
4. `npm run lint` + `npm run build` PASS.

---

## Lampiran — Bukti Kunci

| Klaim | Bukti |
|-------|-------|
| Tombol delete | `BookTable.tsx:58-64` |
| Handler tanpa try/catch | `BooksPage.tsx:39-43` (khusus line 41) |
| Preload invoke | `book.preload.ts:10` |
| IPC handler | `book.ipc.ts:10` |
| Throw AppError | `book.service.ts:107-113` |
| Def class AppError | `errorHandler.ts:1-10` |
| countCopies | `book.repository.ts:75-77` |
| Pola existing benar | `AuthorListPage.tsx:46-54`, `BookDetail.tsx:79-94` |
| Tidak ada ErrorBoundary/toast/snackbar | grep `src/` = 0 match |
| Business rule terdokumentasi | `INVENTORY_DISCOVERY_REPORT.md:358` |
| FK RESTRICT | `DATABASE_DISCOVERY_REPORT.md:213` |
