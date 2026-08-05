# NS-2 RELEASE — PILOT MIGRATION: Peminjaman Buku

## Deliverable
Pilot migration Notification System pada **alur sukses Peminjaman Buku** — bukti konsep end-to-end bahwa notifikasi sukses berbasis `notify.success()` bekerja di aplikasi nyata (toast top-right, auto-dismiss 3 detik, koeksistensi dengan navigasi preview).

## File
| File | Perubahan |
|------|-----------|
| `src/pages/BorrowingsPage.tsx` | `alert('Transaksi berhasil disimpan.')` → `notify.success(...)`; hapus kotak hijau legacy + `handlePrintReceipt` + state `lastSuccessBorrowingId`/`printing` + import `Printer` |

## Alur Setelah Migrasi
```
SIM PAN TRANSAKSI
  → borrowings.create(input)          (business logic unchanged)
  → notify.success('Transaksi berhasil disimpan.')   (toast top-right, 3 detik)
  → navigate(receiptPreviewPath(id))  (Preview / Cetak / PDF tetap jalan)
  → reset form
```

## Cara Uji PO
1. `npm run dev`.
2. Buka menu **Peminjaman**.
3. Scan barcode buku → pilih anggota → isi due date → **SIMPAN TRANSAKSI**.
4. Amati: toast hijau "Transaksi berhasil disimpan." muncul di **pojok kanan atas** dan **hilang sendiri setelah ±3 detik**.
5. Halaman pindah ke **Pratinjau Kartu Peminjaman**; tombol Cetak / Simpan PDF tetap berfungsi.
6. Uji jalur error (barcode tidak ditemukan, buku tidak tersedia): tetap `alert` (sesuai scope, belum dimigrasi).

## Regression
- `npm run lint`: PASS
- `npm run build`: PASS (main 1,882.54 · preload 9.95 · renderer 1,147.66 kB)
- `prisma migrate diff`: "This is an empty migration." (no-drift)

## Status
**DONE — menunggu review PO.**
- Belum migrasi **Return** (ReturnsPage sukses masih `alert`).
- Belum migrasi **Master Data**.
- Belum migrasi **Error**.
- Belum migrasi **Confirm**.
