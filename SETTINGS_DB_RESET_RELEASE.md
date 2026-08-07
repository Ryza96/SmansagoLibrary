# SETTINGS DATABASE RESET — RELEASE REPORT

## Deliverable

- **Fitur:** Reset Database di halaman Pengaturan — hapus data transaksional & master, pertahankan konfigurasi.
- **Arsitektur:** `ResetDatabaseService` (src/main, single PrismaClient) + `$transaction` all-or-nothing + delete order deterministik.

## Validasi (Release Gate)

| Gate | Hasil |
|------|-------|
| `npm run lint` | PASS |
| `npm run build` | PASS (main 2,018.69 kB · preload 11.27 kB · renderer 1,188.19 kB) |
| Smoke `settings_db_reset_smoke` | 58/58 PASS (fresh DB) |
| Regression `it1_borrow_return` | 34/34 PASS (fresh DB) |
| `prisma migrate diff` | "This is an empty migration." |
| Grep bundle channel | main 1 · preload 1 · renderer `Reset Sekarang` 1 |

## File Diubah

- **Baru:** `src/main/services/reset-database.service.ts`, `settings_db_reset_smoke/smoke.ts`
- **Dimodifikasi:** `electron/ipc/setting.ipc.ts`, `electron/ipc/index.ts`, `electron/main/bootstrap.ts`,
  `electron/preload/setting.preload.ts`, `src/renderer/env.d.ts`, `src/pages/SettingsPage.tsx`, `src/utils/labels.ts`

## Status

**DONE — READY review PO.** Tidak membuka WO berikutnya.
