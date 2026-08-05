# WORK ORDER NS-2 — PILOT MIGRATION: Peminjaman Buku (Implementasi)

## Ringkasan
Pilot migration Notification System: **HANYA satu fitur — Peminjaman Buku**, **HANYA alur sukses setelah peminjaman berhasil disimpan**. Notifikasi sukses legacy (`alert('Transaksi berhasil disimpan.')` + kotak hijau "CETAK BUKTI") diganti menjadi `notify.success()`.

## File Diubah (1 — renderer only)
`src/pages/BorrowingsPage.tsx`

| Perubahan | Detail |
|-----------|--------|
| Import | +`useNotification`; hapus `Printer` dari import lucide (tidak terpakai lagi) |
| Hook | +`const { notify } = useNotification()` |
| State dihapus | `lastSuccessBorrowingId`, `printing` (dead UI legacy) |
| Handler dihapus | `handlePrintReceipt` (memakai channel legacy `printing:borrowReceipt`) |
| Alur sukses | `alert('Transaksi berhasil disimpan.')` → `notify.success('Transaksi berhasil disimpan.')` |
| JSX dihapus | Kotak hijau `lastSuccessBorrowingId && (... "Transaksi berhasil disimpan!" + CETAK BUKTI ...)` |

## Kenapa kotak hijau ikut dihapus
- Kotak hijau adalah **notifikasi sukses lama** (legacy success notification) — menampilkan "Transaksi berhasil disimpan!" dan butuh `lastSuccessBorrowingId` + `handlePrintReceipt`.
- Dalam happy path, `navigate(receiptPreviewPath(result.id))` dieksekusi **tanpa syarat** setelah create sukses → halaman unmount → kotak hijau **tidak pernah terlihat** di alur sukses (dead code). Preview baru (WO-2) sudah menyediakan Cetak/PDF lewat `printing:borrowCard`/`borrowCardPdf`.
- Menghapusnya menghindari **dua sumber notifikasi sukses** (toast + kotak hijau) pada alur yang sama.
- Channel legacy `printing:borrowReceipt` di electron/main/preload **tidak dihapus** — hanya pemanggil renderer-nya yang hilang; jalur legacy tetap utuh (housekeeping channel ada di WO cleanup tersendiri).

## Yang TIDAK Diubah (scope discipline)
- **ERROR**: `alert('Buku sudah dipilih.')`, `alert('Barcode tidak ditemukan.')`, `alert('Buku tidak tersedia.')`, `alert(message)` di catch — semua tetap.
- **CONFIRM**: tidak ada pada alur ini; tidak disentuh.
- **Halaman lain**: ReturnsPage, Master Data, dll. tidak disentuh (masih `alert` — WO berikutnya).
- **Business logic**: `window.electronAPI.borrowings.create(input)` + `navigate(receiptPreviewPath(result.id))` tidak berubah; reset form tetap.
- Schema, migration, IPC, preload, env.d.ts, bootstrap — tidak berubah.

## Validation
| Gate | Hasil |
|------|-------|
| `npm run lint` | PASS |
| `npm run build` | PASS — main 1,882.54 kB · preload 9.95 kB (identik) · renderer **1,147.66 kB** |
| `prisma migrate diff` | "This is an empty migration." (no-drift) |

## Status
**DONE — menunggu review PO.** Belum migrasi Return, Master Data, Error, Confirm.
