# SPRINT10 — WO-2 Implementation Report (Revisi)
**Import Commit** — menutup dead-end Import Preview: tombol "Import Buku" memanggil `api.imports.match(canonicalRows)`, loading, pesan sukses/gagal, dan kembali ke daftar buku.

## 1. Ringkasan
Audit UI Sprint 10 (`SPRINT10_WO1_UI_AUDIT.md`) menemukan **dead-end**: halaman `BookImportPreviewPage`
menampilkan pratinjau + validasi, tetapi **tidak ada tombol untuk menyimpan data**; `api.imports.match`
tidak pernah dipanggil di `src/` (grep = 0 match). Backend sudah lengkap (pipeline match → auto-create →
importBooks ter-registrasi via channel IPC `imports:match`).

WO-2 menutup dead-end dengan menambah **tindakan commit** di halaman pratinjau:
klik "Import Buku" → `window.electronAPI.imports.match(validatedWorkbook.canonicalRows)` →
pesan sukses "Import selesai." → tombol "Kembali ke Daftar Buku".

## 2. Revisi (Review PO)
Review PO **menolak** `buildImportSummary()` di renderer dengan alasan:
1. Renderer tidak boleh memiliki business logic import.
2. Renderer tidak boleh menghitung `booksCreated`/`bookCopiesCreated`/`authorsCreated`/
   `publishersCreated`/`categoriesCreated` berdasarkan messageKey.
3. Renderer tidak boleh bergantung pada string seperti `bookImport.*` — itu bukan kontrak sistem.

Revisi yang dilakukan:
- **Dihapus** `buildImportSummary()`, `BOOK_FAILURE_MESSAGE_KEYS`, dan tipe `ImportSummary` dari `src/utils/bookImport.ts`.
- **Dihapus** kartu statistik 5 angka dari UI; status sukses kini ditampilkan **tanpa statistik**
  (per instruksi PO: "Jika backend belum menyediakan summary resmi, cukup tampilkan status sukses").
- **Dipertahankan:** tombol "Import Buku", loading, pemanggilan `api.imports.match(...)`,
  pesan sukses, pesan gagal, tombol "Kembali ke Daftar Buku".
- Backend **TIDAK diubah**, tidak ada kontrak IPC baru; Matching / Validation / AutoCreate tidak tersentuh.
- Label statistik (`SUMMARY_BOOKS`, `SUMMARY_BOOK_COPIES`, `SUMMARY_AUTHORS`, `SUMMARY_PUBLISHERS`,
  `SUMMARY_CATEGORIES`, `SUMMARY_FAILED`) dihapus; `SUMMARY_HINT` diganti nama `COMMIT_HINT`.

## 3. Perubahan Kode (kondisi final)

### File dimodifikasi (3)
| File | Perubahan |
|------|-----------|
| `src/utils/labels.ts` | Blok `IMPORT` + 5 label: `IMPORT_ACTION` ("Import Buku"), `IMPORT_PROCESSING` ("Memproses import..."), `IMPORT_SUCCESS` ("Import selesai."), `IMPORT_ERROR` (pesan gagal), `COMMIT_HINT` (petunjuk sebelum commit), `BACK_TO_BOOKS` ("Kembali ke Daftar Buku"). |
| `src/utils/bookImport.ts` | (revisi) Hanya label/helper yang sudah ada dipertahankan — **tidak ada** `buildImportSummary`/`ImportSummary`/`BOOK_FAILURE_MESSAGE_KEYS`. |
| `src/pages/BookImportPreviewPage.tsx` | State `committing`/`importError`/`importSuccess`; handler `handleCommit()` → `await window.electronAPI.imports.match(validatedWorkbook.canonicalRows)` → `setImportSuccess(true)`; action bar (tombol "Import Buku" disabled + `Hourglass` saat committing); pesan sukses hijau tanpa statistik; pesan error merah; tombol "Kembali" → "Kembali ke Daftar Buku" setelah sukses (`navigate(ROUTES.BOOKS)`). |

### Tidak diubah (per scope / instruksi revisi)
- Validation, Matching Engine, AutoCreateService, BookImportService, BookCopyRepository — tidak tersentuh.
- `electron/ipc/book-import.ipc.ts`, `electron/preload/book-import.preload.ts`, `src/renderer/env.d.ts` — tidak diubah.
- `prisma/schema.prisma` + migrasi — tidak ada perubahan.
- Dependency baru — tidak ada.
- Tidak ada Modal/Stepper/ProgressBar/Toast; loading = state sederhana.

## 4. Detail Teknis

### 4.1 Alur commit (final)
```
BookImportPreviewPage.tsx  "Import Buku" (disabled saat committing)
  → handleCommit()
    → window.electronAPI.imports.match(validatedWorkbook.canonicalRows)
      → preload book-import.preload.ts  imports.match
        → ipcRenderer.invoke('imports:match', canonicalRows)
          → ipc book-import.ipc.ts  ipcMain.handle('imports:match')
            → matchingEngine.match(...) → autoCreateService.apply(...) → bookImportService.importBooks(...)
            → return MatchedWorkbook
  → sukses: setImportSuccess(true)  → pesan "Import selesai." + "Kembali ke Daftar Buku"
  → gagal:  setImportError(...)      → pesan error + tombol retry
```
Renderer **tidak membaca isi** `MatchedWorkbook` — ia hanya memastikan promise resolve (sukses)
atau reject (gagal). Tidak ada statistik yang dihitung di renderer.

### 4.2 Batasan revisi
- Menghitung statistik hasil import adalah tanggung jawab backend bila PO menginginkannya (WO lanjutan,
  di luar scope WO-2 yang melarang perubahan backend).
- Error/gagal import ditampilkan sebagai pesan generik (`IMPORT_ERROR`) tanpa mengurai detail baris.

## 5. Verifikasi
| Gate | Hasil |
|------|-------|
| `npm run lint` (node + web `tsc --noEmit`) | **PASS** |
| `npm run build` (electron-vite build) | **PASS** (main 1,746.12 kB; preload 6.59 kB; renderer 887.52 kB) |

Smoke pipeline `imports:match` dari iterasi sebelumnya **dihapus** bersama `buildImportSummary`
(logika yang diuji tidak lagi ada); verifikasi sekarang = lint + build + code review bahwa tidak ada
sisa referensi `buildImportSummary`/`ImportSummary`/messageKey `bookImport.*` di `src/` (grep = 0 match).

## 6. Rollback
- `src/utils/labels.ts`: hapus 5 label `IMPORT.*` baru dari blok `IMPORT`.
- `src/utils/bookImport.ts`: tidak ada kode WO-2 yang tersisa (revisi menghapus semua tambahan WO-2).
- `src/pages/BookImportPreviewPage.tsx`: hapus state commit + `handleCommit` + action bar + pesan
  sukses/error (kembalikan halaman hanya-pratinjau).
- Seluruh perubahan WO-2 belum di-commit (sama seperti WO lain yang menunggu review PO), rollback manual per file.

## 7. Status
**DONE — READY untuk review PO (revisi).** Berhenti di Architecture Gate; tidak lanjut ke WO berikutnya.
