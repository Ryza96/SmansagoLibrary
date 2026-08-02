# BUG_DELETE_BOOK_FIX_REPORT.md — Delete Book Error Fix

**Tanggal:** 01 Agustus 2026
**Mode:** IMPLEMENTASI — atas persetujuan Product Owner.
**Status:** **COMPLETE — FIXED & VERIFIED**

---

## Root Cause

1. `src/pages/BooksPage.tsx:41` memanggil `await api.books.delete(id)` **tanpa try/catch** → saat business rule menolak delete (buku masih punya BookCopy), promise reject menjadi **unhandled rejection** → "Uncaught (in promise)".
2. Electron membungkus pesan error main process menjadi `"Error invoking remote method '<channel>': AppError: <message>"` — bila ditampilkan mentah, user melihat prefix teknis.
3. Business rule di `book.service.ts:106-113` **BENAR dan TIDAK diubah**: buku dengan eksemplar tetap ditolak.

---

## Perubahan

### 1. `src/pages/BooksPage.tsx` (Renderer — wajib)
`handleDelete` dibungkus try/catch, mengikuti pola existing di aplikasi (AuthorListPage, BookDetail):
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
- Tidak ada lagi unhandled rejection → console bersih.
- User mendapat feedback via `alert`.

### 2. `electron/preload/book.preload.ts` (IPC — agar pesan bersih)
Semua method `books.*` kini lewat `invokeClean()` yang membuang prefix Electron + `AppError: `:
```ts
async function invokeClean(channel: string, ...args: unknown[]) {
  try {
    return await ipcRenderer.invoke(channel, ...args)
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err)
    const idx = raw.indexOf(': ')
    const clean = idx !== -1 ? raw.slice(idx + 2) : raw
    const marker = 'AppError: '
    const finalMsg = clean.startsWith(marker) ? clean.slice(marker.length) : clean
    throw new Error(finalMsg || raw)
  }
}
```
Hasil yang diterima renderer: **"Buku tidak dapat dihapus karena masih memiliki 10 eksemplar."**

### 3. `src/utils/labels.ts` (Renderer — fallback)
Label baru di blok `LABELS.BOOK`:
```ts
DELETE_ERROR: 'Gagal menghapus buku.',
```
Dipakai bila error bukan instance `Error`.

---

## Validation

| # | Pemeriksaan | Hasil |
|---|-------------|-------|
| 1 | `npm run lint` | **PASS** (tsc node + web, 0 error) |
| 2 | `npm run build` | **PASS** — main 1,753.61 kB · preload 7.05 kB · renderer 898.18 kB |
| 3 | Pesan user bersih (simulasi transformasi) | **PASS** — `"Buku tidak dapat dihapus karena masih memiliki 10 eksemplar."` |
| 4 | Tidak ada `Error invoking` / `AppError` / stack-trace `at <fn>` / newline di pesan | **PASS** (semua False) |
| 5 | Business rule tidak berubah | **PASS** — `book.service.ts`, repository, DB, Prisma **tidak disentuh** |
| 6 | Scope hanya Renderer + IPC | **PASS** — 3 file: `BooksPage.tsx`, `book.preload.ts`, `labels.ts` |

---

## Regression Risk

| Risiko | Tingkat | Mitigasi |
|--------|---------|----------|
| `invokeClean` mengubah pesan error semua method `books.*` (create/update/findById) | RENDAH — hanya memformat ulang `Error.message`; return value sukses tidak berubah | Hanya memangkas prefix; isi pesan asli utuh |
| `alert` mengganggu UX dibanding toast | RENDAH — konsisten dengan seluruh aplikasi (pola existing) | Bukan bagian scope; perbaikan notifikasi global di luar WO ini |
| Error non-Electron (mis. renderer sendiri) | RENDAH — `err.message` ditampilkan apa adanya, fallback label | `DELETE_ERROR` menangani kasus tanpa `message` |
| Business rule blokade eksemplar tetap aktif | TIDAK ADA — service/repo/DB tidak diubah | Aturan `copyCount > 0` tetap di `book.service.ts:106-113` |
| Delete sukses (tanpa eksemplar) tidak terpengaruh | TIDAK ADA — alur sukses `await` + `setBooks` identik | `invokeClean` return sukses diteruskan apa adanya |

---

## Kesimpulan
Bug diperbaiki dengan 3 perubahan minimal (renderer + preload + label). Tidak ada lagi "Uncaught (in promise)", user mendapat pesan jelas **"Buku tidak dapat dihapus karena masih memiliki 10 eksemplar."** tanpa prefix/stack trace, dan business rule tidak berubah. Lint + build PASS.

**Status: COMPLETE — menunggu approval Product Owner.**
