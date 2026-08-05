# NS-1 RELEASE — Notification Foundation

## Deliverable Rilis
Fondasi Notification System v1.0 yang dapat diuji PO di aplikasi. **Belum ada perubahan perilaku halaman** — ini pondasi API yang akan dikonsumsi NS-2.

## Isi Rilis
- Provider global `<NotificationProvider>` di `src/renderer/App.tsx` membungkus router.
- API `useNotification()` → `{ notify.success|error|warning|info, notify.dismiss, notify.dismissAll, confirm }`.
- Toast stack top-right (maks 3, evict tertua, auto-dismiss 3/4/5/6 detik, animasi slide+fade, accessible `aria-live`).
- Confirm dialog modern (icon/title/description/Cancel/Confirm, variant danger, Esc/Tab, focus Cancel).

## Cara Uji PO
1. Jalankan `npm run dev`.
2. Untuk melihat toast/dialog tanpa migrasi halaman, tempel di DevTools console (bukan kode app):
   - `window.dispatchEvent(new CustomEvent('__ns1_probe'))` — tidak ada handler; gunakan instruksi manual di bawah.
3. (Opsional) Jika ingin smoke visual, tambahkan sementara di `DashboardPage` atau halaman mana pun:
   ```tsx
   const { notify, confirm } = useNotification()
   notify.success('Tersimpan!')
   notify.error('Gagal menyimpan data.')
   confirm({ title: 'Hapus?', message: 'Tindakan ini permanen.', danger: true }).then((ok) => notify.info(ok ? 'OK' : 'Batal'))
   ```
   Lalu hapus kode percobaan (di luar scope NS-1, jangan commit).

## Regression
- Smoke ns1: **27/27 PASS**
- `npm run lint`: PASS
- `npm run build`: PASS (main 1,882.54 · preload 9.95 · renderer 1,148.88 kB)
- `prisma migrate diff`: no-drift

## File Rilis
| Tipe | File |
|------|------|
| Config | `src/shared/config/notification.ts` |
| Modul notification | `src/notification/types.ts`, `notification-reducer.ts`, `NotificationContext.tsx`, `ToastItem.tsx`, `ToastViewport.tsx`, `ConfirmDialog.tsx` |
| Mount | `src/renderer/App.tsx` |
| Include | `tsconfig.web.json` |
| Animasi | `src/renderer/assets/styles.css` |
| Smoke | `ns1_notification_smoke/smoke.ts` |
| Laporan | `WORK_ORDER_NS1_IMPLEMENTATION.md`, `NS1_FINAL_REVIEW.md`, `NS1_RELEASE.md`, `AGENTS.md` |

## Status
**DONE — menunggu review PO.** Tidak membuka NS-2.
