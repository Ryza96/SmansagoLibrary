# WO-21 Final Review — Import Buku Fix B1 & B2

## Mandat yang Diverifikasi

1. **Atomic per baris (B2):** satu `runTransaction` per baris = AutoCreate + Book + BookCopy. Gagal → rollback total → 0 orphan. Dibuktikan smoke S5b/S5/S7/S6 ("entity baris gagal tidak dibuat") pada fresh DB.
2. **Hasil per-baris (B1):** `ImportResultDTO` dari backend; `failedRows` memuat `{rowNumber, messageKey}` per baris gagal. Dibuktikan smoke semua guard (isbnDuplicate/entityMissing/titleMissing/copyCreateFailed/ambiguous) + invariant `rowNumber` selalu ada.
3. **Tanpa business logic baru di renderer:** renderer hanya me-render DTO dari backend (pola WO-2/WO-20).
4. **Tanpa perubahan schema/migration:** `prisma migrate diff` = "No difference detected".
5. **Regression lint & build:** PASS.

## Checklist Gate

| No | Item | Hasil |
|----|------|-------|
| 1 | Smoke baru fresh DB | 48/48 PASS |
| 2 | `npm run lint` | PASS |
| 3 | `npm run build` | PASS (main 1,818.41 · preload 9.02 · renderer 1,044.59 kB) |
| 4 | `prisma migrate diff` | No difference |
| 5 | Tidak ada referensi `.apply(`/`computeImportResultSummary`/cache `created` di `src/`+`electron/` | 0 match |
| 6 | DB uji temp dibersihkan | DONE |

## Keputusan Teknis

- **`resolveRow(row, tx)` menggantikan `apply()`**: seluruh penulisan entity pindah ke dalam transaksi baris; tidak ada cache antar-baris (pembacaan transaksi terkini mencegah duplikasi).
- **Guard `copyCount`** di service (bukan renderer): 1..100, default 1, error `copyCreateFailed`.
- **Retry P2002 inventory 3×**: race nomor inventori dalam transaksi, retry transaksi penuh baris.

## Status: READY Final Review — menunggu approval PO.
