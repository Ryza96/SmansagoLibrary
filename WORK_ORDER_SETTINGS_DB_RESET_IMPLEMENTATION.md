# WORK ORDER: Settings Database Reset (IMPLEMENTATION REPORT)

## 1. Tujuan

Menyediakan fitur **Reset Database** di halaman Pengaturan (Settings) — operasi satu-klik untuk
menghapus seluruh data transaksional & master (buku, anggota, peminjaman, dsb.) sambil
**mempertahankan data konfigurasi** (Academic Year, Curriculum, Class, Setting, Admin, AdminSession).

## 2. Keputusan Arsitektur (dikonfirmasi)

1. **ResetService di `src/main/` (stack baru)** — SATU PrismaClient (`getPrisma()` singleton), konsisten pola WO-004/IT-1/Report.
2. **Delete order = top-down (child → parent)** — setiap baris child dihapus sebelum parent
   (memuaskan FK `ON DELETE RESTRICT` default), berurutan deterministik.
3. **`InventorySequence` di-reset** — baris pertama (`prefix=INV`, `lastNumber` di-nol-kan) DIPERTAHANKAN
   (agar urutan `INV-000001` baru tidak bentrok dengan PK); baris non-INV lain dihapus.
4. **Protected set = AcademicYear, Curriculum, Class, Setting, Admin, AdminSession** — struktur akademik,
   konfigurasi aplikasi, dan akun admin TIDAK terhapus.
5. **Satu `$transaction` all-or-nothing** — kegagalan di tengah → rollback penuh; tidak ada penghapusan parsial.
6. **No DB reset** — reset memakai mekanisme Prisma `deleteMany` (bukan `DROP TABLE`), sehingga tanpa migration
   dan tanpa mengubah schema; `_prisma_migrations` tidak tersentuh.

## 3. File Baru

| File | Peran |
|------|-------|
| `src/main/services/reset-database.service.ts` | `ResetDatabaseService` — `runTransaction` + `performResetTx` (delete order deterministik) |
| `settings_db_reset_smoke/smoke.ts` | Smoke 58/58 (seed, reset, protected set, idempotent, rollback) |

## 4. File Dimodifikasi

| File | Perubahan |
|------|-----------|
| `electron/ipc/setting.ipc.ts` | +channel `settings:resetDatabase` → `resetDatabaseService.resetDatabase()` |
| `electron/ipc/index.ts` | signature +`resetDatabaseService`, instantiasi handler memakai service |
| `electron/main/bootstrap.ts` | Container +`resetDatabaseService` (bukan setting-only — handler butuh service reset) |
| `electron/preload/setting.preload.ts` | +`settings.resetDatabase()` → `invoke('settings:resetDatabase')` |
| `src/renderer/env.d.ts` | +`resetDatabase(): Promise<{ ok: true }>` |
| `src/pages/SettingsPage.tsx` | blok "Bahaya" + tombol Reset (confirm promise NS-1 → run → toast sukses/error; "Reset Sekarang") |
| `src/utils/labels.ts` | blok `SETTINGS.DANGER*` |

## 5. Delete Order (kontrak smoke)

`borrowDetail → borrow → borrowItem(legacy, 0) → borrowing(legacy, 0) → return(legacy, 0) →
assetEvent → promotionRunItem → promotionRun → memberEnrollment → member → bookCopy → book →
author → publisher → category` lalu **protected set** `academicYear, curriculum, class, setting, admin, adminSession`
dibaca count-nya (dipetakan `{ kind, count }` → objek `Record<string, number>`), terakhir reset `InventorySequence`.

## 6. Validasi

- Smoke `settings_db_reset_smoke` **58/58 PASS** (fresh DB temp, 6 migration):
  - STEP 1: seed 12 tabel transaksional + InventorySequence.lastNumber=42 + protected set
  - STEP 3: reset → 12 tabel = 0; protected set tetap; `InventorySequence.lastNumber=0`, `prefix=INV`
  - STEP 4: idempotent (reset kedua tetap konsisten)
  - STEP 5: rollback all-or-nothing (override `performResetTx` throw setelah deleteMany → book/member/class/setting tetap)
  - STEP 6: reset final tetap menjaga protected set
- Regression `it1_borrow_return` **34/34 PASS** (fresh DB) — jalur borrow/return tidak terganggu.
- `npm run lint` PASS.
- `npm run build` PASS (main 2,018.69 kB · preload 11.27 kB · renderer 1,188.19 kB).
- `prisma migrate diff` = "This is an empty migration." (schema & migration TIDAK berubah).
- Grep bundle: `settings:resetDatabase` = 1 (main) & 1 (preload); renderer `Reset Sekarang` = 1; `resetDatabase()` = 2.

## 7. Catatan

- Konfirmasi reset memakai `useNotification().confirm({ danger: true })` (NS-1); hasil memakai toast — TIDAK ada `alert()`/`confirm()` browser di SettingsPage.
- File legacy electron (borrowing/borrowing-item/return repository) tetap ada & di-deleteMany sebagai no-op (0 baris) — tidak dihapus di WO ini (scope housekeeping terpisah).
