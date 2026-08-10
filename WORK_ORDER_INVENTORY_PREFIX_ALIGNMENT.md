# WORK ORDER — Alokasi Inventaris & Barcode: Satu Counter, Pasangan INV + Prefix

## Ringkasan

Menyelesaikan implementasi desain baru alokasi nomor inventaris & barcode:
**`inventoryNumber` SELALU `INV-XXXXXX`** (identitas stabil), **`barcode` = `<Setting.inventoryPrefix>-XXXXXX`** — keduanya memakai **SATU counter urutan yang sama**.

Perubahan kontrak allocator dari `string[]` (hanya inventoryNumber) menjadi
`Array<{ inventoryNumber, barcode }>` di **dua** allocator (stack baru `src/main/`
dan legacy `electron/main/`), plus perbaikan reconciliation & skrip migrasi data.

## Perubahan

| File | Perubahan |
|------|-----------|
| `src/main/services/inventory-allocator.ts` | Allocator baru: return pasangan `{inventoryNumber:'INV-…', barcode:'<prefix>-…'}` dari SATU counter; healing needle TETAP `'INV-'`; prefix dibaca dalam transaksi |
| `electron/main/services/inventory-allocator.ts` | Allocator legacy: return pasangan yang sama (berbagi counter, tanpa healing) |
| `electron/main/services/book-copy.service.ts` | Caller `addCopies`: destructure pasangan → `inventoryNumber`/`barcode` |
| `src/main/services/book-import.service.ts` | Caller `createBookWithCopies`: destructure pasangan |
| `src/main/services/database-reconciliation.service.ts` | Reconciliation memakai needle TETAP `'INV-'` pada kolom `inventoryNumber` (independen dari `Setting.inventoryPrefix`); prefix setting hanya nilai kosmetik record sequence |
| `scripts/migrate-inventory-number.ts` | Skrip migrasi data sekali-jalan: `inventoryNumber` ber-prefix lain (mis. `BC-…`) → `INV-<seq>`; kolom `barcode` TIDAK diubah; idempoten + lapor collision/anomaly |
| `inventory_prefix_smoke/smoke.ts` | Di-tulis ulang ke kontrak pasangan (36 assertion) |

## Keputusan desain

1. **Satu counter, dua kolom** — nomor urut tidak di-reset saat prefix berubah;
   pasangan selalu 1:1 per eksemplar dalam satu transaksi.
2. **`barcode` adalah kolom yang memakai prefix konfigurable**; `inventoryNumber`
   tetap `INV-…` agar identitas stabil dan lookup/healing deterministik.
3. **Healing & reconciliation memakai needle TETAP `'INV-'`** pada
   `inventoryNumber` — nilai ber-prefix lain (mis. legacy `BC-…`) TIDAK
   memengaruhi urutan. Prefix setting ditulis ke record sequence hanya
   informasional/kosmetik.
4. **Migrasi data sekali-jalan** (`scripts/migrate-inventory-number.ts`)
   menyeragamkan `inventoryNumber` legacy yang masih `BC-…` → `INV-…` tanpa
   menyentuh `barcode` (label/QR lama tetap valid).

## Validation

- `npm run lint` PASS (tsc node+web).
- `npm run build` PASS (main **2,075.35 kB** · preload 11.64 kB · renderer 1,240.29 kB).
- Smoke `inventory_prefix_smoke` **36/36 PASS** pada fresh DB temp (7 migration):
  - Pasangan BC/PSA/fallback INV/lowercase LWR dari allocator baru & legacy;
  - urutan berlanjut saat ganti prefix (tidak reset);
  - healing membaca max `INV-…` dan mengabaikan `BC-000099`;
  - reconciliation needle INV tetap (`REC-000999` diabaikan, max 99), run ulang tanpa sync;
  - reset database mempertahankan prefix setting (`RST`, lastNumber 0);
  - validasi backend `SettingService.update` (uppercase/trim, maks 10, tolak `@`, `''`, spasi) + `AppError` 400.
- Skrip migrasi diverifikasi pada fresh DB temp: `BC-000200→INV-000200` (barcode `BC-000200` dipertahankan), `BC-000050→INV-000050` (barcode `XYZ-000050` dipertahankan), `INV-000100` tidak disentuh, `A-1X` dilaporkan INVALID (dilewati). Idempoten.

## Eksekusi migrasi pada dev DB

- Backup: `backup/inventory-prefix-20260810/aplibrary.db` (sebelum migrasi).
- Hasil: **totalNonInv 11 · migrated 11 · orphan 0 · collision 0**. Semua
  `inventoryNumber` yang masih ber-prefix lain (`BC-…`) → `INV-<seq>`; kolom
  `barcode` TIDAK diubah. Idempoten (run ulang = 0 perubahan).
- Verifikasi pasca-migrasi: tidak ada `inventoryNumber` non-`INV-` tersisa;
  urutan `InventorySequence` lanjut dari max `INV-…` yang baru.

## Temuan terpisah (TECH DEBT — di luar scope WO ini)

**`borrow_card_uat_smoke/smoke.ts` STALE — 14 FAIL bukan regresi WO ini.**

- Dibuktikan definitif: pada tree bersih persis commit `56be610` (sebelum semua
  perubahan WO ini), smoke menghasilkan **17 PASS / 14 FAIL — IDENTIK** dengan
  working tree. Artinya kegagalan sudah ada SEBELUM sesi ini dimulai.
- Root cause: smoke terakhir di-update ke markup kartu **110×60 landscape**
  (era `09c7910`/`1a90725`/`19243d4`), sedangkan template kartu sudah di-redesign
  ke **A6 Portrait 105×148mm** di commit `8592dd0` (1 kartu = 1 halaman, tabel
  DAFTAR BUKU, tanpa `book-row`/`Jumlah:`/`LANJUTAN`/badge/avatar/monogram).
  Semua 14 assertion yang gagal mengecek markup desain lama; assertion yang
  relevan dengan WO ini (`inventoryNumber tampil :: INV-…`) justru PASS.
- Tidak ada file borrow-card yang diubah WO ini (`borrow-card.service.ts` dan
  `print.service.ts` tidak masuk diff). **DILARANG memperbaiki di WO ini** —
  ditindaklanjuti sebagai WO terpisah (update smoke ke markup A6) setelah review PO.

## Status

DONE — READY review PO. Migrasi dev DB sudah dieksekusi (11 eksemplar) dengan
backup + verifikasi. Smoke WO ini 36/36 PASS; seluruh regression terkait WO ini
hijau (import 48 · it1 34 · eligibility 7 · e2 36 · settings-reset 58 ·
barcode-format 23). `borrow_card_uat` stale = tech debt (lihat Temuan terpisah).

Committed sebagai commit terpisah setelah 2 commit WO sebelumnya
(`dd1c237` barcodeFormat, `56be610` inventoryPrefix).
