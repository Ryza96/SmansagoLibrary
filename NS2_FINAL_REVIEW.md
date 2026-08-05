# NS-2 FINAL REVIEW — PILOT MIGRATION: Peminjaman Buku

## Tujuan Review
Memastikan pilot migration hanya menyentuh **alur sukses peminjaman** sesuai scope PO dan tidak ada regresi.

## Checklist Scope
- [x] **HANYA fitur Peminjaman Buku** — 1 file renderer diubah (`BorrowingsPage.tsx`).
- [x] **HANYA alur sukses setelah peminjaman disimpan** — titik migrasi berada di `handleSave()` setelah `await window.electronAPI.borrowings.create(input)`.
- [x] **alert() sukses diganti notify.success()** — `alert('Transaksi berhasil disimpan.')` → `notify.success('Transaksi berhasil disimpan.')`.
- [x] **Notifikasi sukses lama dihapus** — kotak hijau "Transaksi berhasil disimpan!" + tombol "CETAK BUKTI" legacy (dead code pada happy path, sebab `navigate` berjalan tanpa syarat).
- [x] **ERROR tidak diubah** — 4 `alert()` yang tersisa di BorrowingsPage semuanya jalur error (duplikat barcode, barcode tidak ditemukan, buku tidak tersedia, catch). Diverifikasi grep.
- [x] **CONFIRM tidak diubah** — tidak ada `confirm()` pada alur ini.
- [x] **Halaman lain tidak diubah** — `git diff` hanya berisi `src/pages/BorrowingsPage.tsx` (dan laporan/AGENTS.md).
- [x] **Business logic tidak berubah** — create → navigate → reset form tetap utuh; hanya mekanisme notifikasi yang berubah.

## Validasi PO (dari work order)
| Validasi | Hasil |
|----------|-------|
| Peminjaman berhasil disimpan | tetap — `borrowings.create` unchanged |
| Toast success muncul di TOP RIGHT | `notify.success()` → ToastViewport `fixed top-14 right-4` (NS-1) |
| Toast hilang otomatis setelah 3 detik | durasi success = 3000 ms (`NOTIFICATION_DURATION.success`) |
| Preview / Cetak kartu tetap berjalan | `navigate(receiptPreviewPath(result.id))` + preview `borrowCard`/`borrowCardPdf` tidak berubah |
| Tidak ada perubahan business logic | verified |
| `npm run lint` PASS | PASS |
| `npm run build` PASS | PASS |
| `prisma migrate diff` → No difference | "This is an empty migration." |

## Gate Arsitektur
- Renderer hanya memanggil `useNotification()` dari provider global (NS-1) — tanpa wiring baru, tanpa duplicate notifikasi.
- Tidak menyentuh electron/main, preload, IPC, schema. Bundle main/preload identik baseline = bukti.
- Renderer delta: 1,148.88 kB (NS-1) → 1,147.66 kB (NS-2, hapus dead UI + import Printer).

## Catatan
- Channel legacy `printing:borrowReceipt`/`returnReceipt` dipertahankan (sesuai keputusan desain BORROW_RECEIPT — cleanup opsional di WO terpisah bila PO setuju).
- ReturnsPage masih memakai `alert` untuk sukses ("Buku berhasil dikembalikan.") — target NS berikutnya, **tidak disentuh**.

## Status
**READY — menunggu review Product Owner.** Belum migrasi Return, Master Data, Error, Confirm.
